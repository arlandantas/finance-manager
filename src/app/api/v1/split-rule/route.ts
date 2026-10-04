import { withApi } from "@/lib/api/with-api";
import { SplitRuleInputSchema } from "@/modules/split/schemas";
import { getSplitRule, putSplitRule } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-002 §3
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getSplitRule(tx, ctx),
}));

export const PUT = withApi(
  { role: "ADMIN", body: SplitRuleInputSchema },
  async ({ ctx, tx, body }) => ({
    status: 201,
    body: await putSplitRule(tx, ctx, body),
  }),
);
