import { ApiError, notFound } from "@/lib/api/errors";
import { hitInvitationDecisionRate } from "@/lib/api/rate-limit";
import { withApi } from "@/lib/api/with-api";
import { uuidSchema } from "@/lib/schemas";
import { DeclineInvitationBodySchema } from "@/modules/familia/invitations/schemas";
import { declineInvitation } from "@/modules/familia/invitations/service";

export const dynamic = "force-dynamic";

// SDD-028 §1.3 (SEC-004): recusar não cria vínculo.
export const POST = withApi(
  {
    auth: "user",
    body: DeclineInvitationBodySchema,
    prepare: async (ctx, db) => {
      const rate = await hitInvitationDecisionRate(db, ctx.userId, ctx.clock.now());
      if (!rate.ok) {
        throw new ApiError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde um pouco.", {
          retryAfterSeconds: rate.retryAfterS,
        });
      }
    },
  },
  async ({ ctx, tx, params }) => {
    const id = uuidSchema.safeParse(params.id);
    if (!id.success) throw notFound("Convite não encontrado.");
    return { status: 200, body: await declineInvitation(tx, ctx, id.data) };
  },
);
