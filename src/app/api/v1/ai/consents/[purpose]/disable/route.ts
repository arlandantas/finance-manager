import { withApi } from "@/lib/api/with-api";
import { disableConsent, parsePurpose } from "@/modules/ia/consent";
import { DisableConsentSchema } from "@/modules/ia/consent-schemas";

export const dynamic = "force-dynamic";

export const POST = withApi({ body: DisableConsentSchema }, async ({ ctx, tx, body, params }) => ({
  status: 200,
  body: await disableConsent(tx, ctx, parsePurpose(params.purpose as string), body),
}));
