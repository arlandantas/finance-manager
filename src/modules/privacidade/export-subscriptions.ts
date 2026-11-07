import type { Tx } from "@/lib/api/types";
import { fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { type AmountRow, amountFor } from "@/modules/assinaturas/schedule";
import { type MonthISO, monthOf } from "@/modules/previstas/recurrence";

/**
 * US-096b: assinaturas da família no arquivo do titular. "Só meu" de OUTRA pessoa (não dividida e cujo
 * pagador não sou eu) não sai, como em previstas e recorrentes. Sem nome de terceiros: só ids.
 */
export async function exportSubscriptions(
  tx: Tx,
  familyId: string,
  mine: Set<string>,
  clock: Parameters<typeof todayInFamilyTz>[0],
) {
  const rows = await tx.cardSubscription.findMany({
    where: { familyId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const amounts = await tx.cardSubscriptionAmount.findMany({
    where: { familyId, subscriptionId: { in: rows.map((r) => r.id) } },
    select: { subscriptionId: true, fromMonth: true, amountInCents: true, createdAt: true },
  });
  const nowMonth = monthOf(todayInFamilyTz(clock)) as MonthISO;
  return rows
    .filter((r) => r.isSharedExpense || mine.has(r.payerMemberId))
    .map((r) => {
      const own: AmountRow[] = amounts
        .filter((a) => a.subscriptionId === r.id)
        .map((a) => ({
          fromMonth: fromDbDate(a.fromMonth).slice(0, 7) as MonthISO,
          amountInCents: toCents(a.amountInCents),
          createdAt: a.createdAt,
        }));
      const first = monthOf(fromDbDate(r.firstChargeOn)) as MonthISO;
      return {
        id: r.id,
        cartaoId: r.cardId,
        descricao: r.description,
        categoriaId: r.categoryId,
        pagadorMemberId: r.payerMemberId,
        dia: r.dayOfMonth,
        valorAtualEmCentavos: amountFor(nowMonth > first ? nowMonth : first, own) ?? 0,
        inicio: fromDbDate(r.firstChargeOn),
        fim: r.endMonth ? fromDbDate(r.endMonth).slice(0, 7) : null,
        encerradaEm: r.endedAt ? r.endedAt.toISOString() : null,
      };
    });
}
