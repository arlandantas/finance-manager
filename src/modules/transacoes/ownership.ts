import { forbidden } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

// SEC-021 (D-GES-42, DEV-88): lançamento "Só meu" só é alterado (editar, excluir, restaurar, estornar)
// pelo seu DONO. Os demais membros continuam vendo o lançamento, sem ações de escrita.
//
// Definição conservadora (hipótese do Dev, a ratificar):
//  - "Só meu" = DESPESA (`EXPENSE`) com `isSharedExpense = false`. Receita, transferência, acerto e
//    pagamento de fatura não têm o rótulo "Só meu" e seguem como estão.
//  - dono = quem PAGOU (`payerMemberId`); sem pagador, o autor do cadastro.
//  - dono que saiu da família ⇒ lançamento somente leitura para todos (D-PO-92).
//  - quem não pagou não converte despesa dividida em "Só meu" (assertCanMakePersonal).

export const PERSONAL_OWNER_ONLY_CODE = "PERSONAL_OWNER_ONLY";
export const PERSONAL_OWNER_ONLY_MESSAGE =
  'Este lançamento é "Só meu" de outra pessoa. Só quem pagou pode alterá-lo.';

export type OwnershipRow = {
  kind: string;
  isSharedExpense: boolean;
  payerMemberId: string | null;
  authorMemberId: string;
};

export const isPersonalExpense = (row: Pick<OwnershipRow, "kind" | "isSharedExpense">): boolean =>
  row.kind === "EXPENSE" && !row.isSharedExpense;

export const personalOwnerId = (row: Pick<OwnershipRow, "payerMemberId" | "authorMemberId">) =>
  row.payerMemberId ?? row.authorMemberId;

/** Regra pura (usada também pela UI): `ownerRemoved` = o dono já saiu da família (somente leitura). */
export function canWriteTransaction(
  row: OwnershipRow,
  viewer: { memberId: string; role: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
): boolean {
  if (!isPersonalExpense(row)) return true;
  return personalOwnerId(row) === viewer.memberId && !ownerRemoved;
}

/** Recusa (403) a escrita de quem não é o dono de um lançamento "Só meu". */
export async function assertCanWriteTransaction(
  tx: Tx,
  ctx: RequestContext,
  row: OwnershipRow,
): Promise<void> {
  if (!isPersonalExpense(row)) return;
  const ownerId = personalOwnerId(row);
  if (ownerId === ctx.memberId) return;
  const owner = await tx.member.findFirst({
    where: { id: ownerId, familyId: ctx.familyId },
    select: { removedAt: true },
  });
  if (canWriteTransaction(row, ctx, owner?.removedAt != null)) return;
  throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
}

export const PERSONAL_ON_BEHALF_CODE = "PERSONAL_ON_BEHALF_FORBIDDEN";
export const PERSONAL_ON_BEHALF_MESSAGE =
  'Um lançamento "Só meu" só pode ser em seu próprio nome. Para outra pessoa, divida com a família.';

/**
 * D-PO-92 / SEC-025 (D-GES-45): só o pagador ATUAL torna uma despesa dividida "Só meu", e só em seu
 * próprio nome. Quem não é o pagador (nem o autor) também não "assume" o pagamento de uma despesa
 * dividida de outro (segundo caminho do achado: trocar o pagador primeiro, "Só meu" depois).
 */
export function assertCanMakePersonal(
  ctx: RequestContext,
  current: OwnershipRow,
  next: { isSharedExpense?: boolean | undefined; payerMemberId?: string | undefined },
): void {
  if (current.kind !== "EXPENSE") return;
  const currentOwner = personalOwnerId(current);
  const nextPayer = next.payerMemberId ?? currentOwner;
  if (current.isSharedExpense && next.isSharedExpense === false && currentOwner !== ctx.memberId) {
    throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  const willBePersonal =
    next.isSharedExpense === undefined ? !current.isSharedExpense : !next.isSharedExpense;
  if (willBePersonal && nextPayer !== ctx.memberId) {
    // ninguém cria nem entrega um "Só meu" em nome de outro membro (SEC-026c)
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
  if (
    current.isSharedExpense &&
    next.payerMemberId === ctx.memberId &&
    currentOwner !== ctx.memberId &&
    current.authorMemberId !== ctx.memberId
  ) {
    throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
}

/** SEC-026c: criação de despesa "Só meu" só em nome de quem lança. */
export function assertPersonalForSelf(
  ctx: RequestContext,
  input: { isSharedExpense: boolean; payerMemberId: string },
): void {
  if (!input.isSharedExpense && input.payerMemberId !== ctx.memberId) {
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
}

// --- Despesas previstas (SEC-026a/b): "Só meu" = `isSharedExpense = false`; dono = responsável ---

export type PlannedOwnershipRow = { isSharedExpense: boolean; responsibleMemberId: string };

/**
 * SEC-038 (D-GES-48): a mesma regra das despesas (`assertCanMakePersonal`) para previstas e séries. Numa prevista
 * DIVIDIDA, só o responsável atual a torna "Só meu"; quem não é o responsável nem o autor também não se coloca
 * como responsável (segundo caminho: trocar o responsável primeiro, "Só meu" depois). Regra pura (usada pela UI).
 */
export function violatesPlannedCapture(
  viewer: { memberId: string },
  current: PlannedOwnershipRow & { authorMemberId: string },
  next: { isSharedExpense?: boolean | undefined; responsibleMemberId?: string | undefined },
): boolean {
  if (!current.isSharedExpense) return false; // "Só meu" já é só do responsável (assertCanWritePlanned)
  const isOwner = current.responsibleMemberId === viewer.memberId;
  if (next.isSharedExpense === false && !isOwner) return true;
  return (
    next.responsibleMemberId === viewer.memberId &&
    !isOwner &&
    current.authorMemberId !== viewer.memberId
  );
}

export function assertPlannedNoCapture(
  ctx: RequestContext,
  current: PlannedOwnershipRow & { authorMemberId: string },
  next: { isSharedExpense?: boolean | undefined; responsibleMemberId?: string | undefined },
): void {
  if (violatesPlannedCapture(ctx, current, next)) {
    throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
}

/** Regra pura (usada também pela UI) para editar, excluir ou dar baixa numa prevista. */
export function canWritePlanned(
  row: PlannedOwnershipRow,
  viewer: { memberId: string },
  ownerRemoved: boolean,
): boolean {
  if (row.isSharedExpense) return true;
  return row.responsibleMemberId === viewer.memberId && !ownerRemoved;
}

export async function assertCanWritePlanned(
  tx: Tx,
  ctx: RequestContext,
  row: PlannedOwnershipRow,
): Promise<void> {
  if (row.isSharedExpense) return;
  if (row.responsibleMemberId === ctx.memberId) return;
  const owner = await tx.member.findFirst({
    where: { id: row.responsibleMemberId, familyId: ctx.familyId },
    select: { removedAt: true },
  });
  if (canWritePlanned(row, ctx, owner?.removedAt != null)) return;
  throw forbidden(PERSONAL_OWNER_ONLY_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
}

/** Resultado de criar/editar uma prevista (ou série): "Só meu" só em nome de quem age. */
export function assertPlannedResultAllowed(ctx: RequestContext, result: PlannedOwnershipRow): void {
  if (!result.isSharedExpense && result.responsibleMemberId !== ctx.memberId) {
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
}
