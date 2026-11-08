import { z } from "zod";
import { badRequest } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { confirmProposal } from "@/modules/mcp/proposals-decide";
import { EmptyBodySchema } from "@/modules/mcp/proposals-schemas";

export const dynamic = "force-dynamic";

// US-076c: `Idempotency-Key` obrigatória (withApi); confirmar duas vezes devolve o mesmo lançamento.
export const POST = withApi({ body: EmptyBodySchema }, async ({ ctx, tx, params }) => {
  const id = z.uuid().safeParse(params.id);
  if (!id.success) throw badRequest("VALIDATION_ERROR", "Proposta inválida.");
  return { status: 200, body: await confirmProposal(tx, ctx, id.data) };
});
