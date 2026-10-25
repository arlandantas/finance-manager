# SDD-024: Servidor MCP — base OAuth 2.1, escopo, contexto do membro, limite de taxa e auditoria (EN-006)

> Estado vigente consolidado em agents/estado/ia-assistente-mcp.md

- **História**: [EN-006](../../product-owner/backlog/stories/EN-006-servidor-mcp-base.md) · **Fluxo**: [FLUXO-016](../../product-owner/flows/FLUXO-016-privacidade-e-consentimento-ia.md) §3
- **Rastreabilidade**: NEED-025 (RN-025.1, 025.2, 025.5, 025.6, 025.7) · RF43 · D-PO-66 · D-GES-35 · **[ADR-030](../adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md)** (leitura obrigatória) · ADR-009, ADR-013, ADR-019, ADR-026
- **Depende de**: SDD-000 (erros, `withApi`, CSRF), SDD-003 (sessão Auth.js, `findActiveMembership`), SDD-012 (papéis, ex-membro)
- **Status**: **Aprovado para Desenvolvimento** (R4-D) — a tarefa 0 (*spike* do SDK, §10) vem antes de qualquer outra · **Autor**: Agente Tech Lead · **Executor**: Dev & QA (**Opus** para o AS e a revisão de segurança; Sonnet para o resto)
- **Estimativa**: **13** (PO: 8) = **EN-006a** AS OAuth 8 + **EN-006b** *endpoint* MCP, contexto, taxa e auditoria 5 — §10. **Revisão 2 (§11)**: POC só com Claude ⇒ EN-006a **7** (CIMD, sem DCR) + EN-006b **5** = **12**; DCR/ChatGPT na ampliação (+2); hospedagem Vercel (ADR-031); `write` = lançamento direto.

---

## 1. Gaps técnicos e decisões
| Gap | Resolução |
| :-- | :-- |
| "Credencial mostrada uma vez" (EN-006/US-074 do PO) | Substituída por **OAuth** (D-GES-35, ADR-030 §2): o membro cola só a **URL do servidor** no cliente; o cliente abre o consentimento no app. Nenhum segredo é exibido. Pedido ao PO (TL-39). |
| Versão do protocolo | Aceitar **2025-11-25** (`initialize`, modo *stateless*: sem `Mcp-Session-Id`) e **2026-07-28** (`server/discover`, `_meta` por requisição). `MCP-Protocol-Version` ausente ⇒ tratar como 2025-03-26 só para o `initialize` (compatibilidade do Claude). Versão desconhecida ⇒ `400 UnsupportedProtocolVersion`. |
| SDK | `@modelcontextprotocol/server` 2.x (v2 *stateless*) se o *spike* provar as duas eras; senão `@modelcontextprotocol/sdk` 1.32.x com `StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`. **Sem** `mcp-handler` (acopla a Redis/Vercel; não precisamos). A camada OAuth é **nossa** (não usar os *helpers* de AS do SDK). |
| Rotas `.well-known` | Route Handlers em `src/app/.well-known/...` (suportado pelo Next 16, `docs/01-app/02-guides/backend-for-frontend.md`). **O `proxy.ts` atual redireciona `/.well-known/*` para `/login`** (o *matcher* só exclui `api/` e caminhos com extensão) ⇒ acrescentar `\.well-known/` à exclusão. `/oauth/authorize` **continua** sob o *proxy* (sem cookie ⇒ `/login?callbackUrl=…`, que é o desejado). |
| `callbackUrl` longo | O `/oauth/authorize?...` pode passar de 1.500 caracteres. Antes de redirecionar ao login, a página grava o pedido validado em `oauth_authorization_requests` (TTL 10 min) e o `callbackUrl` vira `/oauth/authorize?request=<id>`. `redirect.ts` aceita esse caminho relativo. |
| Cookie no consentimento | Navegação de topo vinda de claude.ai/chatgpt.com: cookie de sessão `SameSite=Lax` é enviado em GET de topo — funciona. A decisão é `POST` same-origin (`withApi`, CSRF de origem). |
| Estado entre instâncias | Nenhum em memória (ADR-030 §1). Limites de taxa no Postgres. |
| Contexto do membro | `resolveMcpContext` (§5) monta o **mesmo** `RequestContext` do `withApi` e é a **única** porta de entrada das ferramentas. |
| Erros HTTP × MCP | Falha de autenticação/autorização de transporte ⇒ HTTP (`401`/`403`/`429`) com `WWW-Authenticate`. Falha de negócio de uma ferramenta ⇒ resultado com `isError: true` e `structuredContent.error = { code, message }` (o LLM lê). Escopo insuficiente em ferramenta ⇒ resultado de erro **e** `_meta["mcp/www_authenticate"]` (ChatGPT) **e** HTTP `403 insufficient_scope` quando a chamada é só dessa ferramenta. |

---

## 2. Dados (migração `en006_mcp_oauth`)
```prisma
enum McpClientKind { CIMD DCR }
enum McpGrantStatus { ACTIVE REVOKED EXPIRED }
enum McpRevokedReason { MEMBER FAMILY_BLOCKED MEMBER_REMOVED REFRESH_REUSE CODE_REUSE CLIENT }
enum McpAuditOutcome { OK DENIED_SCOPE INVALID RATE_LIMITED ERROR }
enum McpAuditKind { TOOL CONNECTED REVOKED BLOCKED }

model McpClient {                       // cliente OAuth (CIMD ou DCR); sem segredo: só públicos
  id                 String        @id @default(uuid()) @db.Uuid
  clientId           String        @unique            // URL do CIMD ou "dcr_<random>"
  kind               McpClientKind
  clientName         String                           // ≤ 80, saneado (NFKC, sem controle)
  redirectUris       String[]
  softwareId         String?
  metadataFetchedAt  DateTime?     @db.Timestamptz(3) // CIMD: cache 24 h
  registrationIpHash String?                          // DCR: sha256(IP + AUTH_SECRET)
  createdAt          DateTime      @default(now()) @db.Timestamptz(3)
  lastUsedAt         DateTime?     @db.Timestamptz(3)
  grants             McpGrant[]
  @@map("mcp_clients")
}

model McpAuthorizationRequest {         // pedido validado do /authorize (TTL 10 min, uso único)
  id                  String   @id @default(uuid()) @db.Uuid
  clientId            String   @db.Uuid
  redirectUri         String
  state               String?                        // ≤ 500, devolvido como veio
  codeChallenge       String                         // S256, 43..128
  scopesRequested     String[]                       // ⊆ {read, write, offline_access}
  resource            String
  userId              String?  @db.Uuid              // preenchido quando há sessão
  expiresAt           DateTime @db.Timestamptz(3)
  consumedAt          DateTime? @db.Timestamptz(3)
  createdAt           DateTime @default(now()) @db.Timestamptz(3)
  @@index([expiresAt])
  @@map("oauth_authorization_requests")
}

model McpGrant {                        // "conexão" do assistente = consentimento de UM membro a UM cliente
  id             String          @id @default(uuid()) @db.Uuid
  familyId       String          @db.Uuid
  memberId       String          @db.Uuid
  userId         String          @db.Uuid
  clientId       String          @db.Uuid
  label          String                               // "Meu Claude", 2..40
  scopes         String[]                             // ["read"] ou ["read","write"]
  resource       String                               // = canônico no momento do consentimento
  status         McpGrantStatus  @default(ACTIVE)
  expiresAt      DateTime        @db.Timestamptz(3)   // consentimento + 30 ou 90 dias (teto absoluto)
  revokedAt      DateTime?       @db.Timestamptz(3)
  revokedReason  McpRevokedReason?
  revokedByMemberId String?      @db.Uuid
  lastUsedAt     DateTime?       @db.Timestamptz(3)   // atualizado no máx. 1×/min
  createdAt      DateTime        @default(now()) @db.Timestamptz(3)
  member Member    @relation(fields: [familyId, memberId], references: [familyId, id])
  client McpClient @relation(fields: [clientId], references: [id])
  tokens McpToken[]
  @@unique([familyId, id])
  @@index([familyId, memberId, status])
  @@map("mcp_grants")
}

enum McpTokenKind { CODE ACCESS REFRESH }
model McpToken {
  id          String       @id @default(uuid()) @db.Uuid
  grantId     String       @db.Uuid
  kind        McpTokenKind
  tokenHash   String       @unique                    // sha256 hex do valor (o valor nunca é gravado)
  codeChallenge String?                               // só CODE
  redirectUri String?                                 // só CODE
  parentId    String?      @db.Uuid                   // REFRESH/ACCESS: o CODE ou REFRESH que o originou
  expiresAt   DateTime     @db.Timestamptz(3)
  usedAt      DateTime?    @db.Timestamptz(3)         // CODE e REFRESH: uso único
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)
  grant McpGrant @relation(fields: [grantId], references: [id], onDelete: Cascade)
  @@index([grantId, kind])
  @@index([expiresAt])
  @@map("mcp_tokens")
}

model McpRateBucket {                   // janela fixa
  key         String   // ex.: "grant:<id>:min", "grant:<id>:day", "propose:<grantId>:h", "token:<clientId>:min", "register:<ipHash>:h"
  windowStart DateTime @db.Timestamptz(3)
  count       Int
  @@id([key, windowStart])
  @@map("mcp_rate_buckets")
}

model McpAuditEvent {                   // append-only (gatilho como o de ai_consent_events)
  id          String          @id @default(uuid()) @db.Uuid
  familyId    String          @db.Uuid
  memberId    String          @db.Uuid
  grantId     String?         @db.Uuid
  clientName  String                                  // cópia (o rótulo do grant na hora)
  kind        McpAuditKind
  tool        String?                                 // nome da ferramenta (kind = TOOL)
  params      Json            @default("{}")          // SÓ chaves permitidas (§7)
  outcome     McpAuditOutcome
  errorCode   String?
  proposalId  String?         @db.Uuid
  transactionId String?       @db.Uuid
  durationMs  Int
  createdAt   DateTime        @default(now()) @db.Timestamptz(3)
  @@index([familyId, memberId, createdAt(sort: Desc)])
  @@index([grantId, createdAt(sort: Desc)])
  @@map("mcp_audit_events")
}
```
- `families.assistantAccessEnabled Boolean @default(true)` (ADR-030 §4).
- `CHECK (array_length(scopes,1) >= 1 AND scopes <@ ARRAY['read','write'] AND 'read' = ANY(scopes))` em `mcp_grants`.
- Gatilho *append-only* em `mcp_audit_events` (mesmo padrão do SDD-022 §5). Expurgo por *script* `pnpm mcp:purge` (auditoria > 12 meses; *tokens* expirados há > 7 dias; pedidos de autorização expirados; clientes DCR sem *grant* e sem uso há 30 dias; *buckets* > 2 dias).

## 3. Constantes e ambiente
```typescript
// src/modules/mcp/config.ts
export const MCP_RESOURCE_PATH = "/api/mcp";
export const ACCESS_TTL_S = 3600;            // 60 min
export const CODE_TTL_S = 60;
export const AUTH_REQUEST_TTL_S = 600;
export const GRANT_VALIDITY_DAYS = [30, 90] as const;
export const SCOPES = ["read", "write"] as const;
export type McpScope = (typeof SCOPES)[number];
export const RATE = { grantPerMin: 60, grantPerDay: 1000, proposePerHour: 20, tokenPerMin: 30, registerPerHour: 10, authorizePerMin: 20 } as const;
export function canonicalResource(env = getEnv()): string { return new URL(MCP_RESOURCE_PATH, env.APP_URL).toString().replace(/\/$/, ""); }
```
Novas variáveis (`src/lib/env.ts`): `MCP_ENABLED` (flag, padrão `false` em produção até a homologação; `false` ⇒ `/api/mcp`, `/.well-known/*` e `/oauth/*` respondem `404`), `MCP_CIMD_ALLOWED_HOSTS` (padrão `claude.ai,chatgpt.com`). `APP_URL` precisa ser **https** em produção (boot falha se `MCP_ENABLED` e `APP_URL` não for https — teste de matriz como no ADR-026 §5).

## 4. Contratos HTTP do AS (todas fora do `withApi`, salvo onde dito)
### 4.1 `GET /.well-known/oauth-protected-resource` e `GET /.well-known/oauth-protected-resource/api/mcp`
`200`, `Cache-Control: public, max-age=3600`, CORS `*`:
```json
{ "resource": "https://<host>/api/mcp", "authorization_servers": ["https://<host>"],
  "scopes_supported": ["read", "write", "offline_access"], "bearer_methods_supported": ["header"],
  "resource_name": "Gestão Financeira Familiar", "resource_documentation": "https://<host>/configuracoes/assistente" }
```
### 4.2 `GET /.well-known/oauth-authorization-server`
```json
{ "issuer": "https://<host>",
  "authorization_endpoint": "https://<host>/oauth/authorize",
  "token_endpoint": "https://<host>/api/oauth/token",
  "registration_endpoint": "https://<host>/api/oauth/register",
  "revocation_endpoint": "https://<host>/api/oauth/revoke",
  "response_types_supported": ["code"], "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"],
  "revocation_endpoint_auth_methods_supported": ["none"],
  "scopes_supported": ["read", "write", "offline_access"],
  "client_id_metadata_document_supported": true,
  "authorization_response_iss_parameter_supported": true }
```
(`openid-configuration` **não** é servido: não emitimos ID *token*.)

### 4.3 `GET /oauth/authorize` (página do app)
Parâmetros (Zod `AuthorizeQuerySchema`, `.strict()` só sobre os conhecidos; extras ignorados):
```typescript
export const AuthorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(500),
  redirect_uri: z.string().url().max(500),
  code_challenge: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  code_challenge_method: z.literal("S256"),
  resource: z.string().url(),
  scope: z.string().max(200).optional(),          // separado por espaço; desconhecidos ignorados
  state: z.string().max(500).optional(),
});
```
Ordem de validação (RFC 6749 §4.1.2.1): **cliente e `redirect_uri` primeiro** — se inválidos, a página mostra erro **sem redirecionar** ("Não foi possível conectar: o aplicativo que pediu acesso não é reconhecido"). Depois, erros redirecionam ao `redirect_uri` com `error`, `error_description`, `state` e `iss`: `unsupported_response_type`, `invalid_request` (PKCE ausente/`plain`), `invalid_target` (`resource` ≠ canônico), `access_denied` (recurso bloqueado na família ou usuário sem família ativa; também ao tocar "Cancelar").
- `client_id` URL ⇒ **CIMD**: `resolveCimdClient(url)` (§4.7); senão procura `mcp_clients.clientId` (DCR).
- Pedido válido ⇒ grava `oauth_authorization_requests` e redireciona para `/oauth/authorize?request=<id>` (URL curta; sem sessão, o *proxy* leva ao login com esse `callbackUrl`).
- Com sessão e membro ativo ⇒ renderiza a **tela de consentimento** (SDD-025 §4.1). Resposta com `Content-Security-Policy: frame-ancestors 'none'` e `X-Frame-Options: DENY`.

### 4.4 `POST /api/oauth/authorize/decision` (`withApi`, `auth: "family"`, `idempotent: false`)
```typescript
export const ConsentDecisionSchema = z.object({
  requestId: uuidSchema,
  decision: z.enum(["allow", "deny"]),
  label: z.string().trim().min(2).max(40).optional(),      // padrão: clientName truncado
  validityDays: z.union([z.literal(30), z.literal(90)]).default(30),
  allowWrite: z.boolean().default(false),
  privacyAcknowledged: z.literal(true).optional(),          // obrigatório quando decision = allow
}).strict().refine((v) => v.decision === "deny" || v.privacyAcknowledged === true, { message: "Confirme que entendeu o aviso" });
// 200 { redirectTo: string }  — o cliente faz window.location.assign(redirectTo)
```
Transação: `oauth_authorization_requests` `FOR UPDATE` (não consumido, não expirado, mesmo `userId` ou nulo ⇒ fixa) ⇒ `families` `FOR SHARE` com `assistantAccessEnabled = true` (senão `409 ASSISTANT_BLOCKED` "O Administrador bloqueou o acesso por assistente") ⇒ `allow`: cria `McpGrant` (`scopes = ["read"] ∪ (allowWrite && "write" ∈ pedido ? ["write"] : [])`; `allowWrite` sem `write` pedido ⇒ ignora), cria `CODE` (60 s, guarda `codeChallenge`, `redirectUri`), audita `CONNECTED`, marca o pedido consumido ⇒ `redirectTo = redirect_uri?code=…&state=…&iss=<issuer>`. `deny` ⇒ `redirect_uri?error=access_denied&state=…&iss=…`.
Um mesmo membro pode ter vários *grants* (ex.: Claude e ChatGPT); reconectar o mesmo cliente cria um *grant* novo e **revoga** o anterior ativo desse par (membro, cliente) com `revokedReason = CLIENT` (evita conexões fantasmas).

### 4.5 `POST /api/oauth/token` (`application/x-www-form-urlencoded`; JSON ⇒ `400 invalid_request`)
- `grant_type=authorization_code`: `code`, `redirect_uri`, `client_id`, `code_verifier` (43..128), `resource`. Checagens: *hash* do código existe, `kind = CODE`, não usado, não expirado; `client_id`, `redirect_uri` e `resource` iguais aos do pedido; `BASE64URL(SHA256(code_verifier)) === codeChallenge`; *grant* `ACTIVE`. **Reuso de código** ⇒ revoga o *grant* (`CODE_REUSE`) e `400 invalid_grant`.
- `grant_type=refresh_token`: `refresh_token`, `client_id`, `resource` opcional (se vier, = canônico). *Refresh* já usado ⇒ **revoga o *grant*** (`REFRESH_REUSE`), `400 invalid_grant`. Expirado/revogado ⇒ `400 invalid_grant`. Sucesso: marca o antigo `usedAt`, emite par novo.
- `scope` no *refresh* pode **reduzir**, nunca ampliar.
- Resposta `200`, `Cache-Control: no-store`:
```json
{ "access_token": "fma_…", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "fmr_…", "scope": "read write" }
```
`expires_in` = `min(3600, grant.expiresAt − agora)`; *refresh* expira junto com o *grant*. Erros no formato RFC 6749 §5.2 (`invalid_request`, `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_scope`). Limite `token:<clientId>:min` ⇒ `429` `{ "error": "slow_down" }`. Meta de latência: p95 < 300 ms (o Claude corta em 10 s).

### 4.6 `POST /api/oauth/register` (RFC 7591; `application/json`)
```typescript
export const DcrRequestSchema = z.object({
  redirect_uris: z.array(z.string().url().max(500)).min(1).max(5),
  client_name: z.string().max(200).optional(),
  token_endpoint_auth_method: z.string().optional(),   // qualquer valor ⇒ registramos "none"
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  application_type: z.enum(["web", "native"]).optional(),
  software_id: z.string().max(200).optional(),
  scope: z.string().max(200).optional(),
}).passthrough();
```
`redirect_uris`: cada uma `https:` ou *loopback* `http://localhost|127.0.0.1|[::1]` (senão `400 invalid_redirect_uri`). `201` com `client_id = "dcr_" + randomToken(16)`, `client_id_issued_at`, `redirect_uris`, `client_name` (saneado; vazio ⇒ "Assistente sem nome"), `token_endpoint_auth_method: "none"`, `grant_types: ["authorization_code","refresh_token"]`, `response_types: ["code"]`. Limite por IP ⇒ `429`.

### 4.7 CIMD: `resolveCimdClient(clientIdUrl)`
`https:` obrigatório, *host* ∈ `MCP_CIMD_ALLOWED_HOSTS` (senão erro de cliente desconhecido), caminho não vazio; cache em `mcp_clients` por 24 h; `fetch` com `redirect: "manual"` (3xx ⇒ falha), `AbortSignal.timeout(5000)`, corpo ≤ 5.120 bytes, `Content-Type` JSON; valida `client_id === url`, `client_name`, `redirect_uris` (não vazio); `token_endpoint_auth_method` ∈ {`none`, ausente} (o `private_key_jwt` do ChatGPT **não** é suportado nesta versão — o ChatGPT usa `none` com PKCE). Função injetável (`fetchImpl`) para testes.

### 4.8 `POST /api/oauth/revoke` (RFC 7009)
`token`, `token_type_hint?`, `client_id`. Sempre `200` (mesmo *token* desconhecido). *Refresh* ou acesso de um *grant* ⇒ revoga o **grant** inteiro (`CLIENT`).

### 4.9 Regra de *redirect* `redirectUriMatches(registered, presented)`
Igualdade exata da *string*; exceção: ambos *loopback* (`localhost`, `127.0.0.1`, `[::1]`), mesmo esquema `http`, mesmo *host*, mesmo caminho, porta ignorada. Vetores: R1 `https://claude.ai/api/mcp/auth_callback` = idem ✔; R2 com barra final ✘; R3 `http://localhost/callback` × `http://localhost:3118/callback` ✔; R4 `http://127.0.0.1/callback` × `http://localhost:3118/callback` ✘ (*host* diferente); R5 `https://chatgpt.com/connector/oauth/abc` × `…/abd` ✘; R6 `http://evil.com/callback` registrado ⇒ recusado já no DCR.

## 5. Transporte MCP e contexto do membro
### 5.1 `src/app/api/mcp/route.ts`
```typescript
export const runtime = "nodejs";
export const maxDuration = 60;           // ignorado no Railway; na Vercel limita a função
export async function POST(req: Request): Promise<Response>;   // handleMcp(req)
export async function GET(): Promise<Response>;    // 405
export async function DELETE(): Promise<Response>; // 405
```
`handleMcp`: (1) `MCP_ENABLED` senão `404`; (2) `Origin` presente e ∉ {`APP_URL`} ⇒ `403`; (3) `Authorization: Bearer` ausente ⇒ `401` + `WWW-Authenticate: Bearer resource_metadata="<APP_URL>/.well-known/oauth-protected-resource/api/mcp", scope="read write"`; (4) `resolveMcpContext` (§5.2) — falha ⇒ `401` + `WWW-Authenticate: Bearer error="invalid_token", error_description="…", resource_metadata="…"`; (5) limite `grant:min`/`grant:day` ⇒ `429` + `Retry-After`; (6) entrega ao servidor MCP do SDK (instância criada **por requisição**, com as ferramentas filtradas pelo escopo? **Não**: `tools/list` devolve todas as ferramentas que o *grant* pode chamar — `read` ⇒ só leitura; `read write` ⇒ todas. Cenário US-075 "Não há ferramenta de escrita neste escopo").
Corpo > 64 KB ⇒ `413`. Lote JSON-RPC (*array*) ⇒ `400` (não suportado na 2025-11-25+).

### 5.2 `resolveMcpContext`
```typescript
// src/modules/mcp/context.ts
export type McpContext = RequestContext & { grantId: string; scopes: McpScope[]; clientName: string; grantLabel: string };
export type McpAuthError = { code: "invalid_token"; description: "missing" | "unknown" | "expired" | "revoked" | "audience" | "membership" | "blocked" };
export async function resolveMcpContext(db: PrismaClient, bearer: string, clock: Clock): Promise<McpContext | McpAuthError>;
```
Uma consulta: `mcp_tokens` (por `tokenHash = sha256(bearer)`, `kind = ACCESS`) ⨝ `mcp_grants` ⨝ `mcp_clients` ⨝ `families`. Regras em ordem: *token* existe (`unknown`); `expiresAt > agora` (`expired`); `grant.status = ACTIVE` e `grant.expiresAt > agora` (`revoked`/`expired`; expirado vira `EXPIRED` preguiçosamente); `grant.resource = canonicalResource()` (`audience`); `families.assistantAccessEnabled` (`blocked`); `findActiveMembership(grant.userId)` devolve `id = grant.memberId` e `familyId = grant.familyId` (`membership`). Monta `RequestContext` (`userId`, `email`, `name`, `memberId`, `familyId`, `role`, `clock`, `requestId`) **idêntico** ao do `withApi`. `lastUsedAt` do *grant* e do cliente atualizados no máximo 1×/min (`UPDATE … WHERE lastUsedAt < now() - interval '1 minute'`).
Mensagem ao cliente: só `error_description` genérica ("credencial expirada" para `expired`; "não autorizado" para o resto) — não revela qual barreira falhou além de expirado (BDD EN-006).

### 5.3 Execução de ferramenta `runTool`
```typescript
// src/modules/mcp/run-tool.ts
export type ToolDef<I, O> = {
  name: string; title: string; description: string; scope: McpScope;
  input: z.ZodType<I>; output: z.ZodType<O>;              // output validado ANTES de devolver (allowlist)
  annotations: { readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: false };
  auditParams: (input: I) => Record<string, string | number | boolean | string[]>;   // §7
  handler: (args: { ctx: McpContext; input: I; tx: Tx }) => Promise<O>;
  rateKey?: (ctx: McpContext) => { key: string; limit: number; windowS: number };      // ex.: propor 20/h
};
```
Fluxo: escopo (`DENIED_SCOPE` ⇒ erro "sem permissão de lançamento" para `write`) ⇒ `input.safeParse` (`INVALID` ⇒ erro com a 1ª mensagem Zod) ⇒ limite próprio ⇒ `db.$transaction` (`ReadCommitted`, 10 s; leitura com `SET TRANSACTION READ ONLY` para ferramentas `read`) ⇒ `output.parse` ⇒ resposta `{ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out }` ⇒ auditoria (fora da transação da ferramenta; falha de auditoria **não** devolve dado: é gravada antes de responder; se o `INSERT` falhar ⇒ erro `INTERNAL` e nada é devolvido). `ApiError` do domínio vira `isError: true` com `{ code, message }` do próprio erro (mensagens já são neutras, SDD-000).
`outputSchema` publicado no `tools/list` = JSON Schema do Zod (`z.toJSONSchema`).

## 6. Limite de taxa
```typescript
// src/modules/mcp/rate-limit.ts — janela fixa no Postgres, atômica
export async function hit(db: PrismaClient | Tx, key: string, limit: number, windowS: number, now: Date): Promise<{ ok: true } | { ok: false; retryAfterS: number }>;
// INSERT INTO mcp_rate_buckets(key, "windowStart", count) VALUES ($1, $2, 1)
// ON CONFLICT (key, "windowStart") DO UPDATE SET count = mcp_rate_buckets.count + 1 RETURNING count
```

## 7. Auditoria
`auditParams` por ferramenta só pode devolver chaves de uma *allowlist* global: `period`, `from`, `to`, `accountIds`, `cardIds`, `categoryIds`, `type`, `page` (número da página derivado, nunca o cursor), `limit`, `cardId`, `proposalId`. **Proibidos**: `q`, `description`, valores, qualquer texto livre. Teste de propriedade: para cada ferramenta e entradas geradas, `Object.keys(params) ⊆ allowlist` e nenhum valor de *string* contém a descrição/`q` de entrada.
API de consulta pelo membro: SDD-027 §5.

## 8. Testes obrigatórios (EN-006)
**Cliente MCP de teste** (`tests/support/mcp-client.ts`): (a) `oauthDance({ scopes, validityDays, member })` executa **o fluxo inteiro em processo** — chama os Route Handlers com `Request` reais: PRM ⇒ AS metadata ⇒ DCR **ou** CIMD (com `fetchImpl` falso servindo um documento de `https://claude.ai/test-client.json`) ⇒ `/oauth/authorize` (com cookie de sessão do membro de teste, ADR-008) ⇒ `decision` ⇒ `/token` com PKCE ⇒ devolve `{ accessToken, refreshToken }`; (b) `mcp.call(method, params, { era: "2025-11-25" | "2026-07-28" })` monta JSON-RPC com os cabeçalhos certos (`MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) e chama `POST /api/mcp`; (c) também roda contra uma URL real (`MCP_TEST_URL`) para o *smoke*. Nenhum LLM é envolvido: o "assistente" é o próprio teste.
| Cenário BDD / risco | Testes |
| :-- | :-- |
| Chamada sem credencial | **I**: `POST /api/mcp` sem `Authorization` ⇒ `401`, `WWW-Authenticate` com `resource_metadata` e `scope="read write"`, corpo sem dados. |
| Credencial vê só o que o membro vê / outra família | **I**: duas famílias com contas, cartões, categorias e lançamentos de nomes iguais; *token* de Lucas (Silva) em **todas** as ferramentas de leitura ⇒ nenhum id/nome da Souza (varredura de *strings* do resultado contra os ids da Souza). *Token* da Souza passado a uma ferramenta com `accountId` da Silva ⇒ `NOT_FOUND`, nunca dado. |
| Leitura não escreve | **I**: *grant* `read` chama `propor_lancamento` ⇒ `isError`, código `INSUFFICIENT_SCOPE`, mensagem "sem permissão de lançamento", `_meta["mcp/www_authenticate"]` presente; `assistant_proposals` vazio; `tools/list` sem ferramentas `write`. |
| Revogada para na hora | **I**: revogar no app ⇒ chamada seguinte ⇒ `401`; *refresh* ⇒ `invalid_grant`. |
| Expirada | **I** (relógio injetado): acesso vencido ⇒ `401` com "credencial expirada"; *grant* vencido (31 dias) ⇒ `401` e *refresh* `invalid_grant`. |
| Auditada sem conteúdo | **I**: após `consultar_saldos`, 1 evento `TOOL/OK` com membro, ferramenta, data; `JSON.stringify(evento)` não contém nenhum `balanceInCents`, nome de conta nem descrição. **P** (propriedade) §7. |
| Limite de taxa | **I**: 61ª chamada no mesmo minuto ⇒ `429` + `Retry-After`; minuto seguinte (relógio) ⇒ `200`. 10 chamadas concorrentes no limite ⇒ exatamente `limit` aceitas. |
| PKCE | **I**: verificador errado ⇒ `invalid_grant`; `code_challenge_method=plain` ⇒ redireciona `invalid_request`; sem `code_challenge` ⇒ idem. |
| Replay de código | **I**: trocar o mesmo código 2× ⇒ 2ª `invalid_grant` **e** o *grant* fica `REVOKED/CODE_REUSE` (o acesso emitido na 1ª deixa de valer). Código após 61 s ⇒ `invalid_grant`. |
| Replay de *refresh* | **I**: *refresh* R1 ⇒ (A2, R2); reapresentar R1 ⇒ `invalid_grant` e A2/R2 inválidos. Duas trocas concorrentes de R1 ⇒ uma vence, a outra revoga (aceito: segurança > conveniência). |
| Audiência | **I**: `resource` diferente no `/authorize` ⇒ `invalid_target`; *grant* forjado no banco com `resource` antigo ⇒ `401`. |
| *Redirect* | **U**: vetores R1..R6 (§4.9). **I**: `redirect_uri` não registrado ⇒ página de erro **sem** redirecionar. |
| CIMD/SSRF | **U** com `fetchImpl` falso: *host* fora da lista ⇒ recusa sem `fetch`; 3xx ⇒ recusa; corpo 6 KB ⇒ recusa; `client_id` divergente ⇒ recusa; *timeout* ⇒ recusa. |
| DCR | **I**: registro válido ⇒ `201` com `none`; `redirect_uris` `http://evil.com` ⇒ `400 invalid_redirect_uri`; 11º registro na hora pelo mesmo IP ⇒ `429`. Cliente DCR sem consentimento não acessa nada. |
| `iss` | **I**: toda resposta do `/authorize` (sucesso e erro com redirecionamento) contém `iss=<issuer>`. |
| Bloqueio e remoção | **I**: ADMIN desliga ⇒ *grants* `REVOKED/FAMILY_BLOCKED`, chamada ⇒ `401`; novo `/authorize` ⇒ `access_denied`. Remover Lucas (US-035) ⇒ *grants* revogados na mesma transação; *grant* forjado de ex-membro ⇒ `401` (`membership`). Lucas sai e entra em outra família ⇒ *grant* antigo ⇒ `401`. |
| Duas eras do protocolo | **I**: `initialize` + `tools/list` + `tools/call` em 2025-11-25 sem `Mcp-Session-Id` na resposta; `server/discover` + `tools/call` em 2026-07-28; versão `1999-01-01` ⇒ `400 UnsupportedProtocolVersion`; `GET /api/mcp` ⇒ `405`; `Origin: https://evil.com` ⇒ `403`. |
| *Logs* | **U**: *logger* com `Authorization`, `access_token`, `refresh_token`, `code`, `code_verifier` ⇒ todos `[REDACTED]`. |
| *Proxy* | **U**: *matcher* não intercepta `/.well-known/oauth-protected-resource/api/mcp` nem `/api/oauth/token`; intercepta `/oauth/authorize`. |
| Flag | **I**: `MCP_ENABLED=false` ⇒ `404` nas três famílias de rota. **U**: produção com `MCP_ENABLED` e `APP_URL` http ⇒ boot falha. |
| Tela de consentimento | **E** (Playwright): fluxo com o cliente de teste servindo o *redirect* em `http://127.0.0.1:<porta>/callback`; sem sessão ⇒ login de teste ⇒ volta ao consentimento; "Entendi" obrigatório; "Cancelar" ⇒ `error=access_denied`. |

## 9. Checklist de segurança antes de ligar em produção (DoD da EN-006)
1. `/security-review` sobre o *diff* do AS e do `/api/mcp`; achados altos/médios corrigidos.
2. Conformidade: MCP Inspector contra a URL de produção (OAuth + `tools/list`), sem avisos de autenticação.
3. *Smoke* `pnpm mcp:smoke <url>` (cliente de teste §8c): `401` com `resource_metadata`; metadados válidos; `GET /api/mcp` `405`.
4. Homologação manual com **Claude (web)** e **ChatGPT (modo desenvolvedor)** reais — roteiro em SDD-025 §6.
5. `MCP_ENABLED=true` só depois disso.

## 10. Estimativa, ordem e *commits*
**13** = EN-006a **8** (migração 1; metadados + DCR + CIMD 2; `/authorize` + pedido + consentimento + decisão 2; `/token` + *refresh* rotativo + revogação 2; testes de segurança 1) + EN-006b **5** (transporte nas duas eras + `resolveMcpContext` 2; `runTool` + taxa 1; auditoria + expurgo 1; cliente de teste + *smoke* 1).
**Tarefa 0 (*spike*, 0,5 dia, dentro dos 13)**: provar com o SDK escolhido um servidor *stateless* que responda `initialize` (2025-11-25) e `server/discover` (2026-07-28) num Route Handler do Next 16, e conectar o **Claude Code** a ele por túnel. Resultado registrado na TASK; se nenhuma versão do SDK servir as duas eras, implementar o *framing* JSON-RPC à mão (≈ +1 pt) — o resto do SDD não muda.
*Commits*: (1) migração + modelos; (2) metadados + DCR + CIMD; (3) `/authorize` + decisão + página; (4) `/token` + revogação; (5) `/api/mcp` + contexto + taxa; (6) auditoria + expurgo; (7) cliente de teste + *smoke*.

---

## 11. Revisão 2 (2026-10-24, D-GES-36 + refinamentos do Gestor) — prevalece sobre §1–§10 onde houver conflito
### 11.1 Hospedagem (ADR-031)
- Rotas `/api/mcp`, `/api/oauth/*`, `/.well-known/*`: `runtime = "nodejs"`, **`maxDuration = 30`** (substitui o `60` do §5.1). Nenhum estado em memória (já era regra).
- Banco pelo *pool* do ADR-031 §3 (`max` 3, `attachDatabasePool`). Todas as transações do MCP usam só `pg_advisory_xact_lock`/`FOR UPDATE` (compatível com o *pooler* em modo transação). Proibido `SET` de sessão (o `SET TRANSACTION READ ONLY` do §5.3 é de transação: permitido).
- Expurgo `mcp:purge` (§2) passa a ser também uma tarefa da rota **`GET /api/cron/purge`** (ADR-031 §8); o *script* continua para uso manual.
- `APP_URL` canônico = `https://verbus-finance.vercel.app` (ou o domínio definitivo, TL-45). `Origin` e `resource` aceitam **só** `APP_URL`; URLs de *deploy* `*.vercel.app` com *hash* não.
- *Previews*: `MCP_ENABLED` nunca é definido em *Preview*; com `VERCEL_ENV = preview` o MCP responde `404` mesmo que a variável exista (teste de matriz).
- **Não** ligar *Attack Challenge Mode*/*bot protection* da Vercel nessas rotas (chamadas servidor-a-servidor de `160.79.104.0/21` — Claude).

### 11.2 POC com um cliente (Claude) — o que entra e o que fica para a ampliação
| Item | POC (Claude web/Desktop/mobile + Claude Code) | Ampliação |
| :-- | :-- | :-- |
| Registro de cliente | **Só CIMD**, `MCP_CIMD_ALLOWED_HOSTS=claude.ai` (o Claude escolhe CIMD porque anunciamos `client_id_metadata_document_supported` + `none`). Claude Code usa o CIMD próprio (`https://claude.ai/oauth/claude-code-client-metadata`) com *loopback* | **DCR** (§4.6) para Gemini CLI/Antigravity/Cursor/Le Chat; `chatgpt.com` na *allowlist* do CIMD |
| Metadados | `registration_endpoint` **ausente** no §4.2 enquanto não houver DCR | Volta com o DCR |
| Protocolo | Era **2025-11-25** obrigatória (é a que o Claude documenta); 2026-07-28 só se o SDK escolhido no *spike* já servir sem custo | 2026-07-28 completa |
| Escopos | `read`, `write`, `offline_access` (o Claude pede `offline_access` se anunciado) | — |
| Instruções na tela | Só a aba **Claude** | Abas ChatGPT, outros |
| Homologação | Roteiro SDD-025 §6 itens 1–2 | Itens 3–4 |
Estimativa revista: **EN-006a (POC) = 7** (sem DCR: −1) · **EN-006b = 5** · DCR + ChatGPT na ampliação = **2** (DCR 1 + homologação ChatGPT 1).

### 11.3 Escopo `write` = lançamento direto
`write` passa a permitir **gravar** despesa (SDD-027 rev. 2), não só propor. Mudanças: (a) consentimento com opt-in reforçado (SDD-025 §8); (b) o `401` continua sugerindo `scope="read write"`, mas o AS só concede `write` se o membro marcar; (c) `McpAuditKind` ganha **`LIMITS_CHANGED`**; `McpAuditOutcome` ganha **`LIMIT_EXCEEDED`**; `RATE.proposePerHour` sai (os limites de lançamento são do membro, SDD-027 §R2.3).

### 11.4 Token de acesso pessoal (PAT) — **backlog, fora do POC** (US-074b, 3 pts; ADR-030 §2-R2)
Desenho para não fechar portas agora: `enum McpGrantKind { OAUTH PAT }` em `mcp_grants` (`kind @default(OAUTH)`, `clientId` passa a ser opcional com `CHECK ((kind = 'OAUTH') = (clientId IS NOT NULL))`); o PAT é um `McpToken` `kind = ACCESS` com `expiresAt = grant.expiresAt` (30/90 dias), prefixo `fmp_`, só *hash*. `resolveMcpContext` não muda (o `JOIN` com `mcp_clients` vira `LEFT JOIN`). **Na migração do POC já criar a coluna `kind` e o `clientId` opcional** (custo zero agora, evita migração depois).
