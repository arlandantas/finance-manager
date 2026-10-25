import { ApiError } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { todayInFamilyTz } from "@/lib/dates";
import { hit } from "@/modules/mcp/rate-limit";
import { buildExport } from "@/modules/privacidade/export";
import { EXPORT_MAX_BYTES } from "@/modules/privacidade/export-schema";

export const dynamic = "force-dynamic";

/** SEC-017b: no máximo 3 downloads por dia por pessoa (janela fixa de 24 h, contada também nas falhas). */
export const EXPORTS_PER_DAY = 3;

// SDD-028 §7.3 / US-079: "Baixar meus dados" (JSON, `Content-Disposition: attachment`).
export const GET = withApi(
  {
    auth: "user",
    prepare: async (ctx, db) => {
      const r = await hit(db, `export:${ctx.userId}:day`, EXPORTS_PER_DAY, 86_400, ctx.clock.now());
      if (!r.ok) {
        throw new ApiError(
          429,
          "EXPORT_LIMIT",
          `Você já baixou seus dados ${EXPORTS_PER_DAY} vezes hoje. Tente de novo amanhã.`,
          { retryAfterSeconds: r.retryAfterS },
        );
      }
    },
  },
  async ({ ctx, tx }) => {
    const max = Number(process.env.PRIVACY_EXPORT_MAX_BYTES) || EXPORT_MAX_BYTES;
    const { file } = await buildExport(tx, ctx, max);
    return {
      status: 200,
      body: file,
      headers: {
        "Content-Disposition": `attachment; filename="meus-dados-${todayInFamilyTz(ctx.clock)}.json"`,
      },
    };
  },
);
