import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { withApi } from "@/lib/api/with-api";
import { todayInFamilyTz } from "@/lib/dates";
import { hit, refund } from "@/modules/mcp/rate-limit";
import { buildExport } from "@/modules/privacidade/export";
import { EXPORT_MAX_BYTES } from "@/modules/privacidade/export-schema";

export const dynamic = "force-dynamic";

/** SEC-017b: no máximo 3 downloads por dia por pessoa (janela fixa de 24 h). Falha do servidor ou 413 devolve a cota (SEC-032). */
export const EXPORTS_PER_DAY = 3;

// Cliente do banco da requisição (de `prepare`), para devolver a cota fora da transação do handler.
const dbOf = new WeakMap<object, PrismaClient>();

// SDD-028 §7.3 / US-079: "Baixar meus dados" (JSON, `Content-Disposition: attachment`).
export const GET = withApi(
  {
    auth: "user",
    prepare: async (ctx, db) => {
      dbOf.set(ctx, db);
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
    let file: Awaited<ReturnType<typeof buildExport>>["file"];
    try {
      ({ file } = await buildExport(tx, ctx, max));
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      if (status >= 500 || status === 413) {
        const db = dbOf.get(ctx);
        if (db)
          await refund(db, `export:${ctx.userId}:day`, 86_400, ctx.clock.now()).catch(() => {});
      }
      throw e;
    }
    return {
      status: 200,
      body: file,
      headers: {
        "Content-Disposition": `attachment; filename="meus-dados-${todayInFamilyTz(ctx.clock)}.json"`,
      },
    };
  },
);
