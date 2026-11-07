import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { memberDisplayName } from "@/modules/familia/display-name";
import { buildLedgerWhere } from "@/modules/transacoes/extrato";
import type { LedgerFilters } from "@/modules/transacoes/schemas";

/** Linha crua de uma quebra (US-049); o serviço acrescenta participação e `drillUrl`. */
export type GroupRow = {
  id: string | null; // null: linha sintética (sem pagador / sem tag)
  kind: "CATEGORY" | "MEMBER" | "ACCOUNT" | "CARD" | "TAG" | "NO_TAG";
  label: string;
  archived: boolean;
  amountInCents: number;
  count: number;
};

const ACTIVE = Prisma.sql`t."deletedAt" IS NULL AND t.kind IN ('EXPENSE', 'INCOME')`;
const byValue = (a: GroupRow, b: GroupRow) =>
  b.amountInCents - a.amountInCents || a.label.localeCompare(b.label, "pt-BR");

type Raw = { id: string | null; total: bigint; n: number };

/** Por `payerMemberId` (ex-membros incluídos), mesmo predicado do Extrato. */
export async function memberRows(tx: Tx, f: LedgerFilters): Promise<GroupRow[]> {
  const where = buildLedgerWhere(f);
  const rows = await tx.$queryRaw<
    Array<
      Raw & {
        mname: string | null;
        uname: string | null;
        email: string | null;
        udel: Date | null;
        removed: boolean;
      }
    >
  >`
    SELECT t."payerMemberId"::text AS id, m.name AS mname, u.name AS uname, u.email AS email,
           u."deletedAt" AS udel, (m."removedAt" IS NOT NULL) AS removed,
           SUM(t."amountInCents")::bigint AS total, COUNT(*)::int AS n
    FROM transactions t
    LEFT JOIN members m ON m.id = t."payerMemberId" AND m."familyId" = t."familyId"
    LEFT JOIN users u ON u.id = m."userId"
    WHERE ${where} AND ${ACTIVE}
    GROUP BY t."payerMemberId", m.name, u.name, u.email, u."deletedAt", m."removedAt"`;
  return rows
    .map((r) => ({
      id: r.id,
      kind: "MEMBER" as const,
      label: r.id
        ? memberDisplayName({
            name: r.mname,
            user: r.email ? { name: r.uname, email: r.email, deletedAt: r.udel } : null,
          })
        : "Sem pagador",
      archived: r.removed,
      amountInCents: toCents(r.total),
      count: r.n,
    }))
    .sort(byValue);
}

/** Por `COALESCE(accountId, cardId)`; `CARD` quando o lançamento é de cartão. */
export async function accountRows(tx: Tx, f: LedgerFilters): Promise<GroupRow[]> {
  const where = buildLedgerWhere(f);
  const rows = await tx.$queryRaw<
    Array<Raw & { aname: string | null; cname: string | null; arch: boolean; card: boolean }>
  >`
    SELECT COALESCE(t."accountId", t."cardId")::text AS id, a.name AS aname, c.name AS cname,
           (t."accountId" IS NULL AND t."cardId" IS NOT NULL) AS card,
           (COALESCE(a."archivedAt", c."archivedAt") IS NOT NULL) AS arch,
           SUM(t."amountInCents")::bigint AS total, COUNT(*)::int AS n
    FROM transactions t
    LEFT JOIN bank_accounts a ON a.id = t."accountId" AND a."familyId" = t."familyId"
    LEFT JOIN credit_cards c ON c.id = t."cardId" AND c."familyId" = t."familyId"
    WHERE ${where} AND ${ACTIVE}
    GROUP BY COALESCE(t."accountId", t."cardId"), a.name, c.name, a."archivedAt", c."archivedAt",
             (t."accountId" IS NULL AND t."cardId" IS NOT NULL)`;
  return rows
    .map((r) => ({
      id: r.id,
      kind: r.card ? ("CARD" as const) : ("ACCOUNT" as const),
      label: r.aname ?? r.cname ?? "Sem conta",
      archived: r.arch,
      amountInCents: toCents(r.total),
      count: r.n,
    }))
    .sort(byValue);
}

/**
 * Por tag (ADR-022 §3: único `JOIN`; nunca fornece o total). Um lançamento com N tags soma em N linhas.
 * Com `tagIds` só as tags escolhidas; sem `tagIds` acrescenta "Sem tag" (NOT EXISTS).
 */
export async function tagRows(tx: Tx, f: LedgerFilters): Promise<GroupRow[]> {
  const where = buildLedgerWhere(f);
  const only = f.tagIds?.length
    ? Prisma.sql`AND tt."tagId" = ANY(${f.tagIds}::uuid[])`
    : Prisma.empty;
  const tagged = await tx.$queryRaw<Array<Raw & { name: string }>>`
    SELECT tg.id::text AS id, tg.name AS name, SUM(t."amountInCents")::bigint AS total,
           COUNT(DISTINCT t.id)::int AS n
    FROM transactions t
    JOIN transaction_tags tt ON tt."transactionId" = t.id AND tt."familyId" = t."familyId"
    JOIN tags tg ON tg.id = tt."tagId" AND tg."familyId" = t."familyId"
    WHERE ${where} AND ${ACTIVE} ${only}
    GROUP BY tg.id, tg.name`;
  const out: GroupRow[] = tagged
    .map((r) => ({
      id: r.id,
      kind: "TAG" as const,
      label: r.name,
      archived: false,
      amountInCents: toCents(r.total),
      count: r.n,
    }))
    .sort(byValue);
  if (!f.tagIds?.length) {
    const [none] = await tx.$queryRaw<Array<{ total: bigint; n: number }>>`
      SELECT COALESCE(SUM(t."amountInCents"), 0)::bigint AS total, COUNT(*)::int AS n
      FROM transactions t
      WHERE ${where} AND ${ACTIVE}
        AND NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt."transactionId" = t.id)`;
    if (none && none.n > 0) {
      out.push({
        id: null,
        kind: "NO_TAG",
        label: "Sem tag",
        archived: false,
        amountInCents: toCents(none.total),
        count: none.n,
      });
      out.sort(byValue);
    }
  }
  return out;
}
