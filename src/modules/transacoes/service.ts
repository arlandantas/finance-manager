import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type {
  CategoryDTO,
  CreateTransactionParsed,
  CreateTransactionResponse,
  TransactionDefaults,
  TransactionDTO,
} from "@/modules/transacoes/schemas";

type MemberRow = { id: string; user: { name: string | null; email: string; image: string | null } };

export const memberRefOf = (m: MemberRow): MemberRef => ({
  id: m.id,
  name: m.user.name ?? localPart(m.user.email),
  image: m.user.image,
});

type TxRow = {
  id: string;
  kind: "EXPENSE" | "INCOME" | "OPENING" | "TRANSFER_OUT" | "TRANSFER_IN";
  direction: "CREDIT" | "DEBIT";
  amountInCents: bigint;
  occurredOn: Date;
  description: string;
  note: string | null;
  payerMemberId: string | null;
  authorMemberId: string;
  updatedByMemberId: string | null;
  isSharedExpense: boolean;
  transferGroupId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletionReason: "DELETED" | "UNDONE" | null;
};

/** Monta o DTO de lançamento (SDD-001 §2) a partir da linha e dos mapas já carregados. */
export function toTransactionDTO(
  row: TxRow,
  ctx: {
    account: { id: string; name: string };
    category: { id: string; name: string; icon: string; kind: "EXPENSE" | "INCOME" } | null;
    members: Map<string, MemberRef>;
  },
): TransactionDTO {
  const member = (id: string | null) => (id ? (ctx.members.get(id) ?? null) : null);
  const author = member(row.authorMemberId) ?? {
    id: row.authorMemberId,
    name: "Membro",
    image: null,
  };
  return {
    id: row.id,
    type: row.kind,
    direction: row.direction,
    amountInCents: toCents(row.amountInCents),
    occurredOn: fromDbDate(row.occurredOn),
    description: row.description,
    note: row.note,
    account: ctx.account,
    category: ctx.category,
    payer: member(row.payerMemberId),
    author,
    updatedBy: member(row.updatedByMemberId),
    isSharedExpense: row.isSharedExpense,
    transferGroupId: row.transferGroupId,
    isSettlement: false,
    counterpartAccount: null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deletionReason: row.deletionReason,
  };
}

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

export async function listCategories(
  tx: Tx,
  ctx: RequestContext,
  kind?: "EXPENSE" | "INCOME",
): Promise<{ items: CategoryDTO[] }> {
  const rows = await transacoesRepo(tx, ctx.familyId).listCategories(kind);
  return { items: rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon })) };
}

/** SDD-001 §3: conta do último lançamento do membro; senão a de que é titular; senão a 1ª. */
export async function getDefaults(tx: Tx, ctx: RequestContext): Promise<TransactionDefaults> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const accountId =
    (await repo.lastAccountUsedBy(ctx.memberId)) ??
    (await repo.ownedAccountId(ctx.memberId)) ??
    (await repo.firstAccountId());
  return { accountId, payerMemberId: ctx.memberId, today: todayInFamilyTz(ctx.clock) };
}

/** US-005/US-006 (SDD-001 §4.1): um lançamento = uma linha no ledger + revisão CREATE. */
export async function createTransaction(
  tx: Tx,
  ctx: RequestContext,
  input: CreateTransactionParsed,
): Promise<CreateTransactionResponse> {
  const repo = transacoesRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const occurredOn = input.occurredOn ?? today;
  const payerMemberId = input.payerMemberId ?? ctx.memberId;

  // 2) referências da família
  const account = await repo.findAccount(input.accountId);
  if (!account) throw invalidRef("accountId", "Escolha uma conta");
  const category = await repo.findCategory(input.categoryId);
  if (!category) throw invalidRef("categoryId", "Escolha uma categoria");
  const payer = await repo.findMember(payerMemberId);
  if (!payer) throw invalidRef("payerMemberId", "Membro inválido");

  // 3) tipo x categoria
  if (category.kind !== input.type) {
    throw unprocessable(
      "CATEGORY_KIND_MISMATCH",
      "A categoria não combina com o tipo do lançamento",
      [{ path: "categoryId", message: "A categoria não combina com o tipo do lançamento" }],
    );
  }

  // 4) data não futura
  if (compareDate(occurredOn, today) > 0) {
    const message =
      input.type === "EXPENSE"
        ? "Para contas futuras, use Despesa prevista"
        : "A data da receita não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }

  const isShared = input.type === "EXPENSE" ? input.isSharedExpense : false;
  const description = input.description ?? category.name;
  const row = await repo.insert({
    kind: input.type,
    direction: input.type === "EXPENSE" ? "DEBIT" : "CREDIT",
    accountId: account.id,
    categoryId: category.id,
    amountInCents: input.amountInCents,
    occurredOn,
    description,
    note: input.note ?? null,
    payerMemberId,
    authorMemberId: ctx.memberId,
    isSharedExpense: isShared,
  });

  const dto = toTransactionDTO(row, {
    account,
    category: { id: category.id, name: category.name, icon: category.icon, kind: category.kind },
    members: new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const)),
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
          kind: dto.type,
          accountId: account.id,
          categoryId: category.id,
          amountInCents: dto.amountInCents,
          occurredOn,
          description,
          payerMemberId,
          isSharedExpense: isShared,
        },
      },
    ],
  });
  const balance = (await accountBalances(tx, ctx.familyId, [account.id])).get(account.id) ?? 0;
  return { transaction: dto, account: { id: account.id, balanceInCents: balance } };
}
