import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { accountArchiveCheck } from "@/modules/contas/archive";

export const dynamic = "force-dynamic";

// US-054: leitura dos impedimentos de arquivamento (mesma lógica do POST /archive)
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Conta não encontrada.");
  return { status: 200, body: await accountArchiveCheck(tx, ctx, id.data) };
});
