import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
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
import { API_RATE_PER_MIN, hitApiRate } from "@/lib/api/rate-limit";
import { readJsonCapped } from "@/lib/api/read-body";
import { errorResponse, jsonResponse } from "@/lib/api/response";
import type { ApiResult, RequestContext, Role, Tx, UserContext } from "@/lib/api/types";
import { findSessionUser, parseCookieHeader, sessionTokenFromCookies } from "@/lib/auth/session";
import { getClock } from "@/lib/clock";
import { getDb } from "@/lib/db";
import { isAllowedDevHost } from "@/lib/dev-origins";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/ids";
import { describeError } from "@/lib/log-error";
import { logger } from "@/lib/logger";
import { findActiveMembership } from "@/modules/familia/repo";

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
  /** Roda após autenticação/validação e ANTES da transação do handler (ex.: geração da recorrência). */
  prepare?: (ctx: CtxFor<A>, db: PrismaClient) => Promise<void>;
  isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable";
  /** Prazo da transação do handler (padrão 30 s). Rotas que esperam o LLM (US-070) precisam de mais. */
  timeoutMs?: number;
  /** Upload de arquivo (US-066): aceita `multipart/form-data` no CSRF; o handler lê o corpo (`req`). */
  multipart?: boolean;
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

/** Query string ⇒ objeto; parâmetro REPETIDO vira array (`tagIds=a&tagIds=b`, SDD-016 §1); o resto, texto. */
export function queryObject(params: URLSearchParams): Record<string, string | string[]> {
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const all = params.getAll(key);
      return [key, all.length > 1 ? all : (all[0] as string)] as const;
    }),
  );
}

function validationError(error: z.ZodError): ApiError {
  const details = zodDetails(error);
  return badRequest("VALIDATION_ERROR", details[0]?.message ?? "Dados inválidos.", details);
}

/** CSRF (SDD-000 §2): `Content-Type: application/json` e `Origin` igual ao host de AUTH_URL ou, fora de produção, origem de dev (APP_PUBLIC_ORIGIN, APP_DEV_ORIGINS, IP privado/`*.local`). */
function checkCsrf(req: Request, multipart = false) {
  const env = getEnv();
  const allowed = new Set([new URL(env.AUTH_URL).host]);
  const origin = req.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (
    originHost === null ||
    !(allowed.has(originHost) || isAllowedDevHost(origin, process.env)) ||
    !(
      contentType.toLowerCase().startsWith("application/json") ||
      (multipart && contentType.toLowerCase().startsWith("multipart/form-data"))
    )
  ) {
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
      if (mutating) checkCsrf(req, opts.multipart);

      // 2..4) sessão, membro, papel
      let ctx: unknown = { clock, requestId };
      let userId: string | null = null;
      if (auth !== "none") {
        const cookies = parseCookieHeader(req.headers.get("cookie"));
        const user = await findSessionUser(db, sessionTokenFromCookies(cookies));
        if (!user) throw unauthenticated();
        userId = user.userId;
        // SEC-020: limite por usuário no Postgres (janela de 1 min; serverless não tem memória compartilhada)
        const rate = await hitApiRate(db, user.userId, clock.now());
        if (!rate.ok) {
          throw new ApiError(429, "RATE_LIMITED", "Muitas requisições. Aguarde um instante.", {
            limit: API_RATE_PER_MIN,
            retryAfterSeconds: rate.retryAfterS,
          });
        }
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
          const member = await findActiveMembership(user.userId, db);
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
        rawBody = await readJsonCapped(req); // SEC-007: teto de bytes
        const parsed = opts.body.safeParse(rawBody);
        if (!parsed.success) throw validationError(parsed.error);
        body = parsed.data;
      }
      let query = undefined as Q;
      if (opts.query) {
        const parsed = opts.query.safeParse(queryObject(url.searchParams));
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

      if (opts.prepare) await opts.prepare(ctx as CtxFor<A>, db);

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
          timeout: opts.timeoutMs ?? 30_000,
          ...(opts.isolationLevel ? { isolationLevel: opts.isolationLevel } : {}),
        },
      );
      let result = outcome.result;
      if (result.afterCommit) {
        const patch = await result.afterCommit().catch(() => undefined);
        if (patch && result.body && typeof result.body === "object") {
          result = { ...result, body: { ...(result.body as Record<string, unknown>), ...patch } };
          if (key && userId) {
            await db.idempotencyRecord
              .update({
                where: { userId_key: { userId, key } },
                data: { responseBody: result.body as object },
              })
              .catch(() => undefined);
          }
        }
      }
      return jsonResponse(result, requestId);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.toBody(), requestId);
      logger.error({ requestId, err: describeError(e) }, "erro inesperado na API"); // SEC-012: sem message
      return errorResponse(
        500,
        { error: { code: "INTERNAL", message: "Erro inesperado. Tente novamente em instantes." } },
        requestId,
      );
    }
  };
}

export type { ErrorDetails };
