-- SEC-011 (SDD-028 §4): consentimento amarrado ao navegador (nonce em cookie) e aviso de conexão nova.
-- browserNonceHash nulo = pedido anterior à migração (expira em 10 min; tratado como OTHER_BROWSER).
ALTER TABLE "oauth_authorization_requests" ADD COLUMN "browserNonceHash" TEXT;
ALTER TABLE "mcp_grants" ADD COLUMN "noticeDismissedAt" TIMESTAMPTZ(3);
-- conexões já existentes não geram cartão de "nova conexão"
UPDATE "mcp_grants" SET "noticeDismissedAt" = now();
