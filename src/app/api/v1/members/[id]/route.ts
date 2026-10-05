import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { changeRole } from "@/modules/familia/manage";
import { ChangeRoleSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-012 §3.2: só o Administrador altera papéis
export const PATCH = withApi(
  { role: "ADMIN", body: ChangeRoleSchema },
  async ({ ctx, tx, body, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Membro não encontrado.");
    return { status: 200, body: await changeRole(tx, ctx, id.data, body.role) };
  },
);
