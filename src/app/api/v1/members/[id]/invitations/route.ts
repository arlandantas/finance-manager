import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { createLinkedInvitation } from "@/modules/familia/invitations/linked";
import { CreateLinkedInvitationSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// US-094a (ADR-038): convite vinculado ao cadastro sem conta; só ADMIN, só na família do ator.
export const POST = withApi(
  { role: "ADMIN", body: CreateLinkedInvitationSchema },
  async ({ ctx, tx, body, params, req }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Membro não encontrado.");
    const { body: response, afterCommit } = await createLinkedInvitation(
      tx,
      ctx,
      id.data,
      body,
      req.headers.get("origin"),
    );
    return { status: 201, body: response, afterCommit };
  },
);
