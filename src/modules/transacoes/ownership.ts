import { forbidden } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import type { MemberRef } from "@/lib/schemas";
import { shareLockAccounts } from "@/modules/contas/lock";
import { type MemberNameSource, memberFirstName, samePerson } from "@/modules/familia/display-name";

// SEC-021 (D-GES-42, DEV-88) revisado por D-GES-50 (DEV-120): lançamento "Só meu" é alterado (editar,
// excluir, restaurar, estornar/dar baixa) por quem TEM CONTROLE sobre ele. Os demais membros continuam
// vendo o lançamento, sem ações de escrita.
//
// Definições (SDD-028 §11):
//  - "Só meu" = DESPESA (`EXPENSE`) com `isSharedExpense = false`. Receita, transferência, acerto e
//    pagamento de fatura não têm o rótulo "Só meu" e seguem como estão.
//  - controladores = (1) dono = quem PAGOU (`payerMemberId`; sem pagador, o autor); (2) dono da conta onde
//    o lançamento está (conta de débito ou, na compra no cartão, o dono do cartão); (3) lançador (autor).
//  - dono que saiu da família ⇒ lançamento somente leitura, EXCETO para o Administrador atual (D-GES-52), que
//    tem PODERES PLENOS (D-GES-55): também muda divisão, conta e "Pagar com". Só ele e só quando o dono é
//    ex-membro (`isAdminOverRemovedOwner`). D-GES-59: o PAGADOR/responsável de ex-membro que não voltou é
//    IMUTÁVEL para todos (inclusive o Admin; `violatesGonePayerLock`), em "Só meu" e em dividida.
//  - quem só controla (não é o dono) NÃO muda divisão, pagador/responsável, conta nem "Pagar com" e não
//    assume o pagamento (D-GES-53, SEC-043/044).
//  - torná-lo "Só meu" (SEC-025/026/038) continua sendo só do pagador/responsável ATUAL
//    (assertCanMakePersonal / violatesPlannedCapture): o controle é sobre o que JÁ é "Só meu".

export const PERSONAL_OWNER_ONLY_CODE = "PERSONAL_OWNER_ONLY";
/** Texto genérico (sem nomes); as recusas de escrita usam `personalWriteMessage` com a lista de quem pode. */
export const PERSONAL_OWNER_ONLY_MESSAGE =
  'Este lançamento é "Só meu". Só quem pagou, o dono da conta e quem o lançou podem alterá-lo.';
/** Recusa de captura: só o pagador/responsável atual torna "Só meu" uma despesa dividida. */
export const PERSONAL_CAPTURE_MESSAGE = 'Só quem pagou pode tornar este lançamento "Só meu".';
/** SEC-043/044: quem só controla não muda divisão, pagador, conta nem "Pagar com" (nem assume o pagamento). */
export const PERSONAL_STRUCTURE_MESSAGE =
  "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento.";
/**
 * SEC-048/051 (D-GES-57/59): o pagador/responsável de uma despesa paga por EX-MEMBRO que não voltou à família é
 * imutável para todos, inclusive o Administrador ("Só meu" ou dividida). Só quem voltou (SEC-049) o altera.
 */
export const GONE_PAYER_LOCKED_MESSAGE =
  "O pagador é um ex-membro e não pode ser alterado. Para outro pagador, exclua e lance de novo.";

/** D-GES-59: a baixa da prevista de ex-membro é paga (e fica no nome de) quem a realiza. */
export const GONE_PAYER_BAIXA_MESSAGE =
  "O responsável é um ex-membro: a baixa é paga em nome de quem a realiza.";

/** Regra pura (também usada pela UI): trocar o pagador/responsável atual de ex-membro sem retorno é proibido. */
export function violatesGonePayerLock(
  currentPayerId: string,
  nextPayerId: string | undefined,
  payerGone: boolean,
): boolean {
  return payerGone && nextPayerId !== undefined && nextPayerId !== currentPayerId;
}

/**
 * US-093b (SDD-034 §4.3, SEC-059a): pagador/responsável PARA ou DE membro sem conta só pelo lançador (autor) ou pelo
 * Administrador, e o Administrador nunca se põe no lugar do sem conta (a menos que seja o autor). Regra pura (UI).
 */
export const UNLINKED_PAYER_CODE = "UNLINKED_PAYER_FORBIDDEN";
export const UNLINKED_PAYER_MESSAGE =
  "Apenas quem lançou ou o Administrador pode definir este pagador.";
export const UNLINKED_PAYER_SELF_MESSAGE =
  "Você não pode se colocar como pagador no lugar de quem não tem acesso ao app. Escolha outro membro.";

export function violatesUnlinkedPayerChange(
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  current: { payerId: string; authorMemberId?: string | undefined },
  nextPayerId: string | undefined,
  flags: { currentUnlinked: boolean; nextUnlinked: boolean },
): false | "NOT_AUTHOR" | "ADMIN_SELF" {
  if (nextPayerId === undefined || nextPayerId === current.payerId) return false;
  if (!flags.currentUnlinked && !flags.nextUnlinked) return false; // regras atuais (D-GES-47, SEC-025/026)
  if (current.authorMemberId === viewer.memberId) return false; // Lanç: correção do que lançou
  if (viewer.role === "ADMIN") return nextPayerId === viewer.memberId ? "ADMIN_SELF" : false;
  return "NOT_AUTHOR";
}

/** Lança o 403 da regra acima. */
function assertUnlinkedPayerChange(violation: false | "NOT_AUTHOR" | "ADMIN_SELF"): void {
  if (violation === "NOT_AUTHOR") throw forbidden(UNLINKED_PAYER_MESSAGE, UNLINKED_PAYER_CODE);
  if (violation === "ADMIN_SELF") throw forbidden(UNLINKED_PAYER_SELF_MESSAGE, UNLINKED_PAYER_CODE);
}

/** Membro ATIVO da família sem conta? (novo pagador/responsável; sem `FOR SHARE`: ver SDD-034 §4.3) */
export async function isActiveUnlinked(
  tx: Tx,
  ctx: RequestContext,
  memberId: string | undefined,
): Promise<boolean> {
  if (!memberId) return false;
  const m = await tx.member.findFirst({
    where: { id: memberId, familyId: ctx.familyId, removedAt: null },
    select: { userId: true },
  });
  return m !== null && m.userId == null;
}

export type OwnershipRow = {
  kind: string;
  isSharedExpense: boolean;
  payerMemberId: string | null;
  authorMemberId: string;
  /** Dono da conta (ou do cartão) onde o lançamento está; ausente/nulo = sem dono de conta. */
  accountOwnerMemberId?: string | null | undefined;
  /** Conta de débito (para detectar troca de conta por quem só controla). */
  accountId?: string | null | undefined;
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

/** D-GES-55/59: pode alterar divisão, conta e "Pagar com"? (o pagador de ex-membro é imutável, D-GES-59; regra pura, usada pela UI) */
export function canChangeStructure(
  ownerId: string,
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
  ownerUnlinked = false,
): boolean {
  return (
    ownerId === viewer.memberId || ((ownerRemoved || ownerUnlinked) && viewer.role === "ADMIN")
  );
}

/**
 * D-GES-55: o Administrador ATUAL, quando o dono (pagador/responsável) do "Só meu" é ex-membro, tem poderes plenos.
 * Lido na transação; o ator que já é o dono não precisa disso.
 */
export async function isAdminOverRemovedOwner(
  tx: Tx,
  ctx: RequestContext,
  ownerId: string,
): Promise<boolean> {
  if (ctx.role !== "ADMIN") return false;
  return (await ownerStanding(tx, ctx, ownerId)).ownerRemoved;
}

/**
 * SEC-049 (D-GES-57): o "dono" é a PESSOA, não o vínculo. Quem sai e volta por convite ganha um vínculo novo; o
 * "Só meu" antigo continua apontando o vínculo removido, mas é do mesmo usuário. Lido na transação e sempre
 * filtrado por `familyId` (vínculos do usuário em outras famílias não contam).
 *  - `ownerIsActor`: o dono é o próprio ator (vínculo atual ou vínculo antigo do mesmo usuário): age como dono.
 *  - `ownerRemoved`: o dono saiu E o usuário dele não tem vínculo ativo na família: só aí vale a regra do ex-membro.
 */
export type OwnerStanding = {
  ownerIsActor: boolean;
  ownerRemoved: boolean;
  /** US-093b (ADR-033 §5): dono ATIVO sem conta (`userId` nulo): o Administrador é o tutor dele. */
  ownerUnlinked: boolean;
};

/**
 * Terceiro estado (US-093b, SDD-034 §4.1): `ownerUnlinked` = dono ativo e sem conta, lido com `FOR SHARE` (SEC-066b).
 * O aceite do convite (094b) faz `UPDATE members`, que conflita com esta trava: se ele já gravou e ainda não
 * confirmou, esta leitura espera e, em READ COMMITTED, relê a versão confirmada (com `userId`). A trava dura até o
 * commit desta escrita. Ordem de travas: `lockFamilySplit` (primeira) ➔ conta/cartão ➔ esta linha.
 */
export async function ownerStanding(
  tx: Tx,
  ctx: RequestContext,
  ownerId: string,
  /** Contas do item: travadas (FOR SHARE) ANTES do dono, na ordem do `removal.ts` (conta ➔ membro). */
  accountIds: Array<string | null | undefined> = [],
): Promise<OwnerStanding> {
  await shareLockAccounts(tx, ctx.familyId, accountIds);
  const none = { ownerIsActor: false, ownerRemoved: false, ownerUnlinked: false };
  if (ownerId === ctx.memberId) return { ...none, ownerIsActor: true };
  const [owner] = await tx.$queryRaw<Array<{ removedAt: Date | null; userId: string | null }>>`
    SELECT "removedAt", "userId" FROM members
    WHERE id = ${ownerId}::uuid AND "familyId" = ${ctx.familyId}::uuid
    FOR SHARE`;
  if (!owner) return none;
  if (owner.removedAt == null) return { ...none, ownerUnlinked: owner.userId == null };
  // US-092a (SEC-058): sem conta nunca "volta" nem é o ator; `userId: null` no `where` casaria QUALQUER cadastro ativo
  if (owner.userId == null) return { ...none, ownerRemoved: true };
  if (samePerson(owner.userId, ctx.userId)) return { ...none, ownerIsActor: true };
  const returned = await tx.member.findFirst({
    where: { familyId: ctx.familyId, userId: owner.userId, removedAt: null },
    select: { id: true },
  });
  return { ...none, ownerRemoved: returned == null };
}

/** Admin sobre dono ex-membro (D-GES-52/55) OU sobre dono sem conta ativo (ADR-033 §5, tutor). */
export const adminFullPower = (ctx: Pick<RequestContext, "role">, s: OwnerStanding): boolean =>
  ctx.role === "ADMIN" && (s.ownerRemoved || s.ownerUnlinked);

/** SEC-049: marca (`activeId`) o vínculo removido cujo usuário voltou à família, para a UI tratá-lo como o mesmo dono. */
export function memberRefsWithReturn<
  R extends {
    id: string;
    userId?: string | null | undefined;
    removedAt?: Date | null | undefined;
  },
>(rows: R[], toRef: (row: R) => MemberRef): Map<string, MemberRef> {
  const activeByUser = new Map(
    rows.filter((m) => !m.removedAt && m.userId).map((m) => [m.userId as string, m.id] as const),
  );
  return new Map(
    rows.map((m) => {
      const ref = toRef(m);
      const activeId = m.removedAt && m.userId ? activeByUser.get(m.userId) : undefined;
      return [m.id, activeId ? { ...ref, activeId } : ref] as const;
    }),
  );
}

/** Regra pura da UI: o vínculo removido que voltou (`activeId`) é o mesmo dono; sem `activeId`, é ex-membro. */
export function effectiveOwner(
  ref: { id: string; removed?: true | undefined; activeId?: string | undefined } | null | undefined,
): { id: string | null; removed: boolean } {
  if (!ref) return { id: null, removed: false };
  if (ref.removed && ref.activeId) return { id: ref.activeId, removed: false };
  return { id: ref.id, removed: ref.removed === true };
}

/** Regra pura da UI (US-093b): o `MemberRef` é de membro ATIVO sem conta (o Administrador é o tutor dele). */
export const isUnlinkedActive = (
  ref: { unlinked?: true | undefined; removed?: true | undefined } | null | undefined,
): boolean => ref?.unlinked === true && ref.removed !== true;

/** Regra pura (usada também pela UI): `ownerRemoved` = o dono já saiu da família (somente leitura). */
export function canWriteTransaction(
  row: OwnershipRow,
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
  ownerUnlinked = false,
): boolean {
  if (!isPersonalExpense(row)) return true;
  if (ownerRemoved) return viewer.role === "ADMIN"; // D-GES-52
  if (ownerUnlinked && viewer.role === "ADMIN") return true; // US-093b: tutor do dono sem conta
  return personalControllerIds(row).includes(viewer.memberId);
}

const firstName = (m: MemberNameSource) => memberFirstName(m).trim() || "Membro";

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
  members: Array<{ id: string; name: string; unlinked?: true | undefined }>,
  opts: { adminCan?: boolean } = {},
): string[] {
  const names = ids.flatMap((id) => {
    const m = members.find((x) => x.id === id);
    // US-093b: quem não tem conta não aparece na lista de quem pode alterar (não tem como)
    return m && !m.unlinked ? [m.name.trim().split(/\s+/)[0] || m.name] : [];
  });
  return opts.adminCan ? [...names, ADMIN_CONTROLLER_LABEL] : names;
}

/** US-093b: no "Só meu" de quem não tem conta, "um Administrador" entra na lista de quem pode alterar. */
export const ADMIN_CONTROLLER_LABEL = "um Administrador";

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

async function deny(
  tx: Tx,
  ctx: RequestContext,
  controllers: string[],
  opts: { adminCan?: boolean } = {},
): Promise<never> {
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId, id: { in: controllers }, removedAt: null },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { name: true, email: true, deletedAt: true } },
    },
  });
  // US-093b (SDD-034 §4.4): controlador sem conta não entra na lista (não tem acesso ao app)
  const byId = new Map(
    members.filter((m) => m.userId != null).map((m) => [m.id, firstName(m)] as const),
  );
  const names = controllers.flatMap((id) => (byId.has(id) ? [byId.get(id) as string] : []));
  if (opts.adminCan) names.push(ADMIN_CONTROLLER_LABEL);
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
  const { ownerIsActor, ownerRemoved, ownerUnlinked } = await ownerStanding(tx, ctx, ownerId, [
    row.accountId,
  ]); // SEC-049
  if (ownerIsActor) return;
  if (!ownerRemoved && row.authorMemberId === ctx.memberId) return;
  if (ownerRemoved && ctx.role === "ADMIN") return; // D-GES-52
  if (ownerUnlinked && ctx.role === "ADMIN") return; // US-093b: tutor
  const accountOwnerMemberId =
    row.accountOwnerMemberId !== undefined
      ? row.accountOwnerMemberId
      : await accountOwnerOf(tx, ctx, row);
  const full = { ...row, accountOwnerMemberId };
  if (canWriteTransaction(full, ctx, ownerRemoved, ownerUnlinked)) return;
  await deny(tx, ctx, ownerRemoved ? [] : personalControllerIds(full), { adminCan: ownerUnlinked });
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
  next: {
    isSharedExpense?: boolean | undefined;
    payerMemberId?: string | undefined;
    accountId?: string | undefined;
  },
  opts: {
    fullPower?: boolean;
    ownerIsActor?: boolean;
    payerGone?: boolean;
    /** US-093b: dono atual / novo pagador sem conta (lidos pelo chamador na transação). */
    unlinked?: { currentUnlinked: boolean; nextUnlinked: boolean };
  } = {},
): void {
  if (current.kind !== "EXPENSE") return;
  const currentOwner = personalOwnerId(current);
  // SEC-051 (D-GES-59): pagador ex-membro (sem retorno) é imutável para todos, em qualquer pedido
  if (violatesGonePayerLock(currentOwner, next.payerMemberId, opts.payerGone === true)) {
    throw forbidden(GONE_PAYER_LOCKED_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  // US-093b (SEC-059a): pagador para/de sem conta só pelo lançador ou Administrador (nunca para si, se Admin)
  if (opts.unlinked) {
    assertUnlinkedPayerChange(
      violatesUnlinkedPayerChange(
        ctx,
        { payerId: currentOwner, authorMemberId: current.authorMemberId },
        next.payerMemberId,
        opts.unlinked,
      ),
    );
  }
  // SEC-049: quem voltou à família é o dono do "Só meu" antigo, ainda que o registro aponte o vínculo antigo
  const isOwner = currentOwner === ctx.memberId || opts.ownerIsActor === true;
  // SEC-043/044: num "Só meu" que NÃO é seu, quem só controla altera valor, data, descrição, categoria e
  // observação, mas não a divisão, o pagador (nem "assume" o pagamento) nem a conta. Exceção (D-GES-55): o
  // Administrador atual sobre o "Só meu" de ex-membro (`fullPower`).
  if (!current.isSharedExpense && !isOwner && !opts.fullPower) {
    const changesDivision = next.isSharedExpense === true;
    const changesPayer = next.payerMemberId !== undefined && next.payerMemberId !== currentOwner;
    const changesAccount =
      next.accountId !== undefined &&
      current.accountId !== undefined &&
      next.accountId !== current.accountId;
    if (changesDivision || changesPayer || changesAccount) {
      throw forbidden(PERSONAL_STRUCTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
    }
  }
  const nextPayer = next.payerMemberId ?? currentOwner;
  if (current.isSharedExpense && next.isSharedExpense === false && !isOwner) {
    throw forbidden(PERSONAL_CAPTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  const willBePersonal =
    next.isSharedExpense === undefined ? !current.isSharedExpense : !next.isSharedExpense;
  // a trava vale quando o "Só meu" NASCE ou quando o pagador MUDA (o dono entrega a outro).
  const newlyPersonal = current.isSharedExpense && next.isSharedExpense === false;
  const payerChanges = nextPayer !== currentOwner;
  if (willBePersonal && nextPayer !== ctx.memberId && (newlyPersonal || payerChanges)) {
    // ninguém cria nem entrega um "Só meu" em nome de outro membro (SEC-026c)
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
  if (
    current.isSharedExpense &&
    next.payerMemberId === ctx.memberId &&
    !isOwner &&
    current.authorMemberId !== ctx.memberId
  ) {
    throw forbidden(PERSONAL_CAPTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
}

/**
 * SEC-026c: criação de despesa "Só meu" só em nome de quem lança. Exceção (US-093b, SDD-034 §4.2, SEC-066b/067): o
 * ADMINISTRADOR cria em nome de dono ATIVO sem conta (lido com `FOR SHARE` na mesma transação); nunca pelo
 * assistente/MCP (`opts.assistant`) e só na CRIAÇÃO.
 */
export async function assertPersonalForSelf(
  tx: Tx,
  ctx: RequestContext,
  input: { isSharedExpense: boolean; payerMemberId: string },
  opts: { assistant?: unknown } = {},
): Promise<void> {
  if (input.isSharedExpense || input.payerMemberId === ctx.memberId) return;
  if (ctx.role === "ADMIN" && !opts.assistant) {
    const s = await ownerStanding(tx, ctx, input.payerMemberId);
    if (s.ownerUnlinked) return; // ADR-033 §5
  }
  throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
}

// --- Despesas previstas (SEC-026a/b): "Só meu" = `isSharedExpense = false`; dono = responsável ---

export type PlannedOwnershipRow = {
  isSharedExpense: boolean;
  responsibleMemberId: string;
  /** Lançador (autor) da prevista; ausente = só o responsável e o dono da conta controlam. */
  authorMemberId?: string | undefined;
  /** Dono da conta "Pagar com" (quando houver). */
  accountOwnerMemberId?: string | null | undefined;
  /** Conta "Pagar com" (para detectar troca por quem só controla). */
  paymentAccountId?: string | null | undefined;
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
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  ownerRemoved: boolean,
  ownerUnlinked = false,
): boolean {
  if (row.isSharedExpense) return true;
  if (ownerRemoved) return viewer.role === "ADMIN"; // D-GES-52
  if (ownerUnlinked && viewer.role === "ADMIN") return true; // US-093b: tutor
  return plannedControllerIds(row).includes(viewer.memberId);
}

/** Decisão (sem lançar) de escrita numa prevista; `controllers` = quem pode, para a mensagem do 403. */
export async function plannedWriteDecision(
  tx: Tx,
  ctx: RequestContext,
  row: PlannedOwnershipRow,
): Promise<{ allowed: boolean; controllers: string[]; adminCan?: boolean }> {
  if (row.isSharedExpense || row.responsibleMemberId === ctx.memberId) {
    return { allowed: true, controllers: [] };
  }
  const { ownerIsActor, ownerRemoved, ownerUnlinked } = await ownerStanding(
    tx,
    ctx,
    row.responsibleMemberId,
    [row.paymentAccountId],
  ); // SEC-049
  if (ownerIsActor) return { allowed: true, controllers: [] };
  if (!ownerRemoved && row.authorMemberId === ctx.memberId) {
    return { allowed: true, controllers: [] };
  }
  if (ownerRemoved && ctx.role === "ADMIN") return { allowed: true, controllers: [] }; // D-GES-52
  if (ownerUnlinked && ctx.role === "ADMIN") return { allowed: true, controllers: [] }; // US-093b: tutor
  const accountOwnerMemberId =
    row.accountOwnerMemberId !== undefined
      ? row.accountOwnerMemberId
      : await accountOwnerOf(tx, ctx, { accountId: row.paymentAccountId });
  const full = { ...row, accountOwnerMemberId };
  if (canWritePlanned(full, ctx, ownerRemoved, ownerUnlinked)) {
    return { allowed: true, controllers: [] };
  }
  return {
    allowed: false,
    controllers: ownerRemoved ? [] : plannedControllerIds(full),
    adminCan: ownerUnlinked,
  };
}

export async function assertCanWritePlanned(
  tx: Tx,
  ctx: RequestContext,
  row: PlannedOwnershipRow,
): Promise<void> {
  const d = await plannedWriteDecision(tx, ctx, row);
  if (!d.allowed) await deny(tx, ctx, d.controllers, { adminCan: d.adminCan === true });
}

/**
 * US-093b (SEC-059a): responsável de prevista/série para ou de sem conta só pelo lançador ou Administrador (nunca
 * para si, se Admin). Chamada ANTES de `assertPlannedNoCapture`, para que o Administrador receba a mensagem própria.
 */
export function assertPlannedUnlinkedPayer(
  ctx: RequestContext,
  current: PlannedOwnershipRow,
  nextResponsibleId: string | undefined,
  unlinked: { currentUnlinked: boolean; nextUnlinked: boolean },
): void {
  assertUnlinkedPayerChange(
    violatesUnlinkedPayerChange(
      ctx,
      { payerId: current.responsibleMemberId, authorMemberId: current.authorMemberId },
      nextResponsibleId,
      unlinked,
    ),
  );
}

/**
 * SEC-043/044: numa prevista/série "Só meu" que NÃO é sua, quem só controla (ou o Admin sobre ex-membro) não muda
 * a divisão, o responsável (nem "assume") nem o "Pagar com". Compara com o valor atual.
 */
export function assertPlannedControllerLimits(
  ctx: RequestContext,
  current: PlannedOwnershipRow,
  next: {
    isSharedExpense?: boolean | undefined;
    responsibleMemberId?: string | undefined;
    paymentAccountId?: string | null | undefined;
  },
  opts: {
    fullPower?: boolean;
    ownerIsActor?: boolean;
    payerGone?: boolean;
  } = {},
): void {
  // SEC-051 (D-GES-59): responsável ex-membro (sem retorno) é imutável para todos, prevista dividida ou "Só meu"
  if (
    violatesGonePayerLock(
      current.responsibleMemberId,
      next.responsibleMemberId,
      opts.payerGone === true,
    )
  ) {
    throw forbidden(GONE_PAYER_LOCKED_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
  }
  if (opts.ownerIsActor) return; // SEC-049: quem voltou é o responsável do "Só meu" antigo
  if (opts.fullPower) return; // D-GES-55: divisão, conta e "Pagar com" (o responsável fica travado acima)
  if (current.isSharedExpense || current.responsibleMemberId === ctx.memberId) return;
  const changes =
    next.isSharedExpense === true ||
    (next.responsibleMemberId !== undefined &&
      next.responsibleMemberId !== current.responsibleMemberId) ||
    (next.paymentAccountId !== undefined &&
      current.paymentAccountId !== undefined &&
      next.paymentAccountId !== current.paymentAccountId);
  if (changes) throw forbidden(PERSONAL_STRUCTURE_MESSAGE, PERSONAL_OWNER_ONLY_CODE);
}

/**
 * Resultado de criar/editar uma prevista (ou série): "Só meu" só em nome de quem age. Numa edição, `current`
 * dispensa a trava quando o "Só meu" já existia com o mesmo responsável (D-GES-50: o dono da conta e o lançador
 * alteram valor e descrição sem virar responsáveis).
 */
export async function assertPlannedResultAllowed(
  tx: Tx,
  ctx: RequestContext,
  result: PlannedOwnershipRow,
  current?: PlannedOwnershipRow,
): Promise<void> {
  if (
    current &&
    !current.isSharedExpense &&
    current.responsibleMemberId === result.responsibleMemberId
  ) {
    return;
  }
  if (!result.isSharedExpense && result.responsibleMemberId !== ctx.memberId) {
    // US-093b (SEC-026c, Q-TL-U3): só na CRIAÇÃO (`current` ausente), ADMIN, dono ativo sem conta (`FOR SHARE`)
    if (current === undefined && ctx.role === "ADMIN") {
      const s = await ownerStanding(tx, ctx, result.responsibleMemberId);
      if (s.ownerUnlinked) return;
    }
    throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
  }
}
