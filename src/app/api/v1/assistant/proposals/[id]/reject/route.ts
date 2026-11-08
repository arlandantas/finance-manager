import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { rejectProposal } from "@/modules/mcp/proposals-decide";
import { EmptyBodySchema } from "@/modules/mcp/proposals-schemas";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: EmptyBodySchema }, async ({ ctx, tx, params }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Proposta inválida.");
  return { status: 200, body: await rejectProposal(tx, ctx, id.data) };
});
