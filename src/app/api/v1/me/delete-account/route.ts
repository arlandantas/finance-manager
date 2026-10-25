import { withApi } from "@/lib/api/with-api";
import { DeleteAccountBodySchema, deleteAccount } from "@/modules/privacidade/delete-account";

export const dynamic = "force-dynamic";

// SDD-028 §7.4 / US-080: excluir a minha conta (anonimiza; o histórico da família permanece).
export const POST = withApi(
  { auth: "user", body: DeleteAccountBodySchema, idempotent: false },
  async ({ ctx, tx, body }) => ({
    status: 200,
    body: await deleteAccount(tx, ctx, body),
  }),
);
