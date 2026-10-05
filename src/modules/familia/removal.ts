import { forbidden, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { formatBRL, toCents } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { cardInvoiceSummaries } from "@/modules/cartoes/queries";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import type { RemovalReviewDTO, RemoveMemberParsed } from "@/modules/familia/schemas";
import { isSettlementEnabled } from "@/modules/split/guard";
import { pendingSettlementMonths } from "@/modules/split/pending";
import { splitRepo } from "@/modules/split/repo";

const LAST_ADMIN_LEAVE =
  "Você é a única pessoa Administradora. Promova outro membro antes de sair.";
const LAST_ADMIN_REMOVE =
  "A pessoa é a única Administradora. Promova outro membro antes de removê-la.";
const ONLY_MEMBER = "Você é a única pessoa na família. Convide alguém antes de sair.";

type Blocker = { code: string; message: string; ids?: string[] };

const nameOf = (m: { user: { name: string | null; email: string } }) =>
  m.user.name ?? localPart(m.user.email);

async function loadTarget(tx: Tx, ctx: RequestContext, memberId: string) {
  const target = await tx.member.findFirst({
    where: { id: memberId, familyId: ctx.familyId, removedAt: null },
    include: { user: true },
  });
  if (!target) throw notFound("Membro não encontrado.");
  return target;
}

/** Pendências do alvo (leitura): usada pela revisão e reavaliada dentro do lock na remoção. */
async function gather(tx: Tx, ctx: RequestContext, target: Awaited<ReturnType<typeof loadTarget>>) {
  const active = await tx.member.findMany({
    where: { familyId: ctx.familyId, removedAt: null },
    include: { user: true },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  const today = todayInFamilyTz(ctx.clock);
  const enabled = await isSettlementEnabled(tx, ctx.familyId);
  let months: Array<{ period: string; toSettleInCents: number }> = [];
  if (enabled) {
    const cutDay = await splitRepo(tx, ctx.familyId).cutDay();
    months = (
      await pendingSettlementMonths(tx, ctx, {
        toPeriodKey: periodOf(today, cutDay).key,
        involving: target.id,
      })
    ).map((m) => ({ period: m.periodKey, toSettleInCents: m.toSettleInCents }));
  }
  const accounts = await tx.bankAccount.findMany({
    where: { familyId: ctx.familyId, ownerMemberId: target.id, deletedAt: null, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const balances = await accountBalances(
    tx,
    ctx.familyId,
    accounts.map((a) => a.id),
  );
  const cards = await tx.creditCard.findMany({
    where: { familyId: ctx.familyId, ownerMemberId: target.id, deletedAt: null, archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const summaries = await cardInvoiceSummaries(tx, ctx.familyId, cards, today);
  const planned = await tx.plannedExpense.findMany({
    where: {
      familyId: ctx.familyId,
      responsibleMemberId: target.id,
      status: "PREVISTO",
      deletedAt: null,
    },
    orderBy: [{ dueOn: "asc" }, { id: "asc" }],
  });
  return { active, today, enabled, months, accounts, balances, cards, summaries, planned };
}

function blockersOf(
  active: Array<{ role: string }>,
  target: { role: string },
): Array<"LAST_ADMIN" | "ONLY_MEMBER"> {
  const out: Array<"LAST_ADMIN" | "ONLY_MEMBER"> = [];
  if (active.length <= 1) out.push("ONLY_MEMBER");
  if (target.role === "ADMIN" && active.filter((m) => m.role === "ADMIN").length <= 1) {
    out.push("LAST_ADMIN");
  }
  return out;
}

/** GET /members/:id/removal-review e /family/leave-review (SDD-012 §2). */
export async function removalReview(
  tx: Tx,
  ctx: RequestContext,
  memberId: string,
): Promise<RemovalReviewDTO> {
  const target = await loadTarget(tx, ctx, memberId);
  const g = await gather(tx, ctx, target);
  return {
    member: { id: target.id, name: nameOf(target), image: target.user.image },
    isSelf: target.id === ctx.memberId,
    settlement: {
      enabled: g.enabled,
      totalInCents: g.months.reduce((s, m) => s + m.toSettleInCents, 0),
      months: g.months,
    },
    accounts: g.accounts.map((a) => {
      const balance = g.balances.get(a.id) ?? 0;
      return {
        id: a.id,
        name: a.name,
        balanceInCents: balance,
        mustReassign: balance !== 0,
        defaultAction: balance !== 0 ? "REASSIGN" : "ARCHIVE",
      } as const;
    }),
    cards: g.cards.map((c) => {
      const s = g.summaries.get(c.id);
      const unpaid =
        (s?.payable.reduce((t, p) => t + p.totalInCents, 0) ?? 0) + (s?.open.totalInCents ?? 0);
      return {
        id: c.id,
        name: c.name,
        unpaidInCents: unpaid,
        mustReassign: unpaid > 0,
        defaultAction: unpaid > 0 ? "REASSIGN" : "ARCHIVE",
      } as const;
    }),
    planned: g.planned.map((p) => ({
      id: p.id,
      description: p.description,
      dueOn: fromDbDate(p.dueOn),
    })),
    candidates: g.active
      .filter((m) => m.id !== target.id)
      .map((m) => ({ id: m.id, name: nameOf(m), role: m.role })),
    blockers: blockersOf(g.active, target),
  };
}

/**
 * Remoção/saída (SDD-012 §4.3, ADR-019 §5): tudo ou nada, sob o lock de família; reavalia as pendências
 * dentro do lock. `Member` nunca é apagado; o acerto em aberto continua registrado.
 */
export async function removeMember(
  tx: Tx,
  ctx: RequestContext,
  memberId: string,
  body: RemoveMemberParsed,
  kind: "REMOVED" | "LEFT",
) {
  await lockFamilyAdmins(tx, ctx, kind === "REMOVED");
  const target = await loadTarget(tx, ctx, memberId);
  if (kind === "REMOVED" && ctx.role !== "ADMIN") throw forbidden();
  const isSelf = target.id === ctx.memberId;
  const g = await gather(tx, ctx, target);
  const blockers: Blocker[] = [];

  for (const b of blockersOf(g.active, target)) {
    blockers.push(
      b === "ONLY_MEMBER"
        ? { code: "ONLY_MEMBER", message: ONLY_MEMBER }
        : { code: "LAST_ADMIN", message: isSelf ? LAST_ADMIN_LEAVE : LAST_ADMIN_REMOVE },
    );
  }
  const activeIds = new Set(g.active.filter((m) => m.id !== target.id).map((m) => m.id));
  const validTarget = (id: string | undefined) => id !== undefined && activeIds.has(id);

  // acerto em aberto envolvendo o membro
  const settleTotal = g.months.reduce((s, m) => s + m.toSettleInCents, 0);
  if (g.enabled && settleTotal > 0 && !body.acknowledgeSettlement) {
    blockers.push({
      code: "SETTLEMENT_NOT_ACKNOWLEDGED",
      message: `Há ${formatBRL(settleTotal)} a acertar entre vocês`,
    });
  }

  // contas
  const archiveAccounts: string[] = [];
  const reassignAccounts: Array<[string, string]> = [];
  const needOwner: string[] = [];
  const badTarget: string[] = [];
  for (const a of g.accounts) {
    const to = body.reassign.accounts[a.id];
    const balance = g.balances.get(a.id) ?? 0;
    if (to !== undefined) {
      if (validTarget(to)) reassignAccounts.push([a.id, to]);
      else badTarget.push(a.id);
    } else if (balance !== 0) {
      needOwner.push(a.id);
      blockers.push({
        code: "ACCOUNT_NEEDS_OWNER",
        message: `A conta ${a.name} tem saldo. Passe a titularidade para outro membro.`,
        ids: [a.id],
      });
    } else archiveAccounts.push(a.id);
  }
  // cartões
  const archiveCards: string[] = [];
  const reassignCards: Array<[string, string]> = [];
  for (const c of g.cards) {
    const to = body.reassign.cards[c.id];
    const s = g.summaries.get(c.id);
    const unpaid =
      (s?.payable.reduce((t, p) => t + p.totalInCents, 0) ?? 0) + (s?.open.totalInCents ?? 0);
    if (to !== undefined) {
      if (validTarget(to)) reassignCards.push([c.id, to]);
      else badTarget.push(c.id);
    } else if (unpaid > 0) {
      blockers.push({
        code: "CARD_NEEDS_OWNER",
        message: `O cartão ${c.name} tem fatura em aberto. Passe a titularidade para outro membro.`,
        ids: [c.id],
      });
    } else archiveCards.push(c.id);
  }
  // previstas: responsável
  const plannedTo = body.reassign.plannedTo ?? (isSelf ? undefined : ctx.memberId);
  if (g.planned.length > 0) {
    if (plannedTo === undefined || !validTarget(plannedTo))
      badTarget.push(plannedTo ?? "plannedTo");
    else if (isSelf && g.active.find((m) => m.id === plannedTo)?.role !== "ADMIN")
      badTarget.push(plannedTo);
  }
  if (badTarget.length > 0) {
    blockers.push({
      code: "INVALID_REASSIGN_TARGET",
      message: "Escolha um membro ativo da família para receber a titularidade.",
      ids: badTarget,
    });
  }
  void needOwner;

  if (blockers.length > 0) {
    throw unprocessable("REMOVAL_BLOCKED", blockers[0]?.message ?? "Remoção bloqueada", {
      blockers: blockers.map((b) => ({ code: b.code, ...(b.ids ? { ids: b.ids } : {}) })),
    });
  }

  const now = ctx.clock.now();
  // arquivar o que sobrou sem pendência (Q-F07), sob FOR UPDATE
  for (const id of archiveAccounts) {
    await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${id}::uuid FOR UPDATE`;
    const balance = (await accountBalances(tx, ctx.familyId, [id])).get(id) ?? 0;
    if (balance !== 0) {
      throw unprocessable(
        "REMOVAL_BLOCKED",
        "O saldo de uma conta mudou. Revise e tente de novo.",
        {
          blockers: [{ code: "ACCOUNT_NEEDS_OWNER", ids: [id] }],
        },
      );
    }
    await tx.bankAccount.updateMany({
      where: { id, familyId: ctx.familyId },
      data: { archivedAt: now, archivedByMemberId: ctx.memberId, version: { increment: 1 } },
    });
  }
  for (const [id, to] of reassignAccounts) {
    await tx.bankAccount.updateMany({
      where: { id, familyId: ctx.familyId },
      data: { ownerMemberId: to, version: { increment: 1 } },
    });
  }
  for (const id of archiveCards) {
    await tx.$queryRaw`SELECT id FROM credit_cards WHERE id = ${id}::uuid FOR UPDATE`;
    await tx.creditCard.updateMany({
      where: { id, familyId: ctx.familyId },
      data: { archivedAt: now, archivedByMemberId: ctx.memberId, version: { increment: 1 } },
    });
  }
  for (const [id, to] of reassignCards) {
    await tx.creditCard.updateMany({
      where: { id, familyId: ctx.familyId },
      data: { ownerMemberId: to, version: { increment: 1 } },
    });
  }
  if (g.planned.length > 0 && plannedTo) {
    await tx.plannedExpense.updateMany({
      where: { id: { in: g.planned.map((p) => p.id) }, familyId: ctx.familyId },
      data: {
        responsibleMemberId: plannedTo,
        version: { increment: 1 },
        updatedByMemberId: ctx.memberId,
      },
    });
  }
  await tx.member.update({
    where: { id: target.id },
    data: { removedAt: now, removedByMemberId: ctx.memberId, removalKind: kind },
  });
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: kind === "LEFT" ? "MEMBER_LEFT" : "MEMBER_REMOVED",
      actorMemberId: ctx.memberId,
      targetMemberId: target.id,
      changes: {
        accountsArchived: archiveAccounts.length,
        accountsReassigned: reassignAccounts.length,
        cardsArchived: archiveCards.length,
        cardsReassigned: reassignCards.length,
        plannedReassigned: g.planned.length,
        settlementAcknowledgedInCents: g.enabled ? settleTotal : 0,
      },
    },
  });
  void toCents;
  return kind === "LEFT" ? { left: true as const } : { removed: true as const };
}
