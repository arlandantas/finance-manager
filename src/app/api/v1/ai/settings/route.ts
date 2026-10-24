import { withApi } from "@/lib/api/with-api";
import { getAiSettings } from "@/modules/ia/consent";

export const dynamic = "force-dynamic";

// SDD-022 §3: estado dos recursos de IA da família (todos os membros; o consumo só vai ao ADMIN).
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getAiSettings(tx, ctx),
}));
