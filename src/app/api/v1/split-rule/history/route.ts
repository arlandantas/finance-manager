import { withApi } from "@/lib/api/with-api";
import { getSplitHistory } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-011 §3: todos os membros veem o histórico de regras (transparência).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getSplitHistory(tx, ctx),
}));
