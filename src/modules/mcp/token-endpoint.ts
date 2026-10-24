import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { sha256Hex } from "@/lib/ids";
import { ACCESS_TTL_S, canonicalResource, RATE } from "@/modules/mcp/config";
import { revokeGrant } from "@/modules/mcp/grants";
import { hit } from "@/modules/mcp/rate-limit";
import { hashToken, newTokenValue, pkceS256 } from "@/modules/mcp/tokens";

// SDD-024 §4.5 / §4.8: /token e /revoke. Erros no formato RFC 6749 §5.2.
type Env = Record<string, string | undefined>;

export type OAuthResult = {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
};

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const err = (status: number, error: string, description: string): OAuthResult => ({
  status,
  body: { error, error_description: description },
  headers: NO_STORE,
});
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const str = (v: unknown, max = 2000): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;

export async function handleTokenRequest(
  db: PrismaClient,
  form: Record<string, unknown>,
  now: Date,
  env: Env = process.env,
): Promise<OAuthResult> {
  const clientId = str(form.client_id, 500);
  if (!clientId) return err(400, "invalid_request", "client_id é obrigatório.");
  const limited = await hit(
    db,
    `token:${sha256Hex(clientId).slice(0, 16)}:min`,
    RATE.tokenPerMin,
    60,
    now,
  );
  if (!limited.ok) {
    return {
      status: 429,
      body: { error: "slow_down", error_description: "Muitas requisições." },
      headers: { ...NO_STORE, "Retry-After": String(limited.retryAfterS) },
    };
  }
  const grantType = str(form.grant_type, 50);
  const resource = str(form.resource, 500);
  if (resource && resource.replace(/\/+$/, "") !== canonicalResource(env)) {
    return err(400, "invalid_target", "resource inválido.");
  }
  if (grantType === "authorization_code") return exchangeCode(db, form, clientId, now);
  if (grantType === "refresh_token") return exchangeRefresh(db, form, clientId, now);
  return err(400, "unsupported_grant_type", "grant_type não suportado.");
}

async function issuePair(
  db: PrismaClient,
  grant: { id: string; expiresAt: Date; scopes: string[] },
  parentId: string,
  now: Date,
): Promise<OAuthResult> {
  const remainingS = Math.floor((grant.expiresAt.getTime() - now.getTime()) / 1000);
  const expiresIn = Math.min(ACCESS_TTL_S, remainingS);
  const access = newTokenValue("ACCESS");
  const refresh = newTokenValue("REFRESH");
  await db.mcpToken.createMany({
    data: [
      {
        grantId: grant.id,
        kind: "ACCESS",
        tokenHash: access.hash,
        parentId,
        expiresAt: new Date(now.getTime() + expiresIn * 1000),
      },
      {
        grantId: grant.id,
        kind: "REFRESH",
        tokenHash: refresh.hash,
        parentId,
        expiresAt: grant.expiresAt,
      },
    ],
  });
  return {
    status: 200,
    headers: NO_STORE,
    body: {
      access_token: access.value,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: refresh.value,
      scope: grant.scopes.join(" "),
    },
  };
}

/** Revoga o grant em transação própria (o erro devolvido ao cliente não pode desfazer a revogação). */
async function revokeForReuse(
  db: PrismaClient,
  grantId: string,
  reason: "CODE_REUSE" | "REFRESH_REUSE",
  now: Date,
) {
  await db.$transaction((tx) => revokeGrant(tx, grantId, reason, now));
}

async function exchangeCode(
  db: PrismaClient,
  form: Record<string, unknown>,
  clientId: string,
  now: Date,
): Promise<OAuthResult> {
  const code = str(form.code);
  const redirectUri = str(form.redirect_uri, 500);
  const verifier = str(form.code_verifier, 200);
  if (!code || !redirectUri || !verifier) {
    return err(400, "invalid_request", "code, redirect_uri e code_verifier são obrigatórios.");
  }
  if (!VERIFIER_RE.test(verifier)) return err(400, "invalid_grant", "code_verifier inválido.");
  const token = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(code) },
    include: { grant: { include: { client: true } } },
  });
  if (!token || token.kind !== "CODE") return err(400, "invalid_grant", "Código inválido.");
  const grant = token.grant;
  if (token.usedAt) {
    // replay do código: revoga a conexão inteira (o acesso emitido na 1ª troca deixa de valer)
    await revokeForReuse(db, grant.id, "CODE_REUSE", now);
    return err(400, "invalid_grant", "Código inválido.");
  }
  // consumo atômico: só uma troca concorrente vence
  const claimed = await db.mcpToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count === 0) {
    await revokeForReuse(db, grant.id, "CODE_REUSE", now);
    return err(400, "invalid_grant", "Código inválido.");
  }
  if (token.expiresAt <= now) return err(400, "invalid_grant", "Código expirado.");
  if (grant.status !== "ACTIVE" || grant.expiresAt <= now) {
    return err(400, "invalid_grant", "Conexão inválida.");
  }
  if (grant.client?.clientId !== clientId) return err(400, "invalid_grant", "Cliente não confere.");
  if (token.redirectUri !== redirectUri)
    return err(400, "invalid_grant", "redirect_uri não confere.");
  if (!token.codeChallenge || !safeEqual(pkceS256(verifier), token.codeChallenge)) {
    return err(400, "invalid_grant", "Verificador PKCE inválido.");
  }
  return issuePair(db, grant, token.id, now);
}

async function exchangeRefresh(
  db: PrismaClient,
  form: Record<string, unknown>,
  clientId: string,
  now: Date,
): Promise<OAuthResult> {
  const refresh = str(form.refresh_token);
  if (!refresh) return err(400, "invalid_request", "refresh_token é obrigatório.");
  const token = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(refresh) },
    include: { grant: { include: { client: true } } },
  });
  if (!token || token.kind !== "REFRESH")
    return err(400, "invalid_grant", "Refresh token inválido.");
  const grant = token.grant;
  if (grant.client?.clientId !== clientId) return err(400, "invalid_grant", "Cliente não confere.");
  if (grant.status !== "ACTIVE") return err(400, "invalid_grant", "Conexão inválida.");
  if (grant.expiresAt <= now || token.expiresAt <= now) {
    await db.mcpGrant.updateMany({
      where: { id: grant.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    return err(400, "invalid_grant", "Conexão expirada.");
  }
  if (token.usedAt) {
    await revokeForReuse(db, grant.id, "REFRESH_REUSE", now);
    return err(400, "invalid_grant", "Refresh token inválido.");
  }
  const scope = str(form.scope, 200);
  if (scope) {
    const asked = scope.split(/\s+/);
    if (!asked.every((s) => grant.scopes.includes(s) || s === "offline_access")) {
      return err(400, "invalid_scope", "O escopo não pode ser ampliado.");
    }
  }
  const claimed = await db.mcpToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count === 0) {
    // troca concorrente do mesmo refresh: segurança acima de conveniência
    await revokeForReuse(db, grant.id, "REFRESH_REUSE", now);
    return err(400, "invalid_grant", "Refresh token inválido.");
  }
  return issuePair(db, grant, token.id, now);
}

/** RFC 7009: sempre 200. Token de um grant ⇒ revoga o grant inteiro (`CLIENT`). */
export async function handleRevokeRequest(
  db: PrismaClient,
  form: Record<string, unknown>,
  now: Date,
): Promise<OAuthResult> {
  const ok: OAuthResult = { status: 200, body: {}, headers: NO_STORE };
  const value = str(form.token);
  const clientId = str(form.client_id, 500);
  if (!value || !clientId) return ok;
  const token = await db.mcpToken.findUnique({
    where: { tokenHash: hashToken(value) },
    include: { grant: { include: { client: true } } },
  });
  if (!token || token.grant.client?.clientId !== clientId) return ok;
  await db.$transaction((tx) => revokeGrant(tx, token.grantId, "CLIENT", now));
  return ok;
}
