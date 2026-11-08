import { withApi } from "@/lib/api/with-api";
import { previewRule } from "@/modules/split/rule-service";
import { SplitRuleInputSchema } from "@/modules/split/schemas";

export const dynamic = "force-dynamic";

// SDD-011 §3: prévia sem gravar (não idempotente: é uma leitura calculada)
export const POST = withApi(
  { role: "ADMIN", body: SplitRuleInputSchema, idempotent: false },
  async ({ ctx, tx, body }) => ({ status: 200, body: await previewRule(tx, ctx, body) }),
);
