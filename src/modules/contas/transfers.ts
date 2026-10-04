import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import type { DateISO } from "@/lib/dates";
import { compareDate, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { recordRevision } from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { contasRepo } from "@/modules/contas/repo";
import type { CreateTransferInput, TransferDTO } from "@/modules/contas/schemas";
import { memberRef } from "@/modules/contas/service";

type Repo = ReturnType<typeof contasRepo>;
type GroupRow = NonNullable<Awaited<ReturnType<Repo["findGroup"]>>>;

export type CreateTransferGroupInput = {
  kind: "TRANSFER" | "SETTLEMENT";
  fromAccountId: string;
  toAccountId: string;
  amountInCents: number;
  occurredOn: DateISO;
  note?: string | undefined;
  description?: string | undefined; // padrão "Transferência"; o acerto passa "Acerto de contas - {Mês}"
  settlement?: { period: string; fromMemberId: string; toMemberId: string } | undefined;
};

async function toTransferDTO(tx: Tx, ctx: RequestContext, g: GroupRow): Promise<TransferDTO> {
  const repo = contasRepo(tx, ctx.familyId);
  const out = g.legs.find((l) => l.kind === "TRANSFER_OUT");
  const inn = g.legs.find((l) => l.kind === "TRANSFER_IN");
  if (!out || !inn) throw new Error("Grupo de transferência sem as duas pernas");
  // Pernas de transferência sempre têm conta (CHECK tx_kind_shape_chk).
  if (!out.accountId || !inn.accountId || !out.account || !inn.account) {
    throw new Error("Perna de transferência sem conta");
  }
  const author = await repo.findMember(g.authorMemberId);
  const balances = await accountBalances(tx, ctx.familyId, [out.accountId, inn.accountId]);
  return {
    groupId: g.id,
    kind: g.kind,
    occurredOn: fromDbDate(g.occurredOn),
    amountInCents: toCents(out.amountInCents),
    from: {
      accountId: out.accountId,
      name: out.account.name,
      balanceAfterInCents: balances.get(out.accountId) ?? 0,
    },
    to: {
      accountId: inn.accountId,
      name: inn.account.name,
      balanceAfterInCents: balances.get(inn.accountId) ?? 0,
    },
    author: author ? memberRef(author) : { id: g.authorMemberId, name: "Membro", image: null },
    note: out.note,
    version: g.version,
    createdAt: g.createdAt.toISOString(),
    settlement:
      g.kind === "SETTLEMENT" &&
      g.settlementPeriod &&
      g.settlementFromMemberId &&
      g.settlementToMemberId
        ? {
            period: g.settlementPeriod,
            fromMemberId: g.settlementFromMemberId,
            toMemberId: g.settlementToMemberId,
          }
        : null,
    undoneAt: g.deletedAt ? g.deletedAt.toISOString() : null,
  };
}

/**
 * SDD-004 §4.3: grupo + duas pernas (OUT/IN) + revisão CREATE de cada uma, na transação do chamador.
 * Compartilhada com o acerto de contas (US-011). Qualquer falha desfaz tudo.
 */
export async function createTransferGroup(
  tx: Tx,
  ctx: RequestContext,
  a: CreateTransferGroupInput,
): Promise<TransferDTO> {
  const repo = contasRepo(tx, ctx.familyId);
  const accounts = await repo.accountsByIds([a.fromAccountId, a.toAccountId]);
  if (accounts.length !== 2) throw notFound("Conta não encontrada.");
  const today = todayInFamilyTz(ctx.clock);
  if (compareDate(a.occurredOn, today) > 0) {
    const message = "A data da transferência não pode ser futura";
    throw unprocessable("FUTURE_DATE_NOT_ALLOWED", message, [{ path: "occurredOn", message }]);
  }
  const group = await repo.insertTransferGroup({
    kind: a.kind,
    occurredOn: a.occurredOn,
    authorMemberId: ctx.memberId,
    ...(a.settlement ? { settlement: a.settlement } : {}),
  });
  const base = {
    amountInCents: a.amountInCents,
    occurredOn: a.occurredOn,
    description: a.description ?? "Transferência",
    note: a.note?.trim() ? a.note.trim() : null,
    authorMemberId: ctx.memberId,
    transferGroupId: group.id,
  };
  const out = await repo.insertLeg({ ...base, kind: "TRANSFER_OUT", accountId: a.fromAccountId });
  const inn = await repo.insertLeg({ ...base, kind: "TRANSFER_IN", accountId: a.toAccountId });
  for (const leg of [out, inn]) {
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: leg.id,
      revision: 1,
      action: "CREATE",
      actorMemberId: ctx.memberId,
      changes: [
        {
          field: "*",
          from: null,
          to: {
            kind: leg.kind,
            accountId: leg.accountId,
            direction: leg.direction,
            amountInCents: a.amountInCents,
            occurredOn: a.occurredOn,
            transferGroupId: group.id,
          },
        },
      ],
    });
  }
  const loaded = await repo.findGroup(group.id);
  if (!loaded) throw new Error("Grupo recém-criado não encontrado");
  return toTransferDTO(tx, ctx, loaded);
}

/** POST /api/v1/transfers (US-010). */
export async function createTransfer(
  tx: Tx,
  ctx: RequestContext,
  input: CreateTransferInput,
): Promise<{ transfer: TransferDTO }> {
  const transfer = await createTransferGroup(tx, ctx, {
    kind: "TRANSFER",
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountInCents: input.amountInCents,
    occurredOn: input.occurredOn ?? todayInFamilyTz(ctx.clock),
    note: input.note,
  });
  return { transfer };
}

export async function getTransfer(
  tx: Tx,
  ctx: RequestContext,
  groupId: string,
): Promise<{ transfer: TransferDTO }> {
  const group = await contasRepo(tx, ctx.familyId).findGroup(groupId);
  if (!group) throw notFound("Transferência não encontrada.");
  return { transfer: await toTransferDTO(tx, ctx, group) };
}

/** SDD-004 §4.4: desfaz o grupo inteiro (as duas pernas) com controle de `version`. */
export async function undoTransferGroup(
  tx: Tx,
  ctx: RequestContext,
  groupId: string,
  version: number,
): Promise<{ transfer: TransferDTO }> {
  const repo = contasRepo(tx, ctx.familyId);
  const group = await repo.findGroup(groupId);
  if (!group) throw notFound("Transferência não encontrada.");
  if (group.deletedAt) throw conflict("ALREADY_UNDONE", "Esta transferência já foi desfeita.");
  const now = ctx.clock.now();
  const res = await repo.undoGroup(groupId, version, ctx.memberId, now);
  if (res.count === 0) {
    throw conflict(
      "VERSION_CONFLICT",
      "Esta transferência foi alterada por outra pessoa. Recarregue para continuar.",
      { currentVersion: group.version },
    );
  }
  await repo.undoLegs(groupId, ctx.memberId, now);
  const after = await repo.findGroup(groupId);
  if (!after) throw notFound("Transferência não encontrada.");
  for (const leg of after.legs) {
    await recordRevision(tx, {
      familyId: ctx.familyId,
      transactionId: leg.id,
      revision: leg.version,
      action: "UNDO",
      actorMemberId: ctx.memberId,
      changes: [{ field: "deletionReason", from: null, to: "UNDONE" }],
    });
  }
  return { transfer: await toTransferDTO(tx, ctx, after) };
}
