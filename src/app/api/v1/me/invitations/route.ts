import { withApi } from "@/lib/api/with-api";
import { listMyInvitations } from "@/modules/familia/invitations/service";

export const dynamic = "force-dynamic";

// SDD-028 §1.3 (SEC-004): convites pendentes do e-mail verificado da sessão.
export const GET = withApi({ auth: "user" }, async ({ ctx, tx }) => ({
  status: 200,
  body: await listMyInvitations(tx, ctx),
}));
