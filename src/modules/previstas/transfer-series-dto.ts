import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import type { MemberRef } from "@/lib/schemas";
import type { MonthISO } from "@/modules/previstas/recurrence";
import type { TransferSeriesDTO } from "@/modules/previstas/transfer-schemas";
import type { transferSeriesRepo } from "@/modules/previstas/transfer-series-repo";

export type SeriesRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof transferSeriesRepo>["findById"]>>
>;

export const monthStr = (d: Date) => fromDbDate(d).slice(0, 7) as MonthISO;

export function toDTO(row: SeriesRow, members: Map<string, MemberRef>): TransferSeriesDTO {
  const acc = (a: SeriesRow["fromAccount"]) => ({
    id: a.id,
    name: a.name,
    archived: a.archivedAt !== null,
  });
  return {
    id: row.id,
    from: acc(row.fromAccount),
    to: acc(row.toAccount),
    amountInCents: toCents(row.amountInCents),
    description: row.description,
    dayOfMonth: row.dayOfMonth,
    startMonth: monthStr(row.startMonth),
    endMonth: row.endMonth ? monthStr(row.endMonth) : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    version: row.version,
    author: members.get(row.authorMemberId) ?? {
      id: row.authorMemberId,
      name: "Membro",
      image: null,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}
