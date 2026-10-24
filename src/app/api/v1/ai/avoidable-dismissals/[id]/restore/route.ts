import { withApi } from "@/lib/api/with-api";
import { restoreDismissal } from "@/modules/analise-ia/dismissals";

export const dynamic = "force-dynamic";

// "Voltar a sugerir" (e o "Desfazer" do aviso): remove o descarte.
export const POST = withApi({}, async ({ ctx, tx, params }) => ({
  status: 200,
  body: await restoreDismissal(tx, ctx, params.id as string),
}));
