import { withApi } from "@/lib/api/with-api";
import { enableConsent, parsePurpose } from "@/modules/ia/consent";
import { EnableConsentSchema } from "@/modules/ia/consent-schemas";

export const dynamic = "force-dynamic";

// SDD-022 §3: só ADMIN (a regra e a mensagem ficam no serviço).
export const POST = withApi({ body: EnableConsentSchema }, async ({ ctx, tx, body, params }) => ({
  status: 200,
  body: await enableConsent(tx, ctx, parsePurpose(params.purpose as string), body),
}));
