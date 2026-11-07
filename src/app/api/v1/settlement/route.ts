import { withApi } from "@/lib/api/with-api";
import { ensureSubscriptionChargesStandalone } from "@/modules/assinaturas/charges";
import { SettlementPeriodQuerySchema } from "@/modules/split/schemas";
import { getSettlement } from "@/modules/split/service";

export const dynamic = "force-dynamic";

// SDD-002 §3
// US-099: a cobrança de assinatura vencida é lançada antes de ler o acerto (mesmo gancho do Extrato)
export const GET = withApi(
  { query: SettlementPeriodQuerySchema, prepare: ensureSubscriptionChargesStandalone },
  async ({ ctx, tx, query }) => ({
    status: 200,
    body: await getSettlement(tx, ctx, query.period),
  }),
);
