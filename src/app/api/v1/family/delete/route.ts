import { withApi } from "@/lib/api/with-api";
import { DeleteFamilyBodySchema, deleteFamily } from "@/modules/privacidade/delete-family";
import { sendDeletionNotice } from "@/modules/privacidade/deletion-notice";

export const dynamic = "force-dynamic";

// SDD-028 §7.5 / US-081: só o Administrador, único membro ativo, digitando o nome da família.
// SEC-037: depois do commit, avisa o Administrador por e-mail.
export const POST = withApi(
  { role: "ADMIN", body: DeleteFamilyBodySchema, timeoutMs: 60_000 },
  async ({ ctx, tx, body }) => {
    const result = await deleteFamily(tx, ctx, body);
    return {
      status: 200,
      body: result,
      afterCommit: () =>
        sendDeletionNotice(ctx.email, {
          kind: "FAMILY",
          familyName: body.confirmFamilyName,
          at: ctx.clock.now(),
        }),
    };
  },
);
