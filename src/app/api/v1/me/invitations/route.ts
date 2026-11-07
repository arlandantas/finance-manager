import { withApi } from "@/lib/api/with-api";
import { listMyInvitationsWithPreview } from "@/modules/familia/invitations/accept-linked";

export const dynamic = "force-dynamic";

// SDD-028 §1.3 (SEC-004): convites pendentes do e-mail verificado da sessão (US-094b: prévia do vinculado).
export const GET = withApi({ auth: "user" }, async ({ ctx, tx }) => ({
  status: 200,
  body: await listMyInvitationsWithPreview(tx, ctx),
}));
