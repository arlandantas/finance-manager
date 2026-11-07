import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import type { MemberRef } from "@/lib/schemas";
import { assertAccountsEditable, shareLockAccounts } from "@/modules/contas/lock";
import { createTransferGroup } from "@/modules/contas/transfers";
import { previstasRepo } from "@/modules/previstas/repo";
import { memberMap } from "@/modules/previstas/service";
import { plannedTransfersRepo } from "@/modules/previstas/transfer-repo";
import type {
  CreatePlannedTransferParsed,
  ListPlannedTransfersQuery,
  PlannedTransferDTO,
  RealizeParsed,
  UpdatePlannedTransferParsed,
} from "@/modules/previstas/transfer-schemas";
import { lockFamilySplit } from "@/modules/split/lock";

type Repo = ReturnType<typeof plannedTransfersRepo>;
type Row = NonNullable<Awaited<ReturnType<Repo["findById"]>>>;

const NOT_FOUND = "Transferência prevista não encontrada.";
const LOCKED_MESSAGE =
  "Transferência prevista efetivada não pode ser alterada. Desfaça a transferência.";

const invalidRef = (path: string, message: string) =>
  unprocessable("INVALID_REFERENCE", message, [{ path, message }]);

const unknownMember = (id: string): MemberRef => ({ id, name: "Membro", image: null });

function toDTO(row: Row, members: Map<string, MemberRef>, today: string): PlannedTransferDTO {
  const dueOn = fromDbDate(row.dueOn);
  const acc = (a: Row["fromAccount"]) => ({
    id: a.id,
    name: a.name,
    archived: a.archivedAt !== null,
  });
  return {
    id: row.id,
    from: acc(row.fromAccount),
    to: acc(row.toAccount),
    amountInCents: toCents(row.amountInCents),
    dueOn,
    description: row.description,
    status: row.status,
    isOverdue: row.status === "PREVISTA" && dueOn < today,
    transferGroupId: row.transferGroupId,
    version: row.version,
    author: members.get(row.authorMemberId) ?? unknownMember(row.authorMemberId),
  };
}

async function loadDTO(tx: Tx, ctx: RequestContext, id: string): Promise<PlannedTransferDTO> {
  const row = await plannedTransfersRepo(tx, ctx.familyId).findById(id);
  if (!row) throw notFound(NOT_FOUND);
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  return toDTO(row, members, todayInFamilyTz(ctx.clock));
}

/** Contas ATIVAS da família (outra família ou arquivada = 422 com `path`). */
async function checkAccounts(repo: Repo, fields: Array<[string, string]>) {
  const found = new Set((await repo.accountsByIds(fields.map(([, id]) => id))).map((a) => a.id));
  for (const [path, id] of fields) {
    if (!found.has(id)) throw invalidRef(path, "Escolha uma conta ativa");
  }
}

/** US-100: nenhuma escrita no ledger. */
export async function createPlannedTransfer(
  tx: Tx,
  ctx: RequestContext,
  input: CreatePlannedTransferParsed,
): Promise<{ plannedTransfer: PlannedTransferDTO }> {
  const repo = plannedTransfersRepo(tx, ctx.familyId);
  await shareLockAccounts(tx, ctx.familyId, [input.fromAccountId, input.toAccountId]); // a FK também trava as contas
  await checkAccounts(repo, [
    ["fromAccountId", input.fromAccountId],
    ["toAccountId", input.toAccountId],
  ]);
  const row = await repo.insert({
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountInCents: input.amountInCents,
    dueOn: input.dueOn,
    description: input.description ?? null,
    authorMemberId: ctx.memberId,
  });
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  return { plannedTransfer: toDTO(row, members, todayInFamilyTz(ctx.clock)) };
}

export async function getPlannedTransfer(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ plannedTransfer: PlannedTransferDTO }> {
  return { plannedTransfer: await loadDTO(tx, ctx, id) };
}

/** Atrasadas primeiro, depois `dueOn` (a ordem do repo já é por `dueOn`). */
export async function listPlannedTransfers(
  tx: Tx,
  ctx: RequestContext,
  q: ListPlannedTransfersQuery,
): Promise<{ items: PlannedTransferDTO[] }> {
  const repo = plannedTransfersRepo(tx, ctx.familyId);
  const today = todayInFamilyTz(ctx.clock);
  const range = q.period
    ? periodFromKey(q.period, await previstasRepo(tx, ctx.familyId).cutDay())
    : undefined;
  const rows = await repo.list(
    q.status,
    range ? { start: range.start, end: range.end } : undefined,
  );
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  const items = rows.map((r) => toDTO(r, members, today));
  return { items: [...items.filter((i) => i.isOverdue), ...items.filter((i) => !i.isOverdue)] };
}

async function versionConflict(tx: Tx, ctx: RequestContext, id: string) {
  const fresh = await tx.plannedTransfer.findFirst({
    where: { id, familyId: ctx.familyId, deletedAt: null },
  });
  if (!fresh) return notFound(NOT_FOUND);
  const by = fresh.updatedByMemberId ?? fresh.authorMemberId;
  const members = await memberMap(previstasRepo(tx, ctx.familyId));
  const name = members.get(by)?.name.split(" ")[0] ?? "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta transferência prevista foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: by },
  );
}

/** Carrega travada; efetivada => 422; versão divergente => 409. */
async function loadForChange(tx: Tx, ctx: RequestContext, repo: Repo, id: string, version: number) {
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  await repo.lock(id);
  const row = await repo.findById(id);
  // excluída por outra pessoa enquanto esperava a trava: conflito de versão, não "não encontrada"
  if (!row)
    throw conflict(
      "VERSION_CONFLICT",
      "Esta transferência prevista foi alterada por outra pessoa. Recarregue para continuar.",
    );
  if (row.version !== version) throw await versionConflict(tx, ctx, id);
  if (row.status === "EFETIVADA") {
    throw unprocessable("PLANNED_TRANSFER_REALIZED_LOCKED", LOCKED_MESSAGE);
  }
  return row;
}

/** Sem diferença efetiva => 200 sem subir `version`. */
export async function updatePlannedTransfer(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: UpdatePlannedTransferParsed,
): Promise<{ plannedTransfer: PlannedTransferDTO }> {
  const repo = plannedTransfersRepo(tx, ctx.familyId);
  const row = await loadForChange(tx, ctx, repo, id, input.version);
  const from = input.fromAccountId ?? row.fromAccountId;
  const to = input.toAccountId ?? row.toAccountId;
  if (from === to) throw invalidRef("toAccountId", "Escolha contas diferentes");
  const changed: Array<[string, string]> = [];
  if (from !== row.fromAccountId) changed.push(["fromAccountId", from]);
  if (to !== row.toAccountId) changed.push(["toAccountId", to]);
  if (changed.length > 0) {
    await shareLockAccounts(
      tx,
      ctx.familyId,
      changed.map(([, v]) => v),
    );
    await checkAccounts(repo, changed);
  }
  const wanted = {
    ...(from !== row.fromAccountId ? { fromAccountId: from } : {}),
    ...(to !== row.toAccountId ? { toAccountId: to } : {}),
    ...(input.amountInCents !== undefined && input.amountInCents !== toCents(row.amountInCents)
      ? { amountInCents: input.amountInCents }
      : {}),
    ...(input.dueOn !== undefined && input.dueOn !== fromDbDate(row.dueOn)
      ? { dueOn: input.dueOn }
      : {}),
    ...(input.description !== undefined && input.description !== row.description
      ? { description: input.description }
      : {}),
  };
  if (Object.keys(wanted).length === 0) return { plannedTransfer: await loadDTO(tx, ctx, id) };
  const res = await repo.updateVersioned(id, input.version, {
    ...wanted,
    updatedByMemberId: ctx.memberId,
  });
  if (res.count === 0) throw await versionConflict(tx, ctx, id);
  return { plannedTransfer: await loadDTO(tx, ctx, id) };
}

export async function deletePlannedTransfer(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  version: number,
): Promise<{ deleted: true }> {
  const repo = plannedTransfersRepo(tx, ctx.familyId);
  await loadForChange(tx, ctx, repo, id, version);
  const res = await repo.markDeleted(id, version, ctx.memberId, ctx.clock.now());
  if (res.count === 0) throw await versionConflict(tx, ctx, id);
  return { deleted: true };
}

/**
 * ADR-037 §2: `lockFamilySplit` → prevista `FOR UPDATE` → contas → transferência real + `EFETIVADA`,
 * tudo na transação do `withApi` (qualquer falha desfaz as duas pernas e o estado).
 */
export async function realizePlannedTransfer(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: RealizeParsed,
): Promise<{ plannedTransfer: PlannedTransferDTO; transferGroupId: string }> {
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const repo = plannedTransfersRepo(tx, ctx.familyId);
  if (!(await repo.findById(id))) throw notFound(NOT_FOUND);
  await repo.lock(id);
  const row = await repo.findById(id);
  if (!row) throw notFound(NOT_FOUND);
  if (row.status !== "PREVISTA") {
    throw conflict(
      "PLANNED_TRANSFER_ALREADY_REALIZED",
      "Esta transferência prevista já foi efetivada.",
    );
  }
  if (row.version !== input.version) throw await versionConflict(tx, ctx, id);
  await assertAccountsEditable(tx, ctx.familyId, [row.fromAccountId, row.toAccountId]);
  const transfer = await createTransferGroup(tx, ctx, {
    kind: "TRANSFER",
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amountInCents: input.amountInCents ?? toCents(row.amountInCents),
    occurredOn: input.occurredOn ?? todayInFamilyTz(ctx.clock),
    description: row.description ?? "Transferência",
  });
  const res = await repo.markRealized(id, input.version, transfer.groupId, ctx.memberId);
  if (res.count === 0) throw await versionConflict(tx, ctx, id);
  return { plannedTransfer: await loadDTO(tx, ctx, id), transferGroupId: transfer.groupId };
}
