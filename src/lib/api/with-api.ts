import { z } from "zod";
import {
  ApiError,
  badRequest,
  type ErrorDetails,
  forbidden,
  unauthenticated,
  unprocessable,
} from "@/lib/api/errors";
import {
  claimIdempotencyKey,
  IDEMPOTENCY_HEADER,
  parseIdempotencyKey,
  requestHash,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import { errorResponse, jsonResponse } from "@/lib/api/response";
import type { ApiResult, RequestContext, Role, Tx, UserContext } from "@/lib/api/types";
import { findSessionUser, parseCookieHeader, sessionTokenFromCookies } from "@/lib/auth/session";
import { getClock } from "@/lib/clock";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";

export type AuthMode = "family" | "user" | "none";

type CtxFor<A extends AuthMode> = A extends "family"
  ? RequestContext
  : A extends "user"
    ? UserContext
    : { clock: UserContext["clock"]; requestId: string };

export type ApiOptions<A extends AuthMode, B, Q> = {
  auth?: A; // padrão "family"
  role?: Role;
  body?: z.ZodType<B, unknown>;
  query?: z.ZodType<Q, unknown>;
  idempotent?: boolean; // padrão: true para métodos não-GET
  isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable";
};

export type HandlerArgs<A extends AuthMode, B, Q> = {
  ctx: CtxFor<A>;
  body: B;
  query: Q;
  tx: Tx;
  req: Request;
  params: Record<string, string>;
};

export type RouteContext = { params: Promise<Record<string, string>> };
export type RouteHandler = (req: Request, route: RouteContext) => Promise<Response>;

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function zodDetails(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

function validationError(error: z.ZodError): ApiError {
  const details = zodDetails(error);
  return badRequest("VALIDATION_ERROR", details[0]?.message ?? "Dados inválidos.", details);
}

/** CSRF (SDD-000 §2): `Content-Type: application/json` e `Origin` igual ao host de AUTH_URL. */
function checkCsrf(req: Request) {
  const expected = new URL(getEnv().AUTH_URL).host;
  const origin = req.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (originHost !== expected || !contentType.toLowerCase().startsWith("application/json")) {
    throw forbidden("Requisição não autorizada.", "BAD_ORIGIN");
  }
}

export function withApi<A extends AuthMode = "family", B = undefined, Q = undefined>(
  opts: ApiOptions<A, B, Q>,
  handler: (a: HandlerArgs<A, B, Q>) => Promise<ApiResult>,
): RouteHandler {
  return async (req, route) => {
    const requestId = newId();
    const clock = getClock();
    try {
      const method = req.method.toUpperCase();
      const mutating = MUTATING.has(method);
      const auth: AuthMode = opts.auth ?? "family";
      const idempotent = opts.idempotent ?? mutating;
      const db = getDb();

      // 1) CSRF
      if (mutating) checkCsrf(req);

      // 2..4) sessão, membro, papel
      let ctx: unknown = { clock, requestId };
      let userId: string | null = null;
      if (auth !== "none") {
        const cookies = parseCookieHeader(req.headers.get("cookie"));
        const user = await findSessionUser(db, sessionTokenFromCookies(cookies));
        if (!user) throw unauthenticated();
        userId = user.userId;
        const base: UserContext = {
          userId: user.userId,
          email: user.email,
          name: user.name,
          image: user.image,
          clock,
          requestId,
        };
        ctx = base;
        if (auth === "family") {
          const member = await db.member.findUnique({ where: { userId: user.userId } });
          if (!member) throw forbidden("Você ainda não faz parte de uma família.", "NO_FAMILY");
          if (opts.role && member.role !== opts.role) throw forbidden();
          ctx = {
            ...base,
            memberId: member.id,
            familyId: member.familyId,
            role: member.role,
          } satisfies RequestContext;
        }
      }

      // 5) validação
      const params = (await route.params) ?? {};
      const url = new URL(req.url);
      let rawBody: unknown;
      let body = undefined as B;
      if (opts.body) {
        try {
          rawBody = await req.json();
        } catch {
          throw badRequest("INVALID_JSON", "Corpo da requisição inválido.");
        }
        const parsed = opts.body.safeParse(rawBody);
        if (!parsed.success) throw validationError(parsed.error);
        body = parsed.data;
      }
      let query = undefined as Q;
      if (opts.query) {
        const parsed = opts.query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) throw validationError(parsed.error);
        query = parsed.data;
      }

      // 6) Idempotency-Key
      let key: string | null = null;
      if (idempotent && mutating) {
        key = parseIdempotencyKey(req.headers.get(IDEMPOTENCY_HEADER));
        if (!key) {
          throw badRequest(
            "IDEMPOTENCY_KEY_REQUIRED",
            "Informe o cabeçalho Idempotency-Key (UUID).",
          );
        }
      }
      const hash = key ? requestHash(method, url.pathname, rawBody) : "";

      // 7..8) transação, idempotência e handler
      const outcome = await db.$transaction(
        async (tx) => {
          if (key && userId) {
            const claim = await claimIdempotencyKey(tx, {
              userId,
              key,
              method,
              path: url.pathname,
              hash,
            });
            if (!claim.claimed) {
              if ("reused" in claim) {
                throw unprocessable(
                  "IDEMPOTENCY_KEY_REUSED",
                  "Esta chave de idempotência já foi usada com outra requisição.",
                );
              }
              return {
                result: {
                  status: claim.replay.status,
                  body: claim.replay.body,
                  headers: { "Idempotent-Replay": "true" },
                } as ApiResult,
              };
            }
          }
          const result = await handler({ ctx: ctx as CtxFor<A>, body, query, tx, req, params });
          if (key && userId && result.status >= 200 && result.status < 300) {
            await saveIdempotentResponse(tx, {
              userId,
              key,
              status: result.status,
              body: result.body,
            });
          }
          return { result };
        },
        {
          maxWait: 10_000,
          timeout: 30_000,
          ...(opts.isolationLevel ? { isolationLevel: opts.isolationLevel } : {}),
        },
      );
      return jsonResponse(outcome.result, requestId);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.toBody(), requestId);
      logger.error(
        { requestId, err: e instanceof Error ? { message: e.message, stack: e.stack } : String(e) },
        "erro inesperado na API",
      );
      return errorResponse(
        500,
        { error: { code: "INTERNAL", message: "Erro inesperado. Tente novamente em instantes." } },
        requestId,
      );
    }
  };
}

export type { ErrorDetails };
