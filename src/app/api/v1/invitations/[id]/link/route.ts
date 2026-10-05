import { notFound } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { rotateInvitation } from "@/modules/familia/invitations/service";
import { ResendInvitationSchema } from "@/modules/familia/schemas";

export const dynamic = "force-dynamic";

// SDD-013 §3: rotaciona o token e devolve o novo link (não envia e-mail; não conta no limite)
export const POST = withApi(
  { role: "ADMIN", body: ResendInvitationSchema },
  async ({ ctx, tx, params, req }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Convite não encontrado.");
    const { body } = await rotateInvitation(
      tx,
      ctx,
      id.data,
      { sendEmail: false },
      req.headers.get("origin"),
    );
    return { status: 200, body };
  },
);
