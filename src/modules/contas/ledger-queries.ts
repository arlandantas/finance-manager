import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";

/**
 * Saldo derivado por conta (SDD-004 §4.1): Σ CREDIT − Σ DEBIT das linhas ativas, inclusive OPENING.
 * Compras no cartão (`accountId` nulo) não entram (RN-003.1, ADR-014); pagamento de fatura debita a conta.
 * Contas sem linhas valem 0. Única função de saldo (Contas, Home, transferência e testes).
 */
export async function accountBalances(
  tx: Tx,
  familyId: string,
  accountIds?: string[],
): Promise<Map<string, number>> {
  const onlyAccounts =
    accountIds && accountIds.length > 0
      ? Prisma.sql`AND "accountId" IN (${Prisma.join(accountIds.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;
  const rows = await tx.$queryRaw<Array<{ accountId: string; balance: bigint }>>`
    SELECT "accountId", COALESCE(SUM(CASE direction WHEN 'CREDIT' THEN "amountInCents" ELSE -"amountInCents" END), 0)::bigint AS balance
    FROM transactions
    WHERE "familyId" = ${familyId}::uuid AND "deletedAt" IS NULL AND "accountId" IS NOT NULL ${onlyAccounts}
    GROUP BY "accountId"`;
  const map = new Map<string, number>();
  for (const id of accountIds ?? []) map.set(id, 0);
  for (const r of rows) map.set(r.accountId, toCents(r.balance));
  return map;
}

/**
 * Uso recente por conta (US-023, SDD-013 §1): lançamentos ativos do membro logado nos últimos 90 dias
 * (despesa, pagamento de fatura e transferência de saída). Sem tabela nova; só alimenta o desempate.
 */
export async function usageCountByMember(
  tx: Tx,
  familyId: string,
  memberId: string,
  since: string,
): Promise<Map<string, number>> {
  const rows = await tx.$queryRaw<Array<{ accountId: string; n: number }>>`
    SELECT "accountId", count(*)::int AS n
    FROM transactions
    WHERE "familyId" = ${familyId}::uuid AND "authorMemberId" = ${memberId}::uuid
      AND "deletedAt" IS NULL AND "accountId" IS NOT NULL
      AND kind IN ('EXPENSE', 'INVOICE_PAYMENT', 'TRANSFER_OUT')
      AND "occurredOn" >= ${since}::date
    GROUP BY "accountId"`;
  return new Map(rows.map((r) => [r.accountId, r.n]));
}
