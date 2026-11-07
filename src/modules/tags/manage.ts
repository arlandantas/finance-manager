import { isUniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { memberFirstName } from "@/modules/familia/display-name";
import { canonicalTagName, normalizeTagKey } from "@/modules/tags/normalize";
import type {
  DeleteTagInput,
  DeleteTagResponse,
  MergeTagInput,
  MergeTagResponse,
  RenameTagInput,
  TagDTO,
} from "@/modules/tags/schemas";

/** US-046 (ADR-022 §2): renomear, mesclar e remover tags. Nada aqui toca `transactions` nem o ledger. */
type Row = {
  id: string;
  name: string;
  nameKey: string;
  version: number;
  updatedBy: string | null;
};

const NOT_FOUND = "Tag não encontrada.";

/** Trava as tags `FOR UPDATE` por `id` crescente (sem deadlock entre mesclagens cruzadas). */
async function lockTags(tx: Tx, familyId: string, ids: string[]): Promise<Map<string, Row>> {
  const rows = await tx.$queryRaw<Row[]>`
    SELECT id, name, "nameKey", version, "updatedByMemberId" AS "updatedBy" FROM tags
    WHERE "familyId" = ${familyId}::uuid AND id = ANY(${ids}::uuid[])
    ORDER BY id FOR UPDATE`;
  return new Map(rows.map((r) => [r.id, r]));
}

async function usageOf(tx: Tx, tagId: string): Promise<number> {
  const [r] = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT count(DISTINCT t.id)::int AS n FROM transaction_tags tt
    JOIN transactions t ON t.id = tt."transactionId" AND t."familyId" = tt."familyId"
    WHERE tt."tagId" = ${tagId}::uuid AND t."deletedAt" IS NULL`;
  return r?.n ?? 0;
}

async function toDTO(tx: Tx, r: Row): Promise<TagDTO> {
  return {
    id: r.id,
    name: r.name,
    usageCount: await usageOf(tx, r.id),
    version: r.version,
    updatedBy: r.updatedBy,
  };
}

async function versionConflict(tx: Tx, ctx: RequestContext, id: string): Promise<Error> {
  const fresh = (await lockTags(tx, ctx.familyId, [id])).get(id);
  if (!fresh) return notFound(NOT_FOUND);
  const m = fresh.updatedBy
    ? await tx.member.findFirst({
        where: { id: fresh.updatedBy, familyId: ctx.familyId },
        include: { user: true },
      })
    : null;
  const name = (m ? memberFirstName(m) : "") || "outra pessoa";
  return conflict(
    "VERSION_CONFLICT",
    `Esta tag foi alterada por ${name}. Recarregue para continuar.`,
    { currentVersion: fresh.version, updatedBy: fresh.updatedBy },
  );
}

async function ownRow(tx: Tx, ctx: RequestContext, id: string): Promise<Row> {
  const row = (await lockTags(tx, ctx.familyId, [id])).get(id);
  if (!row) throw notFound(NOT_FOUND);
  return row;
}

export async function renameTag(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: RenameTagInput,
): Promise<{ tag: TagDTO }> {
  const row = await ownRow(tx, ctx, id);
  const name = canonicalTagName(input.name);
  const nameKey = normalizeTagKey(name);
  if (name === row.name && nameKey === row.nameKey) {
    if (input.version !== row.version) throw await versionConflict(tx, ctx, id);
    return { tag: await toDTO(tx, row) };
  }
  const [other] = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT id, name FROM tags
    WHERE "familyId" = ${ctx.familyId}::uuid AND "nameKey" = ${nameKey} AND id <> ${id}::uuid`;
  if (other) {
    throw conflict("TAG_NAME_EXISTS", `Já existe a tag ${other.name}`, {
      mergeIntoId: other.id,
      mergeIntoName: other.name,
    });
  }
  let count: number;
  try {
    count = await tx.$executeRaw`
      UPDATE tags SET name = ${name}, "nameKey" = ${nameKey}, version = version + 1,
        "updatedByMemberId" = ${ctx.memberId}::uuid, "updatedAt" = ${ctx.clock.now()}::timestamptz
      WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid AND version = ${input.version}`;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("TAG_NAME_EXISTS", "Já existe uma tag com este nome");
    throw e;
  }
  if (count === 0) throw await versionConflict(tx, ctx, id);
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "TAG_RENAMED",
      actorMemberId: ctx.memberId,
      changes: { tagId: id, from: row.name, to: name },
    },
  });
  const fresh = (await lockTags(tx, ctx.familyId, [id])).get(id) as Row;
  return { tag: await toDTO(tx, fresh) };
}

export async function mergeTag(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: MergeTagInput,
): Promise<MergeTagResponse> {
  if (id === input.intoId) {
    throw unprocessable("TAG_MERGE_SAME", "Escolha outra tag para mesclar");
  }
  const locked = await lockTags(tx, ctx.familyId, [id, input.intoId]);
  const from = locked.get(id);
  const into = locked.get(input.intoId);
  if (!from || !into) throw notFound(NOT_FOUND);
  if (from.version !== input.version) throw await versionConflict(tx, ctx, id);
  const movedCount = await tx.$executeRaw`
    INSERT INTO transaction_tags ("transactionId", "tagId", "familyId")
    SELECT "transactionId", ${into.id}::uuid, "familyId" FROM transaction_tags
    WHERE "tagId" = ${from.id}::uuid AND "familyId" = ${ctx.familyId}::uuid
    ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`
    DELETE FROM transaction_tags WHERE "tagId" = ${from.id}::uuid AND "familyId" = ${ctx.familyId}::uuid`;
  await tx.$executeRaw`DELETE FROM tags WHERE id = ${from.id}::uuid AND "familyId" = ${ctx.familyId}::uuid`;
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "TAG_MERGED",
      actorMemberId: ctx.memberId,
      changes: {
        fromTagId: from.id,
        fromName: from.name,
        intoTagId: into.id,
        intoName: into.name,
        movedCount,
      },
    },
  });
  return { tag: await toDTO(tx, into), movedCount };
}

export async function deleteTag(
  tx: Tx,
  ctx: RequestContext,
  id: string,
  input: DeleteTagInput,
): Promise<DeleteTagResponse> {
  const row = await ownRow(tx, ctx, id);
  if (row.version !== input.version) throw await versionConflict(tx, ctx, id);
  const removedFromCount = await usageOf(tx, id);
  await tx.$executeRaw`
    DELETE FROM transaction_tags WHERE "tagId" = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid`;
  await tx.$executeRaw`DELETE FROM tags WHERE id = ${id}::uuid AND "familyId" = ${ctx.familyId}::uuid`;
  await tx.familyEvent.create({
    data: {
      familyId: ctx.familyId,
      type: "TAG_DELETED",
      actorMemberId: ctx.memberId,
      changes: { tagId: id, name: row.name, removedFromCount },
    },
  });
  return { removedFromCount };
}
