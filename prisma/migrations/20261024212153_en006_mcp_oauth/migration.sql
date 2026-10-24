-- CreateEnum
CREATE TYPE "McpClientKind" AS ENUM ('CIMD', 'DCR');

-- CreateEnum
CREATE TYPE "McpGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "McpGrantKind" AS ENUM ('OAUTH', 'PAT');

-- CreateEnum
CREATE TYPE "McpRevokedReason" AS ENUM ('MEMBER', 'FAMILY_BLOCKED', 'MEMBER_REMOVED', 'REFRESH_REUSE', 'CODE_REUSE', 'CLIENT');

-- CreateEnum
CREATE TYPE "McpTokenKind" AS ENUM ('CODE', 'ACCESS', 'REFRESH');

-- CreateEnum
CREATE TYPE "McpAuditOutcome" AS ENUM ('OK', 'DENIED_SCOPE', 'INVALID', 'RATE_LIMITED', 'ERROR', 'LIMIT_EXCEEDED');

-- CreateEnum
CREATE TYPE "McpAuditKind" AS ENUM ('TOOL', 'CONNECTED', 'REVOKED', 'BLOCKED', 'LIMITS_CHANGED');

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "assistantAccessEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "mcp_clients" (
    "id" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "McpClientKind" NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "softwareId" TEXT,
    "metadataFetchedAt" TIMESTAMPTZ(3),
    "registrationIpHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_authorization_requests" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "scopesRequested" TEXT[],
    "resource" TEXT NOT NULL,
    "userId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_authorization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_grants" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "McpGrantKind" NOT NULL DEFAULT 'OAUTH',
    "clientId" UUID,
    "label" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT NOT NULL,
    "status" "McpGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" "McpRevokedReason",
    "revokedByMemberId" UUID,
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "kind" "McpTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeChallenge" TEXT,
    "redirectUri" TEXT,
    "parentId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_rate_buckets" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "mcp_rate_buckets_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "mcp_audit_events" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "grantId" UUID,
    "clientName" TEXT NOT NULL,
    "kind" "McpAuditKind" NOT NULL,
    "tool" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "outcome" "McpAuditOutcome" NOT NULL,
    "errorCode" TEXT,
    "proposalId" UUID,
    "transactionId" UUID,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_clients_clientId_key" ON "mcp_clients"("clientId");

-- CreateIndex
CREATE INDEX "oauth_authorization_requests_expiresAt_idx" ON "oauth_authorization_requests"("expiresAt");

-- CreateIndex
CREATE INDEX "mcp_grants_familyId_memberId_status_idx" ON "mcp_grants"("familyId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_grants_familyId_id_key" ON "mcp_grants"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tokens_tokenHash_key" ON "mcp_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mcp_tokens_grantId_kind_idx" ON "mcp_tokens"("grantId", "kind");

-- CreateIndex
CREATE INDEX "mcp_tokens_expiresAt_idx" ON "mcp_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "mcp_audit_events_familyId_memberId_createdAt_idx" ON "mcp_audit_events"("familyId", "memberId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "mcp_audit_events_grantId_createdAt_idx" ON "mcp_audit_events"("grantId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "oauth_authorization_requests" ADD CONSTRAINT "oauth_authorization_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "mcp_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "mcp_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_audit_events" ADD CONSTRAINT "mcp_audit_events_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_audit_events" ADD CONSTRAINT "mcp_audit_events_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_audit_events" ADD CONSTRAINT "mcp_audit_events_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "mcp_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EN-006a (SDD-024 §2/§11): integridade que o Prisma não expressa.
-- Escopos: ao menos `read`, só valores conhecidos.
ALTER TABLE "mcp_grants" ADD CONSTRAINT mcp_grants_scopes_chk
  CHECK (array_length("scopes", 1) >= 1 AND "scopes" <@ ARRAY['read','write']::text[] AND 'read' = ANY("scopes"));

-- Rev. 2 §11.4: OAUTH exige cliente; PAT (backlog US-074b) não tem.
ALTER TABLE "mcp_grants" ADD CONSTRAINT mcp_grants_kind_client_chk
  CHECK (("kind" = 'OAUTH') = ("clientId" IS NOT NULL));

-- Revogada tem data e motivo; ativa não.
ALTER TABLE "mcp_grants" ADD CONSTRAINT mcp_grants_revoked_chk
  CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL AND "revokedReason" IS NOT NULL));

-- Contador de janela nunca negativo; no máximo um token por valor (já único).
ALTER TABLE "mcp_rate_buckets" ADD CONSTRAINT mcp_rate_buckets_count_chk CHECK ("count" >= 1);

-- Auditoria é append-only: nunca UPDATE; DELETE só pelo expurgo (retenção de 12 meses, SDD-024 §2), que liga
-- `app.mcp_purge` com SET LOCAL na própria transação e só alcança linhas com mais de 12 meses.
CREATE FUNCTION mcp_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('app.mcp_purge', true), '') = 'on'
     AND OLD."createdAt" < now() - interval '12 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'mcp_audit_events is append-only' USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER mcp_audit_no_update BEFORE UPDATE OR DELETE ON "mcp_audit_events"
  FOR EACH ROW EXECUTE FUNCTION mcp_audit_guard();
