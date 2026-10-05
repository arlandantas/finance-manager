import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { addDays, compareDate, todayInFamilyTz } from "@/lib/dates";
import type { MemberRef } from "@/lib/schemas";
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

type AccountRow = NonNullable<Awaited<ReturnType<ReturnType<typeof contasRepo>["findById"]>>>;

const DUPLICATE_NAME = "Já existe uma conta com este nome";

export function memberRef(m: {
  id: string;
  user: { name: string | null; email: string; image: string | null };
}): MemberRef {
  return { id: m.id, name: m.user.name ?? localPart(m.user.email), image: m.user.image };
}

function toDTO(
  a: AccountRow,
  balanceInCents: number,
  usageCountByMe = 0,
  neverUsed = false,
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
    neverUsed,
    version: a.version,
    createdAt: a.createdAt.toISOString(),
  };
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
  const items = accounts.map((a) =>
    toDTO(a, balances.get(a.id) ?? 0, usage.get(a.id) ?? 0, unused.has(a.id)),
  );
  // o saldo da família soma só contas ATIVAS (SDD-012 §4.1)
  return {
    items,
    totalBalanceInCents: items
      .filter((a) => !a.archived)
      .reduce((sum, a) => sum + a.balanceInCents, 0),
  };
}

/** US-004 (SDD-004 §4.2): conta + lançamento de abertura na mesma transação. */
export async function createAccount(
  tx: Tx,
  ctx: RequestContext,
  input: CreateAccountInput,
): Promise<AccountDTO> {
  const repo = contasRepo(tx, ctx.familyId);
  const ownerMemberId = input.ownerMemberId ?? ctx.memberId;
  if (!(await repo.memberExists(ownerMemberId))) {
    throw unprocessable("INVALID_REFERENCE", "Titular inválido.", [
      { path: "ownerMemberId", message: "Titular inválido." },
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
    updated = await repo.rename(id, input.name.trim(), input.version);
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
  return toDTO(fresh, balances.get(id) ?? 0);
}
