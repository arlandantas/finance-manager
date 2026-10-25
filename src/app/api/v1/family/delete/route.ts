import { withApi } from "@/lib/api/with-api";
import { DeleteFamilyBodySchema, deleteFamily } from "@/modules/privacidade/delete-family";

export const dynamic = "force-dynamic";

// SDD-028 §7.5 / US-081: só o Administrador, único membro ativo, digitando o nome da família.
export const POST = withApi(
  { role: "ADMIN", body: DeleteFamilyBodySchema, timeoutMs: 60_000 },
  async ({ ctx, tx, body }) => ({ status: 200, body: await deleteFamily(tx, ctx, body) }),
);
