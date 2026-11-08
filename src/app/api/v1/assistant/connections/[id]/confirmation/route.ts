import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { setConnectionConfirmation } from "@/modules/mcp/connections";
import { SetConfirmationSchema } from "@/modules/mcp/proposals-schemas";

export const dynamic = "force-dynamic";

// US-076c: modo "exigir confirmação" por conexão; só o dono (outro membro ⇒ 404).
export const PATCH = withApi({ body: SetConfirmationSchema }, async ({ ctx, tx, params, body }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Conexão inválida.");
  return { status: 200, body: await setConnectionConfirmation(tx, ctx, id.data, body) };
});
