import { z } from "zod";
import { withApi } from "@/lib/api/with-api";
import { hashSessionToken, parseCookieHeader, sessionTokenFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// SEC-018 / SDD-028 §6.2: "Encerrar as outras sessões": apaga todas as sessões do usuário, menos a atual.
export const POST = withApi(
  { auth: "user", body: z.object({}).strict() },
  async ({ ctx, tx, req }) => {
    const token = sessionTokenFromCookies(parseCookieHeader(req.headers.get("cookie")));
    const res = await tx.session.deleteMany({
      where: {
        userId: ctx.userId,
        ...(token ? { NOT: { tokenHash: hashSessionToken(token) } } : {}),
      },
    });
    return { status: 200, body: { revoked: res.count } };
  },
);
