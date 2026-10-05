import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { rotateInvitation } from "@/modules/familia/invitations/service";
import { ResendInvitationSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-013 §3: rotaciona o token e reenvia o e-mail (conta no limite de 3)
export const POST = withApi(
  { role: "ADMIN", body: ResendInvitationSchema },
  async ({ ctx, tx, params, req }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Convite não encontrado.");
    const { body, afterCommit } = await rotateInvitation(
      tx,
      ctx,
      id.data,
      { sendEmail: true },
      req.headers.get("origin"),
    );
    return { status: 200, body, ...(afterCommit ? { afterCommit } : {}) };
  },
);
