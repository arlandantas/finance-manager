import { withApi } from "@/lib/api/with-api";
import { SplitRuleInputSchema } from "@/modules/split/schemas";
import { previewRule } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-011 §3: prévia sem gravar (não idempotente: é uma leitura calculada)
export const POST = withApi(
  { role: "ADMIN", body: SplitRuleInputSchema, idempotent: false },
  async ({ ctx, tx, body }) => ({ status: 200, body: await previewRule(tx, ctx, body) }),
);
