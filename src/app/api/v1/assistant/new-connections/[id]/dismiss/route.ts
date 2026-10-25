import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { dismissNewConnectionNotice } from "@/modules/mcp/new-connection";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: z.object({}).strict() }, async ({ ctx, tx, params }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Conexão inválida.");
  return { status: 200, body: await dismissNewConnectionNotice(tx, ctx, id.data) };
});
