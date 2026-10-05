import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { archiveAccount } from "@/modules/contas/archive";
import { ArchiveAccountSchema } from "@/modules/contas/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.1: qualquer membro arquiva
export const POST = withApi({ body: ArchiveAccountSchema }, async ({ ctx, tx, body, params }) => {
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) throw notFound("Conta não encontrada.");
  return { status: 200, body: await archiveAccount(tx, ctx, id.data, body.version) };
});
