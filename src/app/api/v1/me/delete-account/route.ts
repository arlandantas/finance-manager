import { withApi } from "@/lib/api/with-api";
import { DeleteAccountBodySchema, deleteAccount } from "@/modules/privacidade/delete-account";
import { sendDeletionNotice } from "@/modules/privacidade/deletion-notice";

export const dynamic = "force-dynamic";

// SDD-028 §7.4 / US-080: excluir a minha conta (anonimiza; o histórico da família permanece).
// SEC-037: depois do commit, avisa por e-mail o endereço que a conta tinha (só na 1ª exclusão).
export const POST = withApi(
  { auth: "user", body: DeleteAccountBodySchema, idempotent: false },
  async ({ ctx, tx, body }) => {
    const before = await tx.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, deletedAt: true },
    });
    const result = await deleteAccount(tx, ctx, body);
    const notify = before && !before.deletedAt ? before.email : null;
    return {
      status: 200,
      body: result,
      ...(notify
        ? {
            afterCommit: () => sendDeletionNotice(notify, { kind: "ACCOUNT", at: ctx.clock.now() }),
          }
        : {}),
    };
  },
);
