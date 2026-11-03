import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { cardArchiveCheck } from "@/modules/cartoes/archive";

export const dynamic = "force-dynamic";

// US-054: leitura dos impedimentos de arquivamento (mesma lógica do POST /archive)
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Cartão não encontrado.");
  return { status: 200, body: await cardArchiveCheck(tx, ctx, id.data) };
});
