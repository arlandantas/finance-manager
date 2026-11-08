import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { getProposal } from "@/modules/mcp/proposals-decide";

export const dynamic = "force-dynamic";

// US-076c: só o dono vê a proposta; de outro membro ou família ⇒ 404.
export const GET = withApi({}, async ({ ctx, tx, params }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Proposta inválida.");
  return { status: 200, body: await getProposal(tx, ctx, id.data) };
});
