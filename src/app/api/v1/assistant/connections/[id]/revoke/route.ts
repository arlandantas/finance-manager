import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { revokeConnection } from "@/modules/mcp/connections";
import { RevokeConnectionSchema } from "@/modules/mcp/connections-schemas";

export const dynamic = "force-dynamic";

// SDD-025 §3: revoga na hora (os tokens são apagados); 404 igual para outro membro ou outra família.
export const POST = withApi({ body: RevokeConnectionSchema }, async ({ ctx, tx, params }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Conexão inválida.");
  return { status: 200, body: await revokeConnection(tx, ctx, id.data) };
});
