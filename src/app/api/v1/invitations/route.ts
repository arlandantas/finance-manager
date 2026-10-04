import { withApi } from "@/lib/api/with-api";
import { createInvitation, listPendingInvitations } from "@/modules/familia/invitations/service";
import { CreateInvitationSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-003 §5.1: somente ADMIN
export const GET = withApi({ role: "ADMIN" }, async ({ ctx, tx }) => ({
  status: 200,
  body: { items: await listPendingInvitations(tx, ctx) },
}));

export const POST = withApi(
  { role: "ADMIN", body: CreateInvitationSchema },
  async ({ ctx, tx, body }) => {
    const { body: response, afterCommit } = await createInvitation(tx, ctx, body);
    return { status: 201, body: response, afterCommit };
  },
);
