import { withApi } from "@/lib/api/with-api";
import {
  assertPatCreationAllowed,
  CreatePatSchema,
  createPat,
  redactPatBody,
} from "@/modules/mcp/pat";
import { mcpDb } from "@/modules/mcp/repo";

export const dynamic = "force-dynamic";

// US-074b (ADR-043): cria o token pessoal. O valor só vai nesta resposta; a idempotência guarda sem ele.
export const POST = withApi(
  {
    body: CreatePatSchema,
    redactStoredBody: redactPatBody,
    prepare: (ctx) => assertPatCreationAllowed(ctx, mcpDb()),
  },
  async ({ ctx, tx, body }) => createPat(tx, ctx, body),
);
