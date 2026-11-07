import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { endSubscription } from "@/modules/assinaturas/manage";
import { EndSubscriptionSchema } from "@/modules/assinaturas/schemas";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: EndSubscriptionSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Assinatura não encontrada.");
  return { status: 200, body: await endSubscription(tx, ctx, id.data, body.version) };
});
