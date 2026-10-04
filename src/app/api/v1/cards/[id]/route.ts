import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { UpdateCardSchema } from "@/modules/cartoes/schemas";
import { getCard, updateCard } from "@/modules/cartoes/service";

export const dynamic = "force-dynamic";

const parseId = (raw: string | undefined) => {
  const id = uuidSchema.safeParse(raw);
  if (!id.success) throw notFound("Cartão não encontrado.");
  return id.data;
};

export const GET = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await getCard(tx, ctx, parseId(params.id)),
}));

export const PATCH = withApi({ body: UpdateCardSchema }, async ({ ctx, tx, body, params }) => ({
  status: 200,
  body: await updateCard(tx, ctx, parseId(params.id), body),
}));
