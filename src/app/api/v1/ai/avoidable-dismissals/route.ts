import { withApi } from "@/lib/api/with-api";
import { createDismissal, listDismissals } from "@/modules/analise-ia/dismissals";
import { CreateDismissalSchema } from "@/modules/analise-ia/schemas";

export const dynamic = "force-dynamic";

export const GET = withApi({}, async ({ ctx, tx }) => ({
  status: 200,
  body: await listDismissals(tx, ctx),
}));

// SDD-023 §3: "Importante para nós". Qualquer membro; vale para a família.
export const POST = withApi({ body: CreateDismissalSchema }, async ({ ctx, tx, body }) => ({
  status: 201,
  body: await createDismissal(tx, ctx, body),
}));
