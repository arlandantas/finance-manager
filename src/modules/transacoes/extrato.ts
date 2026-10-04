import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import type { LedgerFilters, LedgerTotalsDTO } from "@/modules/transacoes/schemas";

/**
 * Fragmento WHERE único (SDD-005 §1): alimenta a lista E os totais, por isso Σ itens = totais.
 * O primeiro termo `familyId` é obrigatório (ADR-013). Aberturas nunca aparecem no extrato.
 */
export function buildLedgerWhere(f: LedgerFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`t."familyId" = ${f.familyId}::uuid`,
    Prisma.sql`t.kind <> 'OPENING'`,
    Prisma.sql`t."occurredOn" BETWEEN ${f.start}::date AND ${f.end}::date`,
  ];
  if (!f.includeDeleted) parts.push(Prisma.sql`t."deletedAt" IS NULL`);
  if (f.accountId) parts.push(Prisma.sql`t."accountId" = ${f.accountId}::uuid`);
  if (f.categoryId) parts.push(Prisma.sql`t."categoryId" = ${f.categoryId}::uuid`);
  if (f.memberId) {
    parts.push(
      Prisma.sql`(t."payerMemberId" = ${f.memberId}::uuid OR t."authorMemberId" = ${f.memberId}::uuid)`,
    );
  }
  if (f.type === "EXPENSE") parts.push(Prisma.sql`t.kind = 'EXPENSE'`);
  if (f.type === "INCOME") parts.push(Prisma.sql`t.kind = 'INCOME'`);
  if (f.type === "TRANSFER") parts.push(Prisma.sql`t.kind IN ('TRANSFER_OUT', 'TRANSFER_IN')`);
  if (f.shared !== undefined) {
    parts.push(Prisma.sql`t.kind = 'EXPENSE' AND t."isSharedExpense" = ${f.shared}`);
  }
  return Prisma.join(parts, " AND ");
}

/** Cursor opaco keyset: base64url(JSON { d: occurredOn, c: createdAtISO, i: id }). */
export type Cursor = { d: string; c: string; i: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    const okDate =
      typeof v.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.d) && !Number.isNaN(Date.parse(v.d));
    const okTime = typeof v.c === "string" && !Number.isNaN(Date.parse(v.c));
    const okId =
      typeof v.i === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.i);
    return okDate && okTime && okId
      ? { d: v.d as string, c: v.c as string, i: v.i as string }
      : null;
  } catch {
    return null;
  }
}

/** Página keyset ordenada por (occurredOn, createdAt, id) decrescente; busca `limit + 1`. */
export async function ledgerPageIds(
  tx: Tx,
  f: LedgerFilters,
  cursor: Cursor | null,
  limit: number,
): Promise<string[]> {
  const where = buildLedgerWhere(f);
  const after = cursor
    ? Prisma.sql`AND (t."occurredOn", t."createdAt", t.id) < (${cursor.d}::date, ${cursor.c}::timestamptz, ${cursor.i}::uuid)`
    : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT t.id FROM transactions t
    WHERE ${where} ${after}
    ORDER BY t."occurredOn" DESC, t."createdAt" DESC, t.id DESC
    LIMIT ${limit + 1}`;
  return rows.map((r) => r.id);
}

/**
 * Totais do filtro (ADR-007 §6): só EXPENSE/INCOME ativos, mesmo com `includeDeleted`.
 * `count` = linhas listáveis do filtro (inclui transferências; respeita `includeDeleted`).
 */
export async function ledgerTotals(tx: Tx, f: LedgerFilters): Promise<LedgerTotalsDTO> {
  const where = buildLedgerWhere(f);
  const [sums] = await tx.$queryRaw<Array<{ income: bigint; expense: bigint }>>`
    SELECT COALESCE(SUM(t."amountInCents") FILTER (WHERE t.kind = 'INCOME'), 0)::bigint AS income,
           COALESCE(SUM(t."amountInCents") FILTER (WHERE t.kind = 'EXPENSE'), 0)::bigint AS expense
    FROM transactions t
    WHERE ${where} AND t."deletedAt" IS NULL AND t.kind IN ('EXPENSE', 'INCOME')`;
  const [counted] = await tx.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM transactions t WHERE ${where}`;
  const income = toCents(sums?.income ?? 0n);
  const expense = toCents(sums?.expense ?? 0n);
  return {
    incomeInCents: income,
    expenseInCents: expense,
    balanceInCents: income - expense,
    count: counted?.n ?? 0,
  };
}

/** Existe algum lançamento ativo (fora abertura e excluídos) na família? */
export async function familyHasTransactions(tx: Tx, familyId: string): Promise<boolean> {
  const [row] = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM transactions t
      WHERE t."familyId" = ${familyId}::uuid AND t.kind <> 'OPENING' AND t."deletedAt" IS NULL
    ) AS ok`;
  return row?.ok ?? false;
}
