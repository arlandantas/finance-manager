# SDD-003: Autenticação, Família e Convite (US-001, US-002, US-003)

- **Histórias**: [US-001](../../product-owner/backlog/stories/US-001-login-com-google.md) · [US-002](../../product-owner/backlog/stories/US-002-criar-familia.md) · [US-003](../../product-owner/backlog/stories/US-003-convidar-membro.md)
- **Fluxo**: [FLUXO-002](../../product-owner/flows/FLUXO-002-onboarding-e-convite.md)
- **Rastreabilidade**: NEED-012 · NEED-001 · RN-012.1..3 · ADR-002, ADR-008 (login de teste), ADR-009, ADR-012 (convites), ADR-013 · D-GES-07, D-GES-11 · EXT-01, EXT-02
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-006](SDD-006-esqueleto-e-ambiente.md) (EN-001) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap | Resolução |
| :-- | :-- |
| Google exige credenciais externas | Provedor de teste via rota própria `POST /api/dev/login`, sessão em banco idêntica à do Google (ADR-008). Google só é registrado se `AUTH_GOOGLE_ID/SECRET` existirem (EXT-01). |
| `Credentials` do Auth.js não aceita sessão em banco | Não usar Credentials; criar `Session` direto (ADR-008). |
| E-mail com caixas diferentes (`Lucas@Exemplo.com`) | **Normalização `trim().toLowerCase()`** em `User.email`, `Invitation.email` e em toda comparação; envolver o adaptador Prisma do Auth.js (`createUser`, `updateUser`, `getUserByEmail`). |
| `email_verified` do Google | Callback `signIn` recusa quando `profile.email_verified !== true` **antes** de qualquer criação (ordem do Auth.js: `signIn` precede `createUser`). |
| Vincular convite: no clique ou no login? | **No login/gate** por e-mail verificado (ADR-012). O link só contextualiza. |
| Conta criada por dev-login e depois login Google real, mesmo e-mail | `allowDangerousEmailAccountLinking: true` no provider Google (seguro porque exigimos `email_verified`). |
| Duplo clique em "Criar família" / duas abas | `Idempotency-Key` + `UNIQUE(Member.userId)`; segunda tentativa com chave diferente → `409 ALREADY_IN_FAMILY`. |
| Convite duplicado/expirado | Índice único parcial + expiração oportunista na criação (§5.3). |
| Falha ao enviar e-mail | Convite permanece; resposta `emailStatus: "FAILED"`; UI oferece copiar link (ADR-012). |
| Open redirect via `callbackUrl` | Aceitar somente caminhos relativos iniciados por `/` e sem `//`, `\` ou esquema; senão `/`. |
| Middleware (Edge) não consulta banco | Middleware faz só **checagem otimista do cookie**; a autoridade é `requireSession()` no servidor (layout e `withApi`). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/familia/schemas.ts
export const emailSchema = z.string().trim().toLowerCase()
  .pipe(z.email("Informe um e-mail válido")).max(254, "Informe um e-mail válido");

export const RoleSchema = z.enum(["ADMIN", "MEMBER"]);
export type Role = z.infer<typeof RoleSchema>;

export const CreateFamilySchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres").max(60, "O nome deve ter no máximo 60 caracteres"),
}).strict();
export type CreateFamilyInput = z.infer<typeof CreateFamilySchema>;

export const CreateInvitationSchema = z.object({
  email: emailSchema,
  role: RoleSchema.default("MEMBER"),
}).strict();
export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

export const DevLoginSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(80).optional(),
}).strict();

// ── DTOs ──
export type MeDTO = {
  user: { id: string; name: string | null; email: string; image: string | null };
  membership: null | { memberId: string; familyId: string; familyName: string; role: Role };
};
export type MemberDTO = { memberId: string; name: string; email: string; image: string | null; role: Role; joinedAt: string };
export type InvitationDTO = {
  id: string; email: string; role: Role; status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED";
  expiresAt: string; isExpired: boolean; createdAt: string; invitedBy: { memberId: string; name: string };
};
export type FamilyDTO = {
  family: { id: string; name: string };
  currentMemberId: string; currentRole: Role;
  members: MemberDTO[];
  pendingInvitations: InvitationDTO[];          // [] para quem não é ADMIN
};
export type CreateFamilyResponse = { family: { id: string; name: string }; member: { id: string; role: "ADMIN" } };
export type CreateInvitationResponse = { invitation: InvitationDTO; inviteUrl: string; emailStatus: "SENT" | "FAILED" };
```

`name` de membro = `User.name ?? parteLocal(email)`.

---

## 3. Autenticação (US-001)

### 3.1 Configuração Auth.js (`src/auth.ts`)
```typescript
export const authConfig = {
  adapter: lowercaseEmailAdapter(PrismaAdapter(getDb())),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },  // RN-012.3: 90 dias deslizantes
  providers: googleConfigured ? [Google({
    authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
    allowDangerousEmailAccountLinking: true,
  })] : [],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn: ({ account, profile }) => authorizeSignIn({ provider: account?.provider, profile }),
    session: ({ session, user }) => ({ ...session, user: { ...session.user, id: user.id } }),
  },
  trustHost: process.env.AUTH_TRUST_HOST === "true",
};

// pura, testável sem rede
export function authorizeSignIn(a: { provider?: string; profile?: { email?: string; email_verified?: boolean } }): true | string {
  if (a.provider === "google" && a.profile?.email_verified !== true) return "/login?error=EmailNotVerified";
  return true;
}
```
- Cookie padrão do Auth.js (`httpOnly`, `SameSite=Lax`, `Secure` quando `AUTH_URL` é https).
- Nome/foto do Google importados pelo adaptador (`User.name`, `User.image`) e **atualizados a cada login** (`events.signIn` → `updateUser` se mudaram).

### 3.2 Mensagens de erro do login (`/login?error=<código>`)
| Código (query) | Mensagem exibida |
| :-- | :-- |
| `EmailNotVerified` | "Seu e-mail do Google não está verificado. Verifique-o no Google e tente novamente." |
| `AccessDenied`, `OAuthCallbackError`, `Callback`, `Configuration`, qualquer outro | **"Não foi possível entrar. Tente novamente."** |
Nenhum desses caminhos cria `User`/`Session`.

### 3.3 Provedor de teste (ADR-008, D-GES-11)

`POST /api/dev/login` (fora de `/api/v1`: sem `Idempotency-Key`, sem `withApi`):

| Item | Contrato |
| :-- | :-- |
| Habilitação | `process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production"`; senão **404** corpo vazio |
| Host | `Host` ∈ {`localhost`, `127.0.0.1`, `[::1]`, `*.localhost`} (porta livre); senão `403` |
| Corpo | `DevLoginSchema` (`email` obrigatório; `name` opcional) → `400 VALIDATION_ERROR` |
| Efeito | `upsert User` por e-mail (minúsculo, `emailVerified = now()`, `name` informado ou existente ou parte local do e-mail); cria `Session` (`sessionToken = randomBytes(32).toString("base64url")`, `expires = now + 90d`); `Set-Cookie` com nome/atributos do Auth.js |
| Resposta | `200 { user: { id, email, name } }` |

**Proteção na subida:** `src/instrumentation.ts` → `register()` lança `Error("AUTH_DEV_LOGIN não pode estar ativo em produção")` se `NODE_ENV === "production" && AUTH_DEV_LOGIN === "true"`. `getEnv()` (EN-001) ganha essas variáveis e a mesma validação (`superRefine`).

**UI (`/login`):** server component lê `isDevLoginEnabled()`; se ativo, renderiza `<DevLoginForm>` ("Entrar como (teste)": e-mail, nome, botão *Entrar (teste)*, atalhos *Mariana* e *Lucas*) que chama o endpoint e faz `location.assign(safeCallbackUrl)`. O módulo `dev-login` só é importado por `import()` condicional.

**Helper E2E:** `tests/support/login.ts` → `loginAs(page, { email, name })` (`page.request.post("/api/dev/login")`; o cookie fica no contexto).

### 3.4 Sessão, rotas protegidas e logout
- `requireSession()` (servidor): `auth()` → `{ user }` ou `redirect("/login?callbackUrl=…")` (páginas) / `401` (API).
- `middleware.ts` (matcher: tudo exceto `/login`, `/convite`, `/api/auth`, `/api/dev`, `/api/health`, assets): se **não há cookie de sessão** (`authjs.session-token` ou `__Secure-authjs.session-token`) → `redirect("/login?callbackUrl=" + encodeURIComponent(path + search))`. 
- `safeCallbackUrl(raw)`: retorna `raw` só se `/^\/(?!\/)[^\\]*$/`; senão `"/"`.
- `/login` com sessão válida redireciona para `/` (que decide Home/onboarding).
- **Sair:** botão "Sair" (menu do usuário) chama `signOut({ redirectTo: "/login" })`: remove a `Session` no banco e o cookie.
- Enquanto a sessão resolve, o shell renderiza **skeleton** (sem *flash* da tela de login): o layout `(app)` é server component e já recebe a sessão resolvida.

### 3.5 `GET /api/v1/me` (`auth: "user"`)
`200 MeDTO`. `401 UNAUTHENTICATED` sem sessão.

---

## 4. Família (US-002)

### 4.1 Contrato
`POST /api/v1/families` — `auth: "user"`, `body: CreateFamilySchema`, idempotente.
- `201 CreateFamilyResponse`.
- `400 VALIDATION_ERROR` ("Informe um nome com pelo menos 2 caracteres").
- `401`; `409 ALREADY_IN_FAMILY` ("Você já faz parte de uma família.").

### 4.2 Transação (tudo ou nada)
1. Garantir `Member` inexistente para `userId` (senão `ALREADY_IN_FAMILY`); tratar violação de `UNIQUE(userId)` (`P2002`) como `ALREADY_IN_FAMILY`.
2. Criar `Family { name, timezone: "America/Sao_Paulo", currency: "BRL", cutDay: 1 }`.
3. Criar `Member { role: ADMIN, joinedAt: clock.now() }`.
4. Criar as **11 categorias padrão** (§4.3).
5. Criar `SplitRuleVersion { kind: EQUAL, effectiveFrom: "1970-01-01", createdByMemberId }` (ADR-011).

### 4.3 Categorias padrão (`default-categories.ts`, ordem = `sortOrder`)
| kind | Nome | `icon` |
| :-- | :-- | :-- |
| EXPENSE | Supermercado | `shopping-cart` |
| EXPENSE | Moradia | `home` |
| EXPENSE | Contas e serviços | `receipt` |
| EXPENSE | Transporte | `car` |
| EXPENSE | Saúde | `pill` |
| EXPENSE | Educação | `graduation-cap` |
| EXPENSE | Lazer e restaurantes | `utensils` |
| EXPENSE | Outros | `package` |
| INCOME | Salário | `wallet` |
| INCOME | Rendimentos | `trending-up` |
| INCOME | Outras receitas | `plus-circle` |

Os nomes são **exatos** (os cenários BDD os citam). A grade de despesa do lançamento exibe nesta ordem.

### 4.4 Nome sugerido
`suggestFamilyName(userName: string | null): string` (pura): último token do nome com ≥ 2 letras → `"Família " + token`; nome com 1 token ou vazio → `""` (campo vazio). `"Mariana Silva" → "Família Silva"`; `"Mariana" → ""`; `"  Ana  Maria de Souza " → "Família Souza"`.

### 4.5 `GET /api/v1/family` (`auth: "family"`)
`200 FamilyDTO`. `pendingInvitations` só para ADMIN (itens `status = PENDING`, inclusive vencidos com `isExpired = true`, mais recentes primeiro). Chave de cache `["family"]`.

### 4.6 Onboarding (UI)
Rota `/onboarding` (server): sem sessão → login; com `Member` → `redirect("/")`; senão renderiza saudação (nome+foto), campo "Nome da família" (pré-preenchido, foco automático), botão fixo no rodapé no mobile "Criar família". Aviso opcional por `?notice=invite_expired` ("Convite expirado. Peça um novo convite."). Sucesso → passo "Convidar membro" (pulável: "Fazer depois"). Estados: enviando ("Criando…" desabilitado), erro de campo (mensagem do Zod), erro de rede (padrão SDD-000 §7).

---

## 5. Convites (US-003)

### 5.1 Contratos
| Rota | Papel | Corpo/params | Resposta |
| :-- | :-- | :-- | :-- |
| `POST /api/v1/invitations` | **ADMIN** | `CreateInvitationSchema` | `201 CreateInvitationResponse`; `409 DUPLICATE_MEMBER` "Esta pessoa já faz parte da família"; `409 DUPLICATE_INVITATION` "Já existe um convite pendente para este e-mail"; `400` "Informe um e-mail válido"; `403 FORBIDDEN` |
| `GET /api/v1/invitations` | **ADMIN** | — | `200 { items: InvitationDTO[] }` (PENDING) |
| `POST /api/v1/invitations/:id/cancel` | **ADMIN** | `{}` | `200 { invitation }`; `404`; `409 INVITATION_NOT_PENDING` |

### 5.2 Regras de `createInvitation` (transação)
1. `UPDATE invitations SET status='EXPIRED' WHERE familyId=? AND email=? AND status='PENDING' AND expiresAt < now()` (libera reconvite).
2. Se existe `Member` da família cujo `User.email == email` → `DUPLICATE_MEMBER`.
3. Gerar `token = randomBytes(32).toString("base64url")`; `tokenHash = sha256hex(token)`; `expiresAt = now + INVITATION_TTL_DAYS (7) dias` (constante exportada; D-GES-07).
4. `INSERT`; violação do índice parcial → `DUPLICATE_INVITATION`.
5. **Após o commit:** `mail.send(invitationEmail(...))` com timeout de 5 s. `emailStatus` persistido (`SENT|FAILED`, `UPDATE` best effort) e devolvido.
6. `inviteUrl = ${APP_URL}/convite/${token}` (retornada **apenas** nesta resposta).

### 5.3 E-mail (`MailPort`, ADR-012)
```typescript
export interface MailPort { send(m: { to: string; subject: string; text: string; html: string }): Promise<void> }
// adapters: SmtpMailer (nodemailer, SMTP_HOST/SMTP_PORT, from=MAIL_FROM) · InMemoryMailer (testes)
```
- Assunto: `"{Convidante} convidou você para a {Família} no Finance Manager"`.
- Corpo (texto): saudação, "{Convidante} convidou você para a família {Família}", link, "O convite vale por 7 dias e só funciona com a conta Google deste e-mail ({email})." Versão HTML equivalente simples (sem imagens externas).
- A função `invitationEmail()` é pura e testada por *snapshot*.

### 5.4 Vínculo no login (`acceptPendingInvitation`)
```typescript
type AcceptResult =
  | { status: "JOINED"; familyName: string }
  | { status: "NONE" }
  | { status: "EXPIRED" };      // havia convite para o e-mail, mas vencido
async function acceptPendingInvitation(user: { id: string; email: string; emailVerified: Date | null }): Promise<AcceptResult>
```
Em transação: exige `user.emailVerified != null`; busca `status = PENDING AND email = user.email AND expiresAt > now` mais recente; cria `Member { role: invitation.role }`; marca `ACCEPTED` (`acceptedAt`, `acceptedByUserId`); `P2002` em `Member.userId` → `NONE`. Sem convite válido, mas existindo `PENDING` vencido (ou `EXPIRED` há < 30 dias) para o e-mail → `EXPIRED`. **Convite cancelado → `NONE`** (cai no onboarding sem aviso, conforme a história).

### 5.5 Página `/convite/[token]` (server)
`previewInvitation(token, sessionUser?)` → um de:
| Estado | Condição | UI |
| :-- | :-- | :-- |
| `INVALID` | hash inexistente ou `CANCELED` | "Este convite não é mais válido." + *Ir para o início* |
| `EXPIRED` | vencido | **"Convite expirado. Peça um novo convite."** |
| `ACCEPTED` | já aceito | "Este convite já foi usado." |
| `NEEDS_LOGIN` | sem sessão | "{Convidante} convidou você para a {Família}" + botão Entrar com o Google (e dev-login) com `callbackUrl=/convite/<token>` |
| `WRONG_EMAIL` | sessão com e-mail ≠ convite | **"Este convite é para outro e-mail"** + ação *Entrar com outra conta* (`signOut` → `/login?callbackUrl=…`). Nenhum vínculo. |
| `READY` | sessão com e-mail igual | executa `acceptPendingInvitation` e `redirect("/?joined=1")` |
Home exibe o aviso **"Você entrou na {Família}"** quando `?joined=1` e remove o parâmetro (`router.replace`).

### 5.6 Gate de entrada `resolveAppEntry(user)` (usado por `(app)/layout.tsx` e `/onboarding`)
`Member` existe → segue. Senão `acceptPendingInvitation`: `JOINED` → `redirect("/?joined=1")`; `EXPIRED` → `redirect("/onboarding?notice=invite_expired")` (e a UI exibe "Convite expirado. Peça um novo convite."); `NONE` → `redirect("/onboarding")`.

### 5.7 Tela *Família* (`/familia`)
Lista de membros (avatar, nome, e-mail, papel); **ADMIN** vê *Convidar membro* (drawer: e-mail + papel, padrão *Membro*) e *Convites pendentes* (e-mail, validade "expira em N dias" ou "Expirado", ação *Cancelar convite* com confirmação); **MEMBER** não vê a ação (e a rota devolve `403`). Estado vazio (1 membro): "Convide quem divide as contas com você". Falha de envio: aviso "Convite criado, mas o e-mail não foi enviado" + botão *Copiar link do convite*.

---

## 6. Segurança
- Token só em hash; link não concede acesso; e-mail exige `emailVerified`.
- Papel `ADMIN` imposto no `withApi({ role: "ADMIN" })` (matriz de permissão testada).
- Segredos fora do git; `AUTH_SECRET` obrigatório fora de `test`.
- `dev-login` isolado conforme ADR-008 + teste que simula `NODE_ENV=production`.
- Logs (pino) **nunca** registram token de convite nem cookie.

## 7. Estados de UI e chaves de cache
`/login`: ocioso · erro (`?error=`) · dev-login ativo. `/onboarding`: ocioso · enviando · erro. `/familia`: skeleton · vazio · lista · erro. Invalida `["family"]` e `["me"]` após criar família e após criar/cancelar convite.

## 8. Testes obrigatórios (BDD → teste)

Convenções do SDD-000 §9. **U** = unidade, **I** = integração (Postgres `db-test`), **E** = E2E (playwright-bdd, usa `loginAs`).

### US-001
| Cenário BDD | Testes |
| :-- | :-- |
| Primeiro acesso sem família nem convite | **E**: `loginAs(mariana)` → cai em `/onboarding`. **I**: dev-login cria `User` com nome/e-mail minúsculo/`emailVerified`, sem `Member`. |
| Acesso de membro que já tem família | **E**: `loginAs(lucas)` (seed) → Home "Família Silva" com nome e foto no cabeçalho. |
| Sessão persistente | **E**: login, fechar a página, abrir nova página no mesmo contexto → sem tela de login. **U**: `authConfig.session` com `maxAge=90d`, `updateAge=24h`. |
| Rota protegida sem sessão | **E**: acessar `/contas` sem sessão → `/login?callbackUrl=%2Fcontas`; após login volta a `/contas`. **U**: `safeCallbackUrl` rejeita `//evil.com`, `https://x`, `/\x`, vazio. |
| Usuário cancela no Google | **E**: abrir `/login?error=AccessDenied` mostra "Não foi possível entrar. Tente novamente." **I**: nenhuma linha em `users`/`sessions`. |
| E-mail Google não verificado | **U**: `authorizeSignIn({provider:"google", profile:{email_verified:false}})` → `"/login?error=EmailNotVerified"`; `true` quando `true`. **E**: `/login?error=EmailNotVerified` exibe a mensagem; sem conta criada. |
| Sair do sistema | **E**: clicar "Sair" → `/login`; `GET /api/v1/me` → 401; **I**: linha de `sessions` removida. |
| (infra) Dev-login seguro | **I**: com `AUTH_DEV_LOGIN=false` → 404; com `NODE_ENV=production` → 404; host `evil.com` → 403; `register()` lança com produção+flag. **U**: `normalizeEmail`. |

### US-002
| Cenário BDD | Testes |
| :-- | :-- |
| Criar família com sucesso | **I**: `POST /families` → 201; `Member.role=ADMIN`; **8 categorias EXPENSE + 3 INCOME** com os nomes exatos; `SplitRuleVersion EQUAL` criada; `cutDay=1`. **E**: fluxo completo e chegada ao passo de convite. |
| Nome sugerido | **U**: `suggestFamilyName` (casos acima). **E**: campo vem "Família Silva". |
| Nome inválido | **U**: schema ("", " a ") → mensagem exata. **I**: 400 e nenhuma família criada. **E**: mensagem visível. |
| Duplo clique não duplica | **I**: 2× simultâneas, mesma chave → 1 família, mesma resposta. 2× com chaves diferentes → 1×201 e 1×409 `ALREADY_IN_FAMILY`. **E**: duplo clique → 1 família. |
| Quem já tem família não refaz onboarding | **E**: `loginAs(lucas)` → `/onboarding` redireciona para `/`. |
| (infra) Atomicidade | **I**: falha injetada na criação de categorias → nada persiste (SDD-000 §9.6). |

### US-003
| Cenário BDD | Testes |
| :-- | :-- |
| Enviar convite com sucesso | **I**: 201; `expiresAt = now + 7 dias` (relógio fixo); hash ≠ token; e-mail capturado no `InMemoryMailer` com o link. **E**: convite aparece em *Convites pendentes* e o e-mail chega ao **Mailpit** (`GET http://localhost:8025/api/v1/messages`). |
| Convidado entra e é vinculado | **I**: `acceptPendingInvitation` com `Lucas@Exemplo.com` → `Member` com o papel do convite; convite `ACCEPTED`. **E**: login do convidado → Home com "Você entrou na Família Silva". |
| Convite aberto com outra conta | **I**: `previewInvitation` → `WRONG_EMAIL`; sem `Member` criado. **E**: `/convite/<token>` logado como outro → "Este convite é para outro e-mail". |
| E-mail inválido | **U/I**: `"lucas@"` → 400 "Informe um e-mail válido"; nenhum convite. |
| E-mail que já é membro | **I**: 409 `DUPLICATE_MEMBER` com a mensagem exata. |
| Convite duplicado pendente | **I**: 409 `DUPLICATE_INVITATION`; **corrida**: 2 criações simultâneas (chaves diferentes) → 1×201 e 1×409. |
| Cancelar convite | **I**: `cancel` → `CANCELED`; segundo `cancel` → 409; login de Lucas → `NONE` → onboarding. **E**: Admin cancela e some da lista. |
| Convite expirado | **I**: relógio +7d+1s → `EXPIRED`; sem vínculo. **E**: mensagem "Convite expirado. Peça um novo convite." |
| Membro comum não convida | **I**: matriz de permissão (`MEMBER` → 403 em `POST/GET/cancel`). **E**: ação ausente na tela. |
| (infra) Reconvite após vencer | **I**: convite vencido não bloqueia novo (antigo vira `EXPIRED`). |
| (infra) Falha no e-mail | **I**: `MailPort` que lança → 201 com `emailStatus: "FAILED"`, convite persistido. |
| (infra) Isolamento | **I**: Admin da Família B não vê/cancela convites da Família A (404). |

## 9. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-001 | 3 | **5** | Auth.js com sessão em banco + dev-login + middleware + proteção de produção |
| US-002 | 2 | **3** | Inclui `withApi`/idempotência (primeira rota de mutação) e categorias |
| US-003 | 3 | **5** | Token, vínculo no gate, `MailPort`/SMTP, páginas e matriz de papéis |
Dependências técnicas: US-002 entrega `withApi`, `IdempotencyRecord` e `makeRepos` usados por todos os SDDs seguintes.
