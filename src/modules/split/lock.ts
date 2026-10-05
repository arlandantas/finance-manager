import type { Tx } from "@/lib/api/types";

export type SplitEngine = "LEGACY" | "STORED";

/**
 * Trava de família (ADR-021 §2): `SELECT "splitEngine" … FOR SHARE`. É a PRIMEIRA trava de toda operação
 * que cria, altera, exclui ou restaura despesa comum ou seu rateio, grava regra de divisão, registra ou
 * desfaz acerto, baixa previsão ou mexe em parcelas. O motor a usar é o lido DEPOIS da trava; a migração
 * (`migrateFamily`) toma `FOR UPDATE` na mesma linha e, por isso, nenhuma dessas escritas comita no meio
 * dela. O teste `tests/unit/split/lock-coverage.test.ts` varre o código e falha se uma escrita esquecer.
 */
export async function lockFamilySplit(tx: Tx, familyId: string): Promise<SplitEngine> {
  const rows = await tx.$queryRaw<Array<{ splitEngine: SplitEngine }>>`
    SELECT "splitEngine" FROM families WHERE id = ${familyId}::uuid FOR SHARE`;
  const row = rows[0];
  if (!row) throw new Error("Família não encontrada");
  return row.splitEngine;
}
