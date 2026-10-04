# 📋 Quadro de Tarefas & QA do Desenvolvedor

*Atualizado: 2026-10-04 · Responsável: Agente Desenvolvedor & QA · Base: D-GES-09 (uma TASK por história, na ordem do PO). Execução do Incremento 1 (walking skeleton): EN-001 (complemento SDD-006) → US-001 → US-002 → US-004 → US-005 → US-006 → US-007 → US-003.*

## 📌 Fluxo de Execução

```text
[Todo/Bloqueado] ➔ [Em Desenvolvimento] ➔ [Em Testes/QA] ➔ [Concluído (validação do Gestor)]
```

Regra (diretriz 3 do Gestor em `decisoes-do-gestor.md`): nenhuma história começa sem SDD que a cubra. Ordem: a do PO.

## 🗂️ Visão geral

| TASK | História | Descrição | Depende de | Especificação | Tam. | Status |
| :-- | :-- | :-- | :-- | :-- | :-: | :-- |
| TASK-001 | EN-001 | Ambiente local e esqueleto (+ complemento SDD-006: utilitários puros, `check:imports`, E2E 3101/db-test) | — | `architecture/ambiente-local.md`, SDD-006 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-002 | US-001 | Entrar com a conta Google (dev-login + Google real em EXT-01) | EN-001 | SDD-003 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-003 | US-002 | Criar a família no primeiro acesso | US-001 | pendente TL | 2 | Bloqueado: aguarda SDD |
| TASK-004 | US-004 | Cadastrar conta bancária com saldo inicial | US-002 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-005 | US-005 | Lançar uma despesa rapidamente | US-004 | SDD-001 (a revisar: isSharedExpense, splitRule, pagador) | 5 | Bloqueado: aguarda revisão do SDD-001 |
| TASK-006 | US-006 | Lançar uma receita | US-005 | SDD-001 (a revisar) | 2 | Bloqueado: aguarda revisão do SDD-001 |
| TASK-007 | US-007 | Consultar o extrato com filtros | US-005, US-006 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-008 | US-003 | Convidar um membro por e-mail (Mailpit local; EXT-02) | US-002 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-009 | US-008 | Definir a regra de divisão das despesas comuns | US-003 | SDD-002 (pendente TL) | 2 | Bloqueado: aguarda SDD |
| TASK-010 | US-009 | Ver o acerto de contas do mês | US-005, US-008 | SDD-002 (pendente TL) | 5 | Bloqueado: aguarda SDD |
| TASK-011 | US-010 | Transferir dinheiro entre contas da família | US-004 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-012 | US-011 | Registrar o acerto de contas como transferência | US-009, US-010 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-013 | US-012 | Home: visão essencial da família | US-004, US-007, US-009 | pendente TL | 3 | Bloqueado: aguarda SDD |
| TASK-014 | US-013 | Corrigir ou excluir um lançamento com trilha de auditoria (Should, dentro da R1) | US-005, US-007 | SDD-001 (a revisar) | 3 | Bloqueado: aguarda SDD |

---

## ✅ [TASK-001] EN-001 — Ambiente local e esqueleto
- **História PO**: [EN-001](../../product-owner/backlog/stories/EN-001-ambiente-local-e-esqueleto.md)
- **Especificação Técnica**: [`ambiente-local.md`](../../tech-lead/architecture/ambiente-local.md), ADR-001, ADR-002, ADR-003, D-GES-10/11 (não havia SDD específico).
- **Status**: Concluído, aguardando validação do Gestor.
- **Arquivos Criados/Modificados**:
  - `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `biome.json`
  - `docker-compose.yml`, `.env.example`, `.gitignore`
  - `prisma/schema.prisma`, `prisma/migrations/*_baseline`, `prisma/seed.ts`, `prisma.config.ts`
  - `src/app/{layout,page,globals}`, `src/app/api/health/route.ts`, `src/lib/{env,db}.ts`, `src/modules/{health,contas,cartoes,transacoes,orcamento,split,familia}`
  - `vitest.config.mts`, `vitest.int.config.mts`, `playwright.config.ts`, `tests/{setup.ts,unit,integration,e2e}`
  - `commitlint.config.mjs`, `.husky/{pre-commit,commit-msg}`, `README.md` (seção Ambiente Local)
- **Checklist de QA & Testes**:
  - [x] `docker compose -p finance-manager up -d`: `db`, `db-test` e `mailpit` saudáveis (portas 5442, 5443, 1025/8025).
  - [x] `pnpm i`, `pnpm db:migrate` (baseline) e `pnpm db:seed` executados.
  - [x] `pnpm dev` na 3100: `/` renderiza e `/api/health` retorna 200 `{"status":"ok","checks":{"database":"up"}}`.
  - [x] `pnpm lint`, `pnpm typecheck`, `pnpm build` sem erros.
  - [x] `pnpm test`: 3 testes (unidade da regra de health e componente da home).
  - [x] `pnpm test:int`: 2 testes contra Postgres real (porta 5443), migração aplicada.
  - [x] `pnpm test:e2e`: cenário BDD de fumaça (pt) em viewport desktop e mobile (Pixel 7).
  - [x] commitlint: rejeita mensagem sem tipo e sem trailer `Co-authored-by`; aceita a correta.
  - [ ] `pnpm db:reset`: **não executado pelo agente**, o Prisma bloqueia `migrate reset` em sessões de IA sem consentimento explícito do usuário. Rodar manualmente.
- **Desvios / decisões** (também em `agents/manager/`):
  - Portas conforme D-GES-10 (5442/5443/3100); `ambiente-local.md` do TL ainda cita as antigas.
  - Versões instaladas são as mais recentes do registry: Next 16, React 19, Prisma 7.10 (com `@prisma/adapter-pg`, `prisma.config.ts`, client gerado em `src/generated`, ignorado no git), TypeScript 7, Vitest 5, Biome 2. Prisma CLI fixado em 7.10 (o 8.0 rc não casa com o client).
  - Banco com tabela técnica `SystemInfo` apenas; o seed cria só um marcador. A família fictícia entra com os modelos (US-001+), já que não há SDD de dados ainda.
  - `test:int` usa o `db-test` (5443) em vez de Testcontainers; o `ambiente-local.md` admite o `db-test` como atalho. Testcontainers pode ser adotado depois.
  - Worker pg-boss (`pnpm worker`), Auth.js, shadcn/ui, TanStack Query, Serwist e pino ficam para as histórias que os exigem (sem SDD ainda).
  - Hooks de commit rodam `lint` + `typecheck` do repositório inteiro.

---

### ✅ [TASK-001b] EN-001 — Complemento SDD-006 (feito no início do Incremento 1)
- **Especificação**: SDD-006 §1..§6, SDD-000 §3..§5 e §8.
- **Arquivos**: `src/lib/{money,dates,period,apportion,clock,ids,logger,env}.ts`, `scripts/check-imports.ts`, `playwright.config.ts` (porta 3101, `db-test`, `distDir .next-e2e`, relógio fixo `APP_NOW_OVERRIDE=2026-10-04T15:00:00Z`), `tests/support/{db,call,factories,login}.ts`, `tests/integration/{setup,global-setup}.ts`, `tests/e2e/{global-setup.ts,support/*}`, `.husky/pre-commit` (+`check:imports`), `src/modules/health/repo.ts`.
- **Checklist de QA**:
  - [x] Utilitários puros com testes de unidade: `money` (parse/format/centavos), `period` (cutDay 1/15/28, virada de ano, bissexto), `apportion` (vetores A1..A7 + 1.500 casos aleatórios com semente fixa), `dates`, `clock`, `env` (guarda de produção).
  - [x] `pnpm check:imports` (ADR-013) no `pnpm test` e no pre-commit; testes dele.
  - [x] commitlint: teste que roda o CLI (rejeita sem tipo / sem `Co-authored-by`; aceita a correta).
  - [x] E2E sobe o app em `http://localhost:3101` contra `finance_test` (5443); `reuseExistingServer: false`.
- **Desvios**: client Prisma gerado com `moduleFormat = "cjs"` (o Playwright não carrega `import.meta`); mensagem de `amountInCentsSchema` para não-inteiro é "Informe um valor maior que zero" (SDD-001 §7 exige essa mensagem para `1.5`; o SDD-000 §3 trazia outro texto).

## ✅ [TASK-002] US-001 — Entrar com a conta Google
- **História PO**: [US-001](../../product-owner/backlog/stories/US-001-login-com-google.md)
- **Especificação Técnica**: [SDD-003](../../tech-lead/sdd/SDD-003-auth-familia-convite.md) §1..§3, ADR-002, ADR-008 · SDD-000 §2 (`withApi`).
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - Banco: `prisma/schema.prisma`, `prisma/migrations/*_us001_auth_e_nucleo_familiar` (Auth.js, Family, Member, Category, SplitRuleVersion/Share, IdempotencyRecord + CHECKs).
  - API: `src/lib/api/{with-api,errors,idempotency,response,types}.ts`, `src/lib/schemas.ts`, `src/app/api/v1/me/route.ts`, `src/app/api/dev/login/route.ts`, `src/app/api/auth/[...nextauth]/route.ts`.
  - Auth: `src/auth.ts`, `src/lib/auth/{config,session,dev-login,dev-login-guard,dev-login-handler,redirect,email,require-session}.ts`, `src/proxy.ts`, `src/instrumentation.ts`.
  - UI: `src/app/(public)/login/*`, `src/app/(app)/{layout,page}.tsx`, `src/app/onboarding/page.tsx` (placeholder até US-002), `src/components/{app-shell,providers}.tsx`, `src/components/ui/*`.
  - Testes: `tests/unit/auth/auth-pure.test.ts`, `tests/integration/us-001-auth.int.test.ts`, `tests/e2e/features/US-001-login.feature` + `steps/US-001-login.steps.ts`.
- **Checklist de QA & Testes**:
  - [x] `pnpm lint`, `typecheck`, `build` sem erros.
  - [x] `pnpm test`: 92 testes (inclui `safeCallbackUrl`, `authorizeSignIn`, `sessionConfig` 90 d/24 h, `isLocalHost`, guardas de produção).
  - [x] `pnpm test:int`: 19 testes contra Postgres real (dev-login 404/403/400, cookie, sessão deslizante, `GET /me`, adaptador com e-mail minúsculo, `register()` lança com produção+flag).
  - [x] `pnpm test:e2e`: 8 cenários BDD (pt) x desktop e mobile = 16 passando. O cenário "Login de teste indisponível em produção" é `@integration` (coberto por Vitest: 404 com `NODE_ENV=production` e `register()` lançando), pois o E2E roda em dev.
  - [x] Verificação manual no navegador integrado (http://localhost:3100, Postgres dev 5442): login de teste (Mariana/Lucas), `callbackUrl` de volta a `/contas`, onboarding sem família, Home com família (nome e avatar no cabeçalho), menu "Sair" volta ao `/login`; viewports 375 px e desktop sem rolagem horizontal.
- **Bug achado na verificação manual (corrigido)**: `AUTH_TRUST_HOST` não estava no `.env.example`; sem ele o `signOut` do Auth.js falhava com `UntrustedHost` (o E2E mascarava por definir a variável). Adicionado ao `.env.example` (e `MAIL_FROM`, `APP_NOW_OVERRIDE` comentado).
- **Desvios** (também em `agents/manager/pedidos-ao-gestor.md`):
  1. `middleware.ts` virou **`src/proxy.ts`** (Next 16 renomeou a convenção).
  2. `withApi` + `IdempotencyRecord` nascem na US-001 (e não na US-002) porque `GET /api/v1/me` já usa o wrapper; migração única `us001_auth_e_nucleo_familiar` também antecipa Family/Member/Category/SplitRule (o cenário "membro que já tem família" precisa delas).
  3. A sessão é lida direto do banco pelo cookie do Auth.js (`findSessionUser`), em `withApi` e nos Server Components; o Auth.js fica para OAuth Google e `signOut`. Equivale ao `auth()` com `strategy: "database"` e permite testar rotas sem o contexto do Next.
  4. `check:imports` ganhou a exceção `src/lib/auth/**` (infra de autenticação que usa `getDb()` antes de existir contexto de família).
  5. Erros 4xx de regra de negócio não são gravados no `IdempotencyRecord` (ADR-009 §4 sugere gravar): o *rollback* descarta a chave e a repetição reproduz o mesmo erro de forma determinística. 2xx são gravados.
  6. Gherkin: `E, após entrar, volto…` virou `E após entrar, volto…` (a vírgula impede o parser reconhecer a palavra-chave).

---

## 🔒 Demais tarefas (TASK-002 a TASK-014)

Cada uma segue o formato do `README.md` do desenvolvedor e só inicia com SDD publicado pelo Tech Lead. Sem checklist detalhado ainda: ele é derivado do BDD da história e da seção de testes do SDD no momento do início.
