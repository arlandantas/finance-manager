import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { addDays, compareDate, todayInFamilyTz } from "@/lib/dates";
import type { MemberRef } from "@/lib/schemas";
import { pickNextColor } from "@/modules/contas/colors";
import { recordRevision } from "@/modules/contas/ledger";
import {
  accountBalances,
  neverUsedAccountIds,
  usageCountByMember,
} from "@/modules/contas/ledger-queries";
import { contasRepo } from "@/modules/contas/repo";
import type {
  AccountDTO,
  AccountsResponse,
  CreateAccountInput,
  RenameAccountInput,
} from "@/modules/contas/schemas";
import {
  type MemberRefSource,
  toMemberRef,
  UNLINKED_OWNER_ADMIN_ONLY,
  UNLINKED_OWNER_ADMIN_ONLY_MESSAGE,
} from "@/modules/familia/display-name";

type AccountRow = NonNullable<Awaited<ReturnType<ReturnType<typeof contasRepo>["findById"]>>>;

const DUPLICATE_NAME = "Já existe uma conta com este nome";

export function memberRef(m: MemberRefSource): MemberRef {
  return toMemberRef(m);
}

function toDTO(
  a: AccountRow,
  balanceInCents: number,
  usageCountByMe = 0,
  neverUsed = false,
  payerForCards: Array<{ id: string; name: string }> = [],
): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    institution: a.institution,
    type: a.type,
    owner: memberRef(a.owner),
    balanceInCents,
    usageCountByMe,
    archived: a.archivedAt !== null,
    archivedAt: a.archivedAt?.toISOString() ?? null,
    excludeFromAvailable: a.excludeFromAvailable,
    color: a.color,
    neverUsed,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
    payerForCards,
  };
}

/** US-089 (SDD-030 §3.2): uma consulta; cartões ativos (não arquivados/excluídos) por conta pagadora. */
async function payerCardsByAccount(tx: Tx, familyId: string, ids: string[]) {
  const map = new Map<string, Array<{ id: string; name: string }>>();
  if (ids.length === 0) return map;
  const cards = await tx.creditCard.findMany({
    where: { familyId, paymentAccountId: { in: ids }, archivedAt: null, deletedAt: null },
    select: { id: true, name: true, paymentAccountId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const c of cards) {
    const list = map.get(c.paymentAccountId as string) ?? [];
    list.push({ id: c.id, name: c.name });
    map.set(c.paymentAccountId as string, list);
  }
  return map;
}

export async function listAccounts(
  tx: Tx,
  ctx: RequestContext,
  archived: "false" | "true" | "all" = "false",
): Promise<AccountsResponse> {
  const repo = contasRepo(tx, ctx.familyId);
  const accounts = await repo.list(
    archived === "false" ? "active" : archived === "true" ? "archived" : "all",
  );
  const balances = await accountBalances(tx, ctx.familyId);
  const usage = await usageCountByMember(
    tx,
    ctx.familyId,
    ctx.memberId,
    addDays(todayInFamilyTz(ctx.clock), -90),
  );
  const unused = await neverUsedAccountIds(tx, ctx.familyId);
  const payers = await payerCardsByAccount(
    tx,
    ctx.familyId,
    accounts.map((a) => a.id),
  );
  const items = accounts.map((a) =>
    toDTO(a, balances.get(a.id) ?? 0, usage.get(a.id) ?? 0, unused.has(a.id), payers.get(a.id)),
  );
  // Fonte única (SDD-019 §2): saldo disponível = ativas ∧ ¬reserva; reservas = ativas ∧ reserva.
  const active = items.filter((a) => !a.archived);
  const sum = (xs: AccountDTO[]) => xs.reduce((s, a) => s + a.balanceInCents, 0);
  return {
    items,
    totalBalanceInCents: sum(active.filter((a) => !a.excludeFromAvailable)),
    reservesInCents: sum(active.filter((a) => a.excludeFromAvailable)),
  };
}

/**
 * Saldos de todas as contas da família (ativas, arquivadas e reservas), sem as consultas de uso
 * de `listAccounts`. Fonte do resumo por conta do "A pagar" (SDD-029 §3.3).
 */
export async function listAccountBalances(
  tx: Tx,
  ctx: RequestContext,
): Promise<
  Array<{
    id: string;
    name: string;
    archived: boolean;
    excludeFromAvailable: boolean;
    balanceInCents: number;
  }>
> {
  const accounts = await contasRepo(tx, ctx.familyId).list("all");
  const balances = await accountBalances(tx, ctx.familyId);
  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    archived: a.archivedAt !== null,
    excludeFromAvailable: a.excludeFromAvailable,
    balanceInCents: balances.get(a.id) ?? 0,
  }));
}

/** US-004 (SDD-004 §4.2): conta + lançamento de abertura na mesma transação. */
export async function createAccount(
  tx: Tx,
  ctx: RequestContext,
  input: CreateAccountInput,
): Promise<AccountDTO> {
  const repo = contasRepo(tx, ctx.familyId);
  const ownerMemberId = input.ownerMemberId ?? ctx.memberId;
  const candidate = await repo.ownerCandidate(ownerMemberId);
  if (!candidate) {
    throw unprocessable("INVALID_REFERENCE", "Titular inválido.", [
      { path: "ownerMemberId", message: "Titular inválido." },
    ]);
  }
  // US-093a (D-034-6): titular sem conta só por ADMIN.
  if (candidate.userId == null && ctx.role !== "ADMIN") {
    throw unprocessable(UNLINKED_OWNER_ADMIN_ONLY, UNLINKED_OWNER_ADMIN_ONLY_MESSAGE, [
      { path: "ownerMemberId", message: UNLINKED_OWNER_ADMIN_ONLY_MESSAGE },
    ]);
  }
  const today = todayInFamilyTz(ctx.clock);
  const openingDate = input.openingDate ?? today;
  if (compareDate(openingDate, today) > 0) {
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", "A data de abertura não pode ser futura", [
      { path: "openingDate", message: "A data de abertura não pode ser futura" },
    ]);
  }
  const opening = input.openingBalanceInCents ?? 0;

  let account: AccountRow;
  try {
    account = await repo.insert({
      name: input.name.trim(),
      institution: (input.institution ?? "Outro").trim() || "Outro",
      type: input.type,
      ownerMemberId,
      excludeFromAvailable: input.excludeFromAvailable ?? false,
      color: input.color ?? pickNextColor(await repo.usedColors()),
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_ACCOUNT_NAME", DUPLICATE_NAME);
    throw e;
  }

  const row = await repo.insertOpening({
    accountId: account.id,
    direction: opening >= 0 ? "CREDIT" : "DEBIT",
    amountInCents: Math.abs(opening),
    occurredOn: openingDate,
    authorMemberId: ctx.memberId,
  });
  await recordRevision(tx, {
    familyId: ctx.familyId,
    transactionId: row.id,
    revision: 1,
    action: "CREATE",
    actorMemberId: ctx.memberId,
    changes: [
      {
        field: "*",
        from: null,
        to: {
          kind: "OPENING",
          accountId: account.id,
          direction: row.direction,
          amountInCents: Math.abs(opening),
          occurredOn: openingDate,
        },
      },
    ],
  });
  return toDTO(account, opening, 0, opening === 0);
}

export async function renameAccount(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: RenameAccountInput,
): Promise<AccountDTO> {
  const repo = contasRepo(tx, ctx.familyId);
  const existing = await repo.findById(id);
  if (!existing) throw notFound("Conta não encontrada.");
  if (existing.archivedAt) {
    throw unprocessable("ACCOUNT_ARCHIVED_LOCKED", "Reative a conta para alterá-la");
  }
  let updated: { count: number };
  try {
    updated = await repo.rename(
      id,
      {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.excludeFromAvailable !== undefined
          ? { excludeFromAvailable: input.excludeFromAvailable }
          : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
      input.version,
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("DUPLICATE_ACCOUNT_NAME", DUPLICATE_NAME);
    throw e;
  }
  const fresh = await repo.findById(id);
  if (!fresh) throw notFound("Conta não encontrada.");
  if (updated.count === 0) {
    throw conflict(
      "VERSION_CONFLICT",
      "Esta conta foi alterada por outra pessoa. Recarregue para continuar.",
      {
        currentVersion: fresh.version,
      },
    );
  }
  const balances = await accountBalances(tx, ctx.familyId, [id]);
  const payers = await payerCardsByAccount(tx, ctx.familyId, [id]);
  return toDTO(fresh, balances.get(id) ?? 0, 0, false, payers.get(id));
}
