// Resumo por conta do "A pagar" (US-060, SDD-029 §4). Função PURA: sem Prisma, sem relógio.
// Cada item do recorte entra em exatamente UMA linha, então Σ dueInCents === Σ items.amountInCents.
import type { ByAccount, ByAccountRow, PayableItemDTO } from "@/modules/previstas/schemas";

export type AccountBalance = {
  id: string;
  name: string;
  archived: boolean;
  excludeFromAvailable: boolean;
  balanceInCents: number;
};

/** US-051 (a receber) e US-100 (transferência prevista) só preenchem isto; vazio hoje (D-TL-U4-5). */
export type ByAccountExtras = Map<string, { toReceive: number; plannedTransfers: number }>;

export function buildByAccount(
  items: PayableItemDTO[],
  accounts: AccountBalance[],
  extras: ByAccountExtras = new Map(),
): ByAccount {
  const known = new Map(accounts.map((a) => [a.id, a]));
  const due = new Map<string | null, { cents: number; count: number }>();
  for (const i of items) {
    // R1: id ausente em `accounts` (defesa) cai em "Sem conta definida"
    const key =
      i.paymentAccountId !== null && known.has(i.paymentAccountId) ? i.paymentAccountId : null;
    const cur = due.get(key) ?? { cents: 0, count: 0 };
    cur.cents += i.amountInCents;
    cur.count += 1;
    due.set(key, cur);
  }

  const rows: ByAccountRow[] = [];
  for (const a of accounts) {
    const d = due.get(a.id) ?? { cents: 0, count: 0 };
    const x = extras.get(a.id) ?? { toReceive: 0, plannedTransfers: 0 };
    const hasExtras = x.toReceive !== 0 || x.plannedTransfers !== 0;
    const ordinary = !a.archived && !a.excludeFromAvailable;
    // R5: ativa fora de reserva lista com saldo ≠ 0; reserva/arquivada só com a pagar (ou extras)
    const listed = d.cents > 0 || hasExtras || (ordinary && a.balanceInCents !== 0);
    if (!listed) continue;
    const projected = a.balanceInCents - d.cents + x.toReceive + x.plannedTransfers;
    rows.push({
      account: {
        id: a.id,
        name: a.name,
        archived: a.archived,
        excludeFromAvailable: a.excludeFromAvailable,
      },
      balanceInCents: a.balanceInCents,
      dueInCents: d.cents,
      itemCount: d.count,
      toReceiveInCents: x.toReceive,
      plannedTransfersInCents: x.plannedTransfers,
      projectedInCents: projected,
      shortfallInCents: Math.max(0, -projected),
    });
  }
  // R7: as que faltam primeiro (previsto crescente), nome pt-BR, id
  rows.sort(
    (a, b) =>
      (a.projectedInCents ?? 0) - (b.projectedInCents ?? 0) ||
      (a.account?.name ?? "").localeCompare(b.account?.name ?? "", "pt-BR") ||
      (a.account?.id ?? "").localeCompare(b.account?.id ?? ""),
  );

  const none = due.get(null);
  if (none && none.cents > 0) {
    rows.push({
      account: null,
      balanceInCents: null,
      dueInCents: none.cents,
      itemCount: none.count,
      toReceiveInCents: 0,
      plannedTransfersInCents: 0,
      projectedInCents: null,
      shortfallInCents: 0,
    });
  }

  return {
    rows,
    columns: {
      toReceive: rows.some((r) => r.toReceiveInCents !== 0),
      plannedTransfers: rows.some((r) => r.plannedTransfersInCents !== 0),
    },
  };
}
