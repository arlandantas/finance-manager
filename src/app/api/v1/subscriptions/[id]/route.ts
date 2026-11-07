import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { ensureSubscriptionChargesStandalone } from "@/modules/assinaturas/charges";
import { getSubscriptionWithImpact, updateSubscription } from "@/modules/assinaturas/manage";
import {
  GetSubscriptionQuerySchema,
  UpdateSubscriptionSchema,
} from "@/modules/assinaturas/schemas";
import type { MonthISO } from "@/modules/previstas/recurrence";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Assinatura não encontrada.");
  return id.data;
};

// US-097 (ADR-036, spec 12). GET lança o vencido antes de ler (como a lista).
export const GET = withApi(
  { query: GetSubscriptionQuerySchema, prepare: ensureSubscriptionChargesStandalone },
  async ({ ctx, tx, query, params }) => ({
    status: 200,
    body: await getSubscriptionWithImpact(
      tx,
      ctx,
      parseId(params.id),
      query.impactFrom as MonthISO | undefined,
    ),
  }),
);

export const PATCH = withApi(
  { body: UpdateSubscriptionSchema },
  async ({ ctx, tx, body, params }) => ({
    status: 200,
    body: await updateSubscription(tx, ctx, parseId(params.id), body),
  }),
);
