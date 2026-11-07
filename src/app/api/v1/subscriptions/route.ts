import { withApi } from "@/lib/api/with-api";
import { ensureSubscriptionChargesStandalone } from "@/modules/assinaturas/charges";
import {
  CreateSubscriptionSchema,
  ListSubscriptionsQuerySchema,
} from "@/modules/assinaturas/schemas";
import { createSubscription, listSubscriptions } from "@/modules/assinaturas/service";

export const dynamic = "force-dynamic";

// US-096 (ADR-036, spec 12)
export const GET = withApi(
  { query: ListSubscriptionsQuerySchema, prepare: ensureSubscriptionChargesStandalone },
  async ({ ctx, tx, query }) => ({ status: 200, body: await listSubscriptions(tx, ctx, query) }),
);

export const POST = withApi({ body: CreateSubscriptionSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createSubscription(tx, ctx, body),
}));
