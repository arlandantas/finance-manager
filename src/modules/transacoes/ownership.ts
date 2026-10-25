import { forbidden } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";

// SEC-021 (D-GES-42, DEV-88) revisado por D-GES-50 (DEV-120): lançamento "Só meu" é alterado (editar,
// excluir, restaurar, estornar/dar baixa) por quem TEM CONTROLE sobre ele. Os demais membros continuam
// vendo o lançamento, sem ações de escrita.
//
// Definições (SDD-028 §11):
//  - "Só meu" = DESPESA (`EXPENSE`) com `isSharedExpense = false`. Receita, transferência, acerto e
//    pagamento de fatura não têm o rótulo "Só meu" e seguem como estão.
//  - controladores = (1) dono = quem PAGOU (`payerMemberId`; sem pagador, o autor); (2) dono da conta onde
//    o lançamento está (conta de débito ou, na compra no cartão, o dono do cartão); (3) lançador (autor).
//  - dono que saiu da família ⇒ lançamento somente leitura para todos (D-PO-92).
//  - torná-lo "Só meu" (SEC-025/026/038) continua sendo só do pagador/responsável ATUAL
//    (assertCanMakePersonal / violatesPlannedCapture): o controle é sobre o que JÁ é "Só meu".

export const PERSONAL_OWNER_ONLY_CODE = "PERSONAL_OWNER_ONLY";
/** Texto genérico (sem nomes); as recusas de escrita usam `personalWriteMessage` com a lista de quem pode. */
export const PERSONAL_OWNER_ONLY_MESSAGE =
  'Este lançamento é "Só meu". Só quem pagou, o dono da conta e quem o lançou podem alterá-lo.';
/** Recusa de captura: só o pagador/responsável atual torna "Só meu" uma despesa dividida. */
export const PERSONAL_CAPTURE_MESSAGE = 'Só quem pagou pode tornar este lançamento "Só meu".';

export type OwnershipRow = {
  kind: string;
  isSharedExpense: boolean;
  payerMemberId: string | null;
  authorMemberId: string;
  /** Dono da conta (ou do cartão) onde o lançamento está; ausente/nulo = sem dono de conta. */
  accountOwnerMemberId?: string | null | undefined;
};

export const isPersonalExpense = (row: Pick<OwnershipRow, "kind" | "isSharedExpense">): boolean =>
  row.kind === "EXPENSE" && !row.isSharedExpense;

export const personalOwnerId = (row: Pick<OwnershipRow, "payerMemberId" | "authorMemberId">) =>
  row.payerMemberId ?? row.authorMemberId;

/** Quem controla o "Só meu", sem repetição, na ordem: dono (pagador), dono da conta, lançador. */
export function personalControllerIds(
  row: Pick<OwnershipRow, "payerMemberId" | "authorMemberId" | "accountOwnerMemberId">,
): string[] {
  const ids = [personalOwnerId(row), row.accountOwnerMemberId ?? null, row.authorMemberId];
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/** Regra pura (usada também pela UI): `ownerRemoved` = o dono já saiu da família (somente leitura). */
export function canWriteTransaction(
  row: OwnershipRow,
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
): boolean {
  if (!isPersonalExpense(row)) return true;
  if (ownerRemoved) return false;
  return personalControllerIds(row).includes(viewer.memberId);
}

const firstName = (m: { user: { name: string | null; email: string } }) =>
  (m.user.name ?? m.user.email.split("@")[0] ?? "").trim().split(/\s+/)[0] || "Membro";

/** "Só Mariana, Carla e Lucas podem alterar este lançamento." (`suffix`: ex. " (Só meu)" na tela de detalhe). */
export function personalWriteMessage(names: string[], suffix = ""): string {
  if (names.length === 0) return PERSONAL_OWNER_ONLY_MESSAGE;
  const list =
    names.length === 1
      ? (names[0] as string)
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `Só ${list} ${names.length === 1 ? "pode" : "podem"} alterar este lançamento${suffix}.`;
}

/** Primeiros nomes de quem controla, na ordem dos ids (a UI passa os membros ativos da família). */
export function controllerNames(
  ids: string[],
  members: Array<{ id: string; name: string }>,
): string[] {
  return ids.flatMap((id) => {
    const m = members.find((x) => x.id === id);
    return m ? [m.name.trim().split(/\s+/)[0] || m.name] : [];
  });
}

/** Dono da conta ou do cartão (ativo ou não) do lançamento, lido na transação. */
async function accountOwnerOf(
  tx: Tx,
  ctx: RequestContext,
  ref: { accountId?: string | null | undefined; cardId?: string | null | undefined },
): Promise<string | null> {
  if (ref.accountId) {
    const a = await tx.bankAccount.findFirst({
      where: { id: ref.accountId, familyId: ctx.familyId },
      select: { ownerMemberId: true },
    });
    return a?.ownerMemberId ?? null;
  }
  if (ref.cardId) {
    const c = await tx.creditCard.findFirst({
      where: { id: ref.cardId, familyId: ctx.familyId },
      select: { ownerMemberId: true },
    });
    return c?.ownerMemberId ?? null;
  }
  return null;
}

async function deny(tx: Tx, ctx: RequestContext, controllers: string[]): Promise<never> {
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId, id: { in: controllers }, removedAt: null },
    include: { user: { select: { name: true, email: true } } },
  });
  const byId = new Map(members.map((m) => [m.id, firstName(m)] as const));
  const names = controllers.flatMap((id) => (byId.has(id) ? [byId.get(id) as string] : []));
  throw forbidden(personalWriteMessage(names), PERSONAL_OWNER_ONLY_CODE);
}

/** Recusa (403) a escrita de quem não controla um lançamento "Só meu". */
export async function assertCanWriteTransaction(
  tx: Tx,
  ctx: RequestContext,
  row: OwnershipRow & { accountId?: string | null | undefined; cardId?: string | null | undefined },
): Promise<void> {
  if (!isPersonalExpense(row)) return;
  const ownerId = personalOwnerId(row);
  if (ownerId === ctx.memberId) return;
  const owner = await tx.member.findFirst({
    where: { id: ownerId, familyId: ctx.familyId },
    select: { removedAt: true },
  });
  const ownerRemoved = owner?.removedAt != null;
  if (!ownerRemoved && row.authorMemberId === ctx.memberId) return;
  const accountOwnerMemberId =
    row.accountOwnerMemberId !== undefined
      ? row.accountOwnerMemberId
      : await accountOwnerOf(tx, ctx, row);
  const full = { ...row, accountOwnerMemberId };
  if (canWriteTransaction(full, ctx, ownerRemoved)) return;
  await deny(tx, ctx, ownerRemoved ? [] : personalControllerIds(full));
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
    throw forbidden(PERSONAL_CAPTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  const willBePersonal =
    next.isSharedExpense === undefined ? !current.isSharedExpense : !next.isSharedExpense;
  // D-GES-50: quem só controla (dono da conta, lançador) altera o "Só meu" alheio sem mexer no pagador;
  // a trava vale quando o "Só meu" NASCE ou quando o pagador MUDA.
  const newlyPersonal = current.isSharedExpense && next.isSharedExpense === false;
  const payerChanges = nextPayer !== currentOwner;
  if (willBePersonal && nextPayer !== ctx.memberId && (newlyPersonal || payerChanges)) {
    // ninguém cria nem entrega um "Só meu" em nome de outro membro (SEC-026c)
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
  if (
    current.isSharedExpense &&
    next.payerMemberId === ctx.memberId &&
    currentOwner !== ctx.memberId &&
    current.authorMemberId !== ctx.memberId
  ) {
    throw forbidden(PERSONAL_CAPTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
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

export type PlannedOwnershipRow = {
  isSharedExpense: boolean;
  responsibleMemberId: string;
  /** Lançador (autor) da prevista; ausente = só o responsável e o dono da conta controlam. */
  authorMemberId?: string | undefined;
  /** Dono da conta "Pagar com" (quando houver). */
  accountOwnerMemberId?: string | null | undefined;
};

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
    throw forbidden(PERSONAL_CAPTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
}

export function plannedControllerIds(row: PlannedOwnershipRow): string[] {
  const ids = [
    row.responsibleMemberId,
    row.accountOwnerMemberId ?? null,
    row.authorMemberId ?? null,
  ];
  return [...new Set(ids.filter((id): id is string => id !== null && id !== undefined))];
}

/** Regra pura (usada também pela UI) para editar, excluir ou dar baixa numa prevista. */
export function canWritePlanned(
  row: PlannedOwnershipRow,
  viewer: { memberId: string },
  ownerRemoved: boolean,
): boolean {
  if (row.isSharedExpense) return true;
  if (ownerRemoved) return false;
  return plannedControllerIds(row).includes(viewer.memberId);
}

export async function assertCanWritePlanned(
  tx: Tx,
  ctx: RequestContext,
  row: PlannedOwnershipRow & { paymentAccountId?: string | null | undefined },
): Promise<void> {
  if (row.isSharedExpense) return;
  if (row.responsibleMemberId === ctx.memberId) return;
  const owner = await tx.member.findFirst({
    where: { id: row.responsibleMemberId, familyId: ctx.familyId },
    select: { removedAt: true },
  });
  const ownerRemoved = owner?.removedAt != null;
  if (!ownerRemoved && row.authorMemberId === ctx.memberId) return;
  const accountOwnerMemberId =
    row.accountOwnerMemberId !== undefined
      ? row.accountOwnerMemberId
      : await accountOwnerOf(tx, ctx, { accountId: row.paymentAccountId });
  const full = { ...row, accountOwnerMemberId };
  if (canWritePlanned(full, ctx, ownerRemoved)) return;
  await deny(tx, ctx, ownerRemoved ? [] : plannedControllerIds(full));
}

/**
 * Resultado de criar/editar uma prevista (ou série): "Só meu" só em nome de quem age. Numa edição, `current`
 * dispensa a trava quando o "Só meu" já existia com o mesmo responsável (D-GES-50: o dono da conta e o lançador
 * alteram valor e descrição sem virar responsáveis).
 */
export function assertPlannedResultAllowed(
  ctx: RequestContext,
  result: PlannedOwnershipRow,
  current?: PlannedOwnershipRow,
): void {
  if (
    current &&
    !current.isSharedExpense &&
    current.responsibleMemberId === result.responsibleMemberId
  ) {
    return;
  }
  if (!result.isSharedExpense && result.responsibleMemberId !== ctx.memberId) {
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
}
