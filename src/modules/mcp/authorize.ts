import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { conflict, notFound } from "@/lib/api/errors";
import type { Clock } from "@/lib/clock";
import { sha256Hex } from "@/lib/ids";
import { uuidSchema } from "@/lib/schemas";
import { recordAudit } from "@/modules/mcp/audit";
import {
  assertCimdUrl,
  CimdError,
  type FetchImpl,
  fetchCimd,
  isCimdRedirectUri,
} from "@/modules/mcp/cimd";
import {
  AUTH_REQUEST_TTL_S,
  CIMD_CACHE_MS,
  CODE_TTL_S,
  canonicalResource,
  cimdAllowedClientIds,
  issuerOf,
  RATE,
  SUPPORTED_SCOPES,
} from "@/modules/mcp/config";
import { hit } from "@/modules/mcp/rate-limit";
import { redirectUriMatches } from "@/modules/mcp/redirect";
import { newTokenValue } from "@/modules/mcp/tokens";

type Env = Record<string, string | undefined>;
type Tx = Prisma.TransactionClient;

// ───────── /oauth/authorize (SDD-024 §4.3) ─────────
export const AuthorizeQuerySchema = z.object({
  response_type: z.string().optional(),
  client_id: z.string().min(1).max(500),
  redirect_uri: z.string().max(500),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  resource: z.string().max(500).optional(),
  scope: z.string().max(200).optional(),
  state: z.string().max(500).optional(),
});

const CHALLENGE_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export type AuthorizeOutcome =
  /** Cliente/redirect inválidos: página de erro, SEM redirecionar (RFC 6749 §4.1.2.1). */
  | { kind: "error-page"; reason: "unknown_client" | "bad_redirect" | "rate_limited" | "disabled" }
  | { kind: "redirect-error"; location: string }
  | { kind: "ok"; requestId: string };

export function errorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | undefined,
  env: Env = process.env,
): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state !== undefined) u.searchParams.set("state", state);
  u.searchParams.set("iss", issuerOf(env));
  return u.toString();
}

function normalizeResource(r: string): string {
  return r.replace(/\/+$/, "");
}

function cimdStillValid(c: { clientId: string; redirectUris: string[] }, allowed: string[]) {
  try {
    const host = assertCimdUrl(c.clientId, allowed).hostname;
    return c.redirectUris.length > 0 && c.redirectUris.every((r) => isCimdRedirectUri(r, host));
  } catch {
    return false;
  }
}

/** Resolve o cliente: CIMD (URL https) com cache de 24 h em `mcp_clients`, senão DCR já registrado. */
export async function resolveClient(
  db: Pick<PrismaClient, "mcpClient">,
  clientId: string,
  now: Date,
  opts: { env?: Env; fetchImpl?: FetchImpl; ip?: string } = {},
) {
  const env = opts.env ?? process.env;
  if (/^https?:\/\//i.test(clientId)) {
    const cached = await db.mcpClient.findUnique({ where: { clientId } });
    const allowed = cimdAllowedClientIds(env);
    if (
      cached?.kind === "CIMD" &&
      cached.metadataFetchedAt &&
      now.getTime() - cached.metadataFetchedAt.getTime() < CIMD_CACHE_MS
    ) {
      // SEC-010: o cliente gravado é revalidado contra as regras atuais a cada uso (inclusive o cache)
      return cimdStillValid(cached, allowed) ? cached : null;
    }
    try {
      const doc = await fetchCimd(clientId, allowed, opts.fetchImpl);
      return await db.mcpClient.upsert({
        where: { clientId },
        create: {
          clientId,
          kind: "CIMD",
          clientName: doc.clientName,
          redirectUris: doc.redirectUris,
          softwareId: doc.softwareId,
          metadataFetchedAt: now,
        },
        update: {
          clientName: doc.clientName,
          redirectUris: doc.redirectUris,
          softwareId: doc.softwareId,
          metadataFetchedAt: now,
        },
      });
    } catch (e) {
      if (e instanceof CimdError) return null;
      // Falha de rede/banco com cache vencido: não usar metadado velho (falha fechada).
      return null;
    }
  }
  return db.mcpClient.findFirst({ where: { clientId, kind: "DCR" } });
}

export async function validateAuthorize(
  db: PrismaClient,
  query: URLSearchParams,
  clock: Clock,
  opts: { env?: Env; fetchImpl?: FetchImpl; ip?: string } = {},
): Promise<AuthorizeOutcome> {
  const env = opts.env ?? process.env;
  const raw = Object.fromEntries(query);
  const parsed = AuthorizeQuerySchema.safeParse(raw);
  if (!parsed.success) return { kind: "error-page", reason: "unknown_client" };
  const q = parsed.data;
  const now = clock.now();

  const limited = await hit(
    db,
    `authorize:${sha256Hex(`${opts.ip ?? "unknown"}|${q.client_id}`).slice(0, 16)}:min`,
    RATE.authorizePerMin,
    60,
    now,
  );
  if (!limited.ok) return { kind: "error-page", reason: "rate_limited" };

  // 1) cliente e redirect_uri primeiro; falha => página de erro, nunca redirecionamento
  const client = await resolveClient(db, q.client_id, now, opts);
  if (!client) return { kind: "error-page", reason: "unknown_client" };
  // CIMD: igualdade exata de string (sem exceção de loopback); DCR segue redirectUriMatches
  const redirectOk =
    client.kind === "CIMD"
      ? client.redirectUris.includes(q.redirect_uri)
      : client.redirectUris.some((r) => redirectUriMatches(r, q.redirect_uri));
  if (!redirectOk) {
    return { kind: "error-page", reason: "bad_redirect" };
  }
  const fail = (error: string, description: string): AuthorizeOutcome => ({
    kind: "redirect-error",
    location: errorRedirect(q.redirect_uri, error, description, q.state, env),
  });

  // 2) demais validações redirecionam com erro
  if (q.response_type !== "code")
    return fail("unsupported_response_type", "Só response_type=code.");
  if (
    !q.code_challenge ||
    q.code_challenge_method !== "S256" ||
    !CHALLENGE_RE.test(q.code_challenge)
  ) {
    return fail("invalid_request", "PKCE com code_challenge_method=S256 é obrigatório.");
  }
  if (!q.resource || normalizeResource(q.resource) !== canonicalResource(env)) {
    return fail("invalid_target", "resource inválido.");
  }
  const known = new Set<string>(SUPPORTED_SCOPES);
  const asked = (q.scope ?? "").split(/\s+/).filter((s) => known.has(s));
  const scopes = asked.length > 0 ? [...new Set(asked)] : ["read"];

  const req = await db.mcpAuthorizationRequest.create({
    data: {
      clientId: client.id,
      redirectUri: q.redirect_uri,
      state: q.state ?? null,
      codeChallenge: q.code_challenge,
      scopesRequested: scopes,
      resource: canonicalResource(env),
      expiresAt: new Date(now.getTime() + AUTH_REQUEST_TTL_S * 1000),
    },
  });
  return { kind: "ok", requestId: req.id };
}

// ───────── Consentimento (SDD-024 §4.4 + SDD-025 §8.1) ─────────
export const ConsentDecisionSchema = z
  .object({
    requestId: uuidSchema,
    decision: z.enum(["allow", "deny"]),
    label: z.string().trim().min(2).max(40).optional(),
    validityDays: z.union([z.literal(30), z.literal(90)]).default(30),
    allowWrite: z.boolean().default(false),
    privacyAcknowledged: z.literal(true).optional(),
    writeAcknowledged: z.literal(true).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.decision === "allow" && v.privacyAcknowledged !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["privacyAcknowledged"],
        message: "Confirme que entendeu o aviso",
      });
    }
    if (v.decision === "allow" && v.allowWrite && v.writeAcknowledged !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["writeAcknowledged"],
        message: "Confirme que entendeu o aviso de lançamento",
      });
    }
  });
export type ConsentDecision = z.infer<typeof ConsentDecisionSchema>;

export type DecisionCtx = { userId: string; memberId: string; familyId: string };

export class RequestExpiredError extends Error {}

export async function decideConsent(
  tx: Tx,
  ctx: DecisionCtx,
  input: ConsentDecision,
  now: Date,
  env: Env = process.env,
): Promise<{ redirectTo: string }> {
  // pedido de uso único, travado
  await tx.$queryRaw`SELECT id FROM oauth_authorization_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
  const req = await tx.mcpAuthorizationRequest.findUnique({
    where: { id: input.requestId },
    include: { client: true },
  });
  if (!req) throw notFound("Pedido de conexão não encontrado.");
  if (req.consumedAt || req.expiresAt <= now || (req.userId && req.userId !== ctx.userId)) {
    throw conflict(
      "REQUEST_EXPIRED",
      "Este pedido de conexão expirou. Volte ao seu assistente e tente de novo.",
    );
  }

  const done = async () =>
    tx.mcpAuthorizationRequest.update({
      where: { id: req.id },
      data: { consumedAt: now, userId: ctx.userId },
    });

  if (input.decision === "deny") {
    await done();
    return {
      redirectTo: errorRedirect(
        req.redirectUri,
        "access_denied",
        "O usuário negou o acesso.",
        req.state ?? undefined,
        env,
      ),
    };
  }

  const fam = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT "assistantAccessEnabled" AS ok FROM families WHERE id = ${ctx.familyId}::uuid FOR SHARE`;
  if (!fam[0]?.ok) {
    throw conflict("ASSISTANT_BLOCKED", "O Administrador bloqueou o acesso por assistente");
  }

  const wantsWrite = req.scopesRequested.includes("write");
  const writeGranted = input.allowWrite && wantsWrite;
  const scopes = writeGranted ? ["read", "write"] : ["read"];
  const label = (input.label ?? req.client.clientName).trim().slice(0, 40) || "Meu assistente";

  // reconectar o mesmo cliente revoga a conexão anterior desse par (evita conexões fantasmas)
  const previous = await tx.mcpGrant.findMany({
    where: { memberId: ctx.memberId, clientId: req.clientId, status: "ACTIVE" },
    select: { id: true, familyId: true, memberId: true, label: true },
  });
  for (const p of previous) {
    await tx.mcpGrant.update({
      where: { id: p.id },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedReason: "CLIENT",
        revokedByMemberId: ctx.memberId,
      },
    });
    await recordAudit(tx, {
      familyId: p.familyId,
      memberId: p.memberId,
      grantId: p.id,
      clientName: req.client.clientName,
      kind: "REVOKED",
      params: { reason: "CLIENT" },
      outcome: "OK",
      at: now,
    });
  }

  const grant = await tx.mcpGrant.create({
    data: {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      userId: ctx.userId,
      kind: "OAUTH",
      clientId: req.clientId,
      label,
      scopes,
      resource: req.resource,
      expiresAt: new Date(now.getTime() + input.validityDays * 86_400_000),
    },
  });
  const code = newTokenValue("CODE");
  await tx.mcpToken.create({
    data: {
      grantId: grant.id,
      kind: "CODE",
      tokenHash: code.hash,
      codeChallenge: req.codeChallenge,
      redirectUri: req.redirectUri,
      expiresAt: new Date(now.getTime() + CODE_TTL_S * 1000),
    },
  });
  await recordAudit(tx, {
    familyId: ctx.familyId,
    memberId: ctx.memberId,
    grantId: grant.id,
    clientName: req.client.clientName,
    kind: "CONNECTED",
    params: {
      validityDays: input.validityDays,
      scopes,
      ...(writeGranted ? { writeAcknowledged: true } : {}),
    },
    outcome: "OK",
    at: now,
  });
  await done();

  const u = new URL(req.redirectUri);
  u.searchParams.set("code", code.value);
  if (req.state !== null) u.searchParams.set("state", req.state);
  u.searchParams.set("iss", issuerOf(env));
  return { redirectTo: u.toString() };
}

/** Dados da tela de consentimento (SDD-025 §4.1); `null` = pedido inexistente/expirado/consumido. */
export async function loadConsentView(
  db: Pick<PrismaClient, "mcpAuthorizationRequest">,
  requestId: string,
  userId: string,
  now: Date,
) {
  if (!uuidSchema.safeParse(requestId).success) return null;
  const req = await db.mcpAuthorizationRequest.findUnique({
    where: { id: requestId },
    include: { client: true },
  });
  if (!req || req.consumedAt || req.expiresAt <= now) return null;
  if (req.userId && req.userId !== userId) return null;
  if (!req.userId) {
    await db.mcpAuthorizationRequest.updateMany({
      where: { id: req.id, userId: null },
      data: { userId },
    });
  }
  return {
    requestId: req.id,
    clientName: req.client.clientName,
    redirectUri: req.redirectUri,
    scopesRequested: req.scopesRequested,
    redirectHost: new URL(req.redirectUri).host,
    clientHost: /^https?:\/\//.test(req.client.clientId) ? new URL(req.client.clientId).host : null,
  };
}
