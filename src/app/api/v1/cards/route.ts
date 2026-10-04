import { withApi } from "@/lib/api/with-api";
import { CreateCardSchema } from "@/modules/cartoes/schemas";
import { createCard, listCards } from "@/modules/cartoes/service";

export const dynamic = "force-dynamic";

// SDD-008 §3.1
export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listCards(tx, ctx),
}));

export const POST = withApi({ body: CreateCardSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createCard(tx, ctx, body),
}));
