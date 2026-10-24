import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { ConsentDecisionSchema, decideConsent } from "@/modules/mcp/authorize";
import { mcpEnabled } from "@/modules/mcp/config";

// SDD-024 §4.4: decisão do consentimento (same-origin, CSRF de origem). Sem Idempotency-Key: pedido de uso único.
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export const POST = withApi(
  { auth: "family", idempotent: false, body: ConsentDecisionSchema },
  async ({ ctx, body, tx }) => {
    if (!mcpEnabled()) throw notFound();
    const out = await decideConsent(
      tx,
      { userId: ctx.userId, memberId: ctx.memberId, familyId: ctx.familyId },
      body,
      ctx.clock.now(),
    );
    return { status: 200, body: out };
  },
);
