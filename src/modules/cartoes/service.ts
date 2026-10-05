import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import {
  cardInvoiceSummaries,
  cardsWithInvoices,
  cardsWithTransactions,
  cardUsage,
} from "@/modules/cartoes/queries";
import { cartoesRepo } from "@/modules/cartoes/repo";
import type {
  CardDTO,
  CardsResponse,
  CreateCardParsed,
  UpdateCardParsed,
} from "@/modules/cartoes/schemas";

type CardRow = NonNullable<Awaited<ReturnType<ReturnType<typeof cartoesRepo>["findById"]>>>;

const NOT_FOUND = "Cartão não encontrado.";
const DUPLICATE_NAME = "Já existe um cartão com este nome";
export const CYCLE_LOCKED_MESSAGE =
  "Os dias de fechamento e vencimento não podem ser alterados porque já há compras neste cartão";

const memberRef = (m: {
  id: string;
  removedAt?: Date | null;
  user: { name: string | null; email: string; image: string | null };
}): MemberRef => ({
  id: m.id,
  name: m.user.name ?? localPart(m.user.email),
  image: m.user.image,
  ...(m.removedAt ? { removed: true as const } : {}),
});

/** Monta os DTOs com as consultas derivadas (uso, fatura aberta, faturas pagáveis). */
async function toCardDTOs(tx: Tx, ctx: RequestContext, rows: CardRow[]): Promise<CardDTO[]> {
  const ids = rows.map((r) => r.id);
  const today = todayInFamilyTz(ctx.clock);
  const usage = await cardUsage(tx, ctx.familyId, ids);
  const locked = await cardsWithInvoices(tx, ctx.familyId, ids);
  const usedIds = await cardsWithTransactions(tx, ctx.familyId, ids);
  const invoices = await cardInvoiceSummaries(tx, ctx.familyId, rows, today);
  return rows.map((c) => {
    const used = usage.get(c.id) ?? 0;
    const limit = toCents(c.limitInCents);
    const inv = invoices.get(c.id);
    return {
      id: c.id,
      name: c.name,
      institution: c.institution,
      owner: memberRef(c.owner),
      limitInCents: limit,
      usedInCents: used,
      availableInCents: limit - used,
      closingDay: c.closingDay,
      dueDay: c.dueDay,
      cycleLocked: locked.has(c.id),
      archived: c.archivedAt !== null,
      archivedAt: c.archivedAt?.toISOString() ?? null,
      neverUsed: !usedIds.has(c.id),
      version: c.version,
      createdAt: c.createdAt.toISOString(),
      openInvoice: inv?.open as CardDTO["openInvoice"],
      payableInvoices: inv?.payable ?? [],
    };
  });
}

export async function listCards(
  tx: Tx,
  ctx: RequestContext,
  archived: "false" | "true" | "all" = "false",
): Promise<CardsResponse> {
  const rows = await cartoesRepo(tx, ctx.familyId).list(
    archived === "false" ? "active" : archived === "true" ? "archived" : "all",
  );
  const items = await toCardDTOs(tx, ctx, rows);
  return {
    items,
    totalLimitInCents: items.reduce((s, c) => s + c.limitInCents, 0),
    totalUsedInCents: items.reduce((s, c) => s + c.usedInCents, 0),
  };
}

export async function getCard(tx: Tx, ctx: RequestContext, id: string): Promise<{ card: CardDTO }> {
  const row = await cartoesRepo(tx, ctx.familyId).findById(id);
  if (!row) throw notFound(NOT_FOUND);
  return { card: (await toCardDTOs(tx, ctx, [row]))[0] as CardDTO };
}

/** US-015 (SDD-008 §3.1). */
export async function createCard(
  tx: Tx,
  ctx: RequestContext,
  input: CreateCardParsed,
): Promise<{ card: CardDTO }> {
  const repo = cartoesRepo(tx, ctx.familyId);
  const ownerMemberId = input.ownerMemberId ?? ctx.memberId;
  if (!(await repo.memberExists(ownerMemberId))) {
    throw unprocessable("INVALID_REFERENCE", "Titular inválido.", [
      { path: "ownerMemberId", message: "Titular inválido." },
    ]);
  }
  let row: CardRow;
  try {
    row = await repo.insert({
      name: input.name,
      institution: input.institution,
      ownerMemberId,
      limitInCents: input.limitInCents,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      updatedByMemberId: ctx.memberId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_CARD_NAME", DUPLICATE_NAME);
    throw e;
  }
  return { card: (await toCardDTOs(tx, ctx, [row]))[0] as CardDTO };
}

async function versionConflict(repo: ReturnType<typeof cartoesRepo>, id: string) {
  const fresh = await repo.findById(id);
  if (!fresh) return notFound(NOT_FOUND);
  const by = fresh.updatedByMemberId;
  const member = by ? await repo.member(by) : null;
  const name = member
    ? ((member.user.name ?? localPart(member.user.email)).split(" ")[0] ?? "outra pessoa")
    : "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Este cartão foi alterado por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

/** SDD-008 §4.8: dias travados após a primeira fatura; sem diferença => 200 sem mudar `version`. */
export async function updateCard(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdateCardParsed,
): Promise<{ card: CardDTO }> {
  const repo = cartoesRepo(tx, ctx.familyId);
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  await repo.lockForUpdate(id);
  const row = (await repo.findById(id)) as CardRow;

  if (input.ownerMemberId && !(await repo.memberExists(input.ownerMemberId))) {
    throw unprocessable("INVALID_REFERENCE", "Titular inválido.", [
      { path: "ownerMemberId", message: "Titular inválido." },
    ]);
  }
  const wanted = {
    ...(input.name !== undefined && input.name !== row.name ? { name: input.name } : {}),
    ...(input.institution !== undefined && input.institution !== row.institution
      ? { institution: input.institution }
      : {}),
    ...(input.ownerMemberId !== undefined && input.ownerMemberId !== row.ownerMemberId
      ? { ownerMemberId: input.ownerMemberId }
      : {}),
    ...(input.limitInCents !== undefined && input.limitInCents !== toCents(row.limitInCents)
      ? { limitInCents: input.limitInCents }
      : {}),
    ...(input.closingDay !== undefined && input.closingDay !== row.closingDay
      ? { closingDay: input.closingDay }
      : {}),
    ...(input.dueDay !== undefined && input.dueDay !== row.dueDay ? { dueDay: input.dueDay } : {}),
  };
  if (Object.keys(wanted).length === 0) {
    if (input.version !== row.version) throw await versionConflict(repo, id);
    return { card: (await toCardDTOs(tx, ctx, [row]))[0] as CardDTO };
  }
  if (
    ("closingDay" in wanted || "dueDay" in wanted) &&
    (await cardsWithInvoices(tx, ctx.familyId, [id])).has(id)
  ) {
    throw unprocessable("CYCLE_LOCKED", CYCLE_LOCKED_MESSAGE);
  }
  let res: { count: number };
  try {
    res = await repo.updateVersioned(id, input.version, {
      ...wanted,
      updatedByMemberId: ctx.memberId,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_CARD_NAME", DUPLICATE_NAME);
    throw e;
  }
  if (res.count === 0) throw await versionConflict(repo, id);
  const fresh = (await repo.findById(id)) as CardRow;
  return { card: (await toCardDTOs(tx, ctx, [fresh]))[0] as CardDTO };
}
