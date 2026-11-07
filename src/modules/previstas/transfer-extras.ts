import type { Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { ByAccountExtras } from "@/modules/previstas/by-account";

/**
 * US-100b (ADR-037 §3): efeito das transferências PREVISTAS no resumo por conta. Mesmo recorte do "A pagar"
 * (vencimento no período; no corrente, + atrasadas). Saída negativa, entrada positiva; conta arquivada não entra.
 * Não toca totais, Resumo da Home nem MCP.
 */
export async function plannedTransferExtras(
  tx: Tx,
  familyId: string,
  q: { period: { start: string; end: string }; isCurrent: boolean },
): Promise<ByAccountExtras> {
  const rows = await tx.plannedTransfer.findMany({
    where: { familyId, deletedAt: null, status: "PREVISTA" },
    select: {
      amountInCents: true,
      dueOn: true,
      fromAccountId: true,
      toAccountId: true,
      fromAccount: { select: { archivedAt: true } },
      toAccount: { select: { archivedAt: true } },
    },
  });
  const extras: ByAccountExtras = new Map();
  const add = (id: string, cents: number) => {
    const cur = extras.get(id) ?? { toReceive: 0, plannedTransfers: 0 };
    cur.plannedTransfers += cents;
    extras.set(id, cur);
  };
  for (const r of rows) {
    const dueOn = fromDbDate(r.dueOn);
    const inRange =
      (dueOn >= q.period.start && dueOn <= q.period.end) || (q.isCurrent && dueOn < q.period.start);
    if (!inRange) continue;
    const cents = toCents(r.amountInCents);
    if (!r.fromAccount.archivedAt) add(r.fromAccountId, -cents);
    if (!r.toAccount.archivedAt) add(r.toAccountId, cents);
  }
  return extras;
}
