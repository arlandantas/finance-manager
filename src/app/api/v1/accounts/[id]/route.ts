import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { RenameAccountSchema } from "@/modules/contas/schemas";
import { renameAccount } from "@/modules/contas/service";

export const dynamic = "force-dynamic";

export const PATCH = withApi({ body: RenameAccountSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Conta não encontrada.");
  return { status: 200, body: await renameAccount(tx, ctx, id.data, body) };
});
