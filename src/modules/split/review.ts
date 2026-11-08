import { unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { periodFromKey, periodOf } from "@/lib/period";
import { assertSettlementEnabled } from "@/modules/split/guard";
import { reviewRepo } from "@/modules/split/review-repo";
import { loadRuleContext, refsOf } from "@/modules/split/rule-context";
import type { SettlementReviewDTO } from "@/modules/split/schemas";

async function context(tx: Tx, ctx: RequestContext, periodKey?: string) {
  await assertSettlementEnabled(tx, ctx);
  const c = await loadRuleContext(tx, ctx);
  const period = periodKey ? periodFromKey(periodKey, c.cutDay) : periodOf(c.today, c.cutDay);
  return { c, period, repo: reviewRepo(tx, ctx.familyId), eligible: period.end < c.today };
}

/** GET /settlement/review (US-044): despesas "Só meu" do mês encerrado para revisar. Não escreve nada. */
export async function getSettlementReview(
  tx: Tx,
  ctx: RequestContext,
  periodKey?: string,
): Promise<SettlementReviewDTO> {
  const { c, period, repo, eligible } = await context(tx, ctx, periodKey);
  const dismissed = await repo.isDismissed(period.key);
  const rows = eligible ? await repo.personalItems(period.start, period.end) : [];
  const refs = refsOf(c.allMembers);
  const items = rows.map((e) => ({
    id: e.id,
    version: e.version,
    description: e.description,
    amountInCents: toCents(e.amountInCents),
    occurredOn: fromDbDate(e.occurredOn),
    payer: refs.get(e.payerMemberId as string) ?? {
      id: e.payerMemberId as string,
      name: "Membro",
      image: null,
    },
    category: {
      id: e.category?.id ?? "",
      name: e.category?.name ?? "",
      icon: e.category?.icon ?? "",
    },
  }));
  return {
    eligible,
    dismissed,
    count: items.length,
    totalInCents: items.reduce((s, i) => s + i.amountInCents, 0),
    items,
  };
}

/** POST /settlement/review/dismiss: "Não perguntar de novo para este mês". Idempotente. */
export async function dismissSettlementReview(
  tx: Tx,
  ctx: RequestContext,
  periodKey: string,
): Promise<{ dismissed: true }> {
  const { period, repo, eligible } = await context(tx, ctx, periodKey);
  if (!eligible) {
    throw unprocessable("PERIOD_NOT_ENDED", "O mês ainda não terminou: não há o que dispensar.");
  }
  await repo.dismiss(period.key, ctx.memberId);
  return { dismissed: true };
}
