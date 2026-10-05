import type { Tx } from "@/lib/api/types";
import { toCents } from "@/lib/money";
import { periodFilter } from "@/modules/transacoes/ledger-where";

/** Despesas (comuns e pessoais) ativas do período somadas por quem pagou (SDD-005 §3.2). */
export function homeRepo(tx: Tx, familyId: string) {
  return {
    paidByMember: async (start: string, end: string): Promise<Map<string, number>> => {
      const rows = await tx.transaction.groupBy({
        by: ["payerMemberId"],
        where: {
          familyId,
          kind: "EXPENSE",
          deletedAt: null,
          ...periodFilter(start, end),
        },
        _sum: { amountInCents: true },
      });
      return new Map(
        rows.flatMap((r) =>
          r.payerMemberId ? [[r.payerMemberId, toCents(r._sum.amountInCents ?? 0n)] as const] : [],
        ),
      );
    },
  };
}
