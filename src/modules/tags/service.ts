import { Prisma } from "@/generated/prisma/client";
import type { RequestContext, Tx } from "@/lib/api/types";
import { dedupeTagNames, normalizeTagKey } from "@/modules/tags/normalize";
import type { ListTagsQuery, TagDTO, TagRef } from "@/modules/tags/schemas";

/** Ordem de exibição das tags de um lançamento: nome (sem caixa/acento) e id. */
export function sortTagRefs(tags: TagRef[]): TagRef[] {
  return [...tags].sort((a, b) => {
    const ka = normalizeTagKey(a.name);
    const kb = normalizeTagKey(b.name);
    return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Upsert das tags pelo nome digitado, NA MESMA transação do lançamento (SDD-016 §4.2 passos 1-2):
 * dedup por chave (vale a 1ª grafia), `INSERT … ON CONFLICT DO NOTHING` em ordem de `nameKey` (sem
 * deadlock entre pedidos simultâneos) e `SELECT … ORDER BY id FOR SHARE` (trava contra mesclar/remover).
 * Devolve as tags CANÔNICAS (grafia já existente quando houver).
 */
export async function upsertTags(
  tx: Tx,
  ctx: RequestContext,
  names: string[],
): Promise<Array<TagRef & { nameKey: string }>> {
  const wanted = dedupeTagNames(names).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (wanted.length === 0) return [];
  const now = ctx.clock.now();
  const nameArr = wanted.map((w) => w.name);
  const keyArr = wanted.map((w) => w.key);
  await tx.$executeRaw`
    INSERT INTO tags (id, "familyId", name, "nameKey", version, "createdByMemberId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), ${ctx.familyId}::uuid, u.name, u.key, 1, ${ctx.memberId}::uuid, ${now}::timestamptz, ${now}::timestamptz
    FROM unnest(${nameArr}::text[], ${keyArr}::text[]) AS u(name, key)
    ORDER BY u.key
    ON CONFLICT ("familyId", "nameKey") DO NOTHING`;
  return tx.$queryRaw<Array<TagRef & { nameKey: string }>>`
    SELECT id, name, "nameKey" FROM tags
    WHERE "familyId" = ${ctx.familyId}::uuid AND "nameKey" = ANY(${keyArr}::text[])
    ORDER BY id FOR SHARE`;
}

/** Tags de vários lançamentos (mapa id ⇒ chips ordenados). Sempre escopado por `familyId`. */
export async function tagsOfTransactions(
  tx: Tx,
  familyId: string,
  transactionIds: string[],
): Promise<Map<string, TagRef[]>> {
  const out = new Map<string, TagRef[]>();
  if (transactionIds.length === 0) return out;
  const rows = await tx.$queryRaw<Array<{ transactionId: string; id: string; name: string }>>`
    SELECT tt."transactionId", g.id, g.name
    FROM transaction_tags tt JOIN tags g ON g.id = tt."tagId" AND g."familyId" = tt."familyId"
    WHERE tt."familyId" = ${familyId}::uuid AND tt."transactionId" = ANY(${transactionIds}::uuid[])`;
  for (const r of rows) {
    const list = out.get(r.transactionId) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.transactionId, list);
  }
  for (const [k, v] of out) out.set(k, sortTagRefs(v));
  return out;
}

/** Liga as tags aos lançamentos recém-criados (todas as parcelas de uma compra parcelada). */
export async function linkTags(
  tx: Tx,
  familyId: string,
  transactionIds: string[],
  tagIds: string[],
): Promise<void> {
  if (transactionIds.length === 0 || tagIds.length === 0) return;
  await tx.$executeRaw`
    INSERT INTO transaction_tags ("transactionId", "tagId", "familyId")
    SELECT t.id, g.id, ${familyId}::uuid
    FROM unnest(${transactionIds}::uuid[]) AS t(id) CROSS JOIN unnest(${tagIds}::uuid[]) AS g(id)
    ON CONFLICT DO NOTHING`;
}

/** Criação: upsert + ligação; devolve os chips canônicos. */
export async function attachTagsOnCreate(
  tx: Tx,
  ctx: RequestContext,
  transactionIds: string[],
  names: string[] | undefined,
): Promise<TagRef[]> {
  if (!names || names.length === 0) return [];
  const tags = await upsertTags(tx, ctx, names);
  await linkTags(
    tx,
    ctx.familyId,
    transactionIds,
    tags.map((t) => t.id),
  );
  return sortTagRefs(tags.map((t) => ({ id: t.id, name: t.name })));
}

export type TagSetChange = {
  transactionId: string;
  before: TagRef[];
  after: TagRef[];
  changed: boolean;
};

/**
 * Edição: SUBSTITUI o conjunto de cada lançamento (`[]` limpa). Calcula o diff por lançamento, remove
 * as ligações que saíram e insere as novas. Não mexe em versão nem revisão (quem chama decide).
 */
export async function replaceTags(
  tx: Tx,
  ctx: RequestContext,
  transactionIds: string[],
  names: string[],
): Promise<TagSetChange[]> {
  const tags = names.length > 0 ? await upsertTags(tx, ctx, names) : [];
  const after = sortTagRefs(tags.map((t) => ({ id: t.id, name: t.name })));
  const afterIds = new Set(after.map((t) => t.id));
  const current = await tagsOfTransactions(tx, ctx.familyId, transactionIds);
  const changes: TagSetChange[] = transactionIds.map((transactionId) => {
    const before = current.get(transactionId) ?? [];
    const same = before.length === after.length && before.every((b) => afterIds.has(b.id));
    return { transactionId, before, after, changed: !same };
  });
  const changedIds = changes.filter((c) => c.changed).map((c) => c.transactionId);
  if (changedIds.length > 0) {
    const keep = after.map((t) => t.id);
    await tx.$executeRaw`
      DELETE FROM transaction_tags
      WHERE "familyId" = ${ctx.familyId}::uuid AND "transactionId" = ANY(${changedIds}::uuid[])
        AND "tagId" <> ALL(${keep}::uuid[])`;
    await linkTags(tx, ctx.familyId, changedIds, keep);
  }
  return changes;
}

/** `LIKE` literal: escapa `\`, `%` e `_`. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** GET /tags: sem `q`, todas por uso desc e nome; com `q`, prefixo de `nameKey` (SDD-016 §3, §4.3). */
export async function listTags(
  tx: Tx,
  ctx: RequestContext,
  q: ListTagsQuery,
): Promise<{ items: TagDTO[] }> {
  const prefix = q.q ? `${likeEscape(normalizeTagKey(q.q))}%` : null;
  const filter = prefix ? Prisma.sql`AND g."nameKey" LIKE ${prefix} ESCAPE '\\'` : Prisma.empty;
  const rows = await tx.$queryRaw<
    Array<{ id: string; name: string; version: number; usage: number }>
  >`
    SELECT g.id, g.name, g.version,
      (SELECT count(DISTINCT t.id) FROM transaction_tags tt
         JOIN transactions t ON t.id = tt."transactionId" AND t."familyId" = tt."familyId"
        WHERE tt."tagId" = g.id AND t."deletedAt" IS NULL)::int AS usage
    FROM tags g
    WHERE g."familyId" = ${ctx.familyId}::uuid ${filter}
    ORDER BY usage DESC, g."nameKey" ASC, g.id ASC
    LIMIT ${q.limit}`;
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      usageCount: r.usage,
      version: r.version,
    })),
  };
}
