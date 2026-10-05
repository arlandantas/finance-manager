import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { deleteAccount } from "@/modules/contas/archive";
import { ArchiveAccountSchema } from "@/modules/contas/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.1: só o Administrador exclui (lógico, terminal)
export const POST = withApi(
  { role: "ADMIN", body: ArchiveAccountSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Conta não encontrada.");
    return { status: 200, body: await deleteAccount(tx, ctx, id.data, body.version) };
  },
);
