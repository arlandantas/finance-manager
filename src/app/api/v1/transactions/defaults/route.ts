import { withApi } from "@/lib/api/with-api";
import { getDefaults } from "@/modules/transacoes/service";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await getDefaults(tx, ctx),
}));
