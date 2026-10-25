import { testDb } from "./db";

/**
 * Varre TODAS as colunas textuais (text, varchar, citext, json/jsonb e arrays) de todas as tabelas do schema
 * `public` atrás dos trechos informados (sem diferenciar caixa). Devolve "tabela.coluna" => nº de linhas.
 * É o reteste de LGPD de "não sobrou PII": a lista de colunas vem do `information_schema`, então tabela nova
 * entra sozinha.
 */
export async function findResidue(needles: string[]): Promise<Record<string, number>> {
  const db = testDb();
  const cols = await db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.table_name <> '_prisma_migrations'
      AND (c.data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY') OR c.udt_name = 'citext')`;
  const out: Record<string, number> = {};
  for (const { table_name: t, column_name: col } of cols) {
    for (const needle of needles) {
      const rows = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM "${t}" WHERE "${col}"::text ILIKE $1`,
        `%${needle}%`,
      );
      const n = Number(rows[0]?.n ?? 0);
      if (n > 0) out[`${t}.${col}`] = (out[`${t}.${col}`] ?? 0) + n;
    }
  }
  return out;
}

/** Tabelas do schema `public` que têm a coluna "familyId" (lista gerada pelo banco). */
export async function tablesWithFamilyId(): Promise<string[]> {
  const rows = await testDb().$queryRaw<Array<{ table_name: string }>>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'familyId'
    ORDER BY 1`;
  return rows.map((r) => r.table_name);
}
