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
| TASK-003 | US-002 | Criar a família no primeiro acesso | US-001 | SDD-003 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-004 | US-004 | Cadastrar conta bancária com saldo inicial | US-002 | SDD-004 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-005 | US-005 | Lançar uma despesa rapidamente | US-004 | SDD-001 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-006 | US-006 | Lançar uma receita | US-005 | SDD-001 | 2 | Concluído (aguardando validação do Gestor) |
| TASK-007 | US-007 | Consultar o extrato com filtros | US-005, US-006 | SDD-005 | 5 | Concluído (aguardando validação do Gestor) |
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

## ✅ [TASK-003] US-002 — Criar a família no primeiro acesso
- **História PO**: [US-002](../../product-owner/backlog/stories/US-002-criar-familia.md)
- **Especificação Técnica**: [SDD-003](../../tech-lead/sdd/SDD-003-auth-familia-convite.md) §4 · SDD-000 §2.3 (`makeRepos`), §7 (estados de UI).
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - `src/modules/familia/{service,repo}.ts` (`createFamily`, `getFamily`, `familiaRepo` com escritas agrupadas), `src/lib/api/{repos,db-errors}.ts` (`makeRepos`, P2002).
  - `src/app/api/v1/families/route.ts` (POST), `src/app/api/v1/family/route.ts` (GET).
  - `src/app/onboarding/{page,onboarding-flow}.tsx` (RHF + Zod, `Idempotency-Key` gerada ao abrir o formulário, guarda contra duplo envio, passo de convite pulável).
  - Testes: `tests/unit/familia/familia.test.ts`, `tests/unit/ui/onboarding-flow.test.tsx`, `tests/integration/{with-api,us-002-familia}.int.test.ts`, `tests/e2e/features/US-002-criar-familia.feature` + steps.
- **Checklist de QA & Testes**:
  - [x] U: `suggestFamilyName` (4 casos do SDD + extras), schema ("", " a " => mensagem exata), 8+3 categorias com nomes exatos.
  - [x] Componente: sugestão preenchida e com foco; nome inválido não chama a API; duplo clique envia 1 requisição com `Idempotency-Key`; falha de rede preserva o nome e reaproveita a chave.
  - [x] I: `POST /families` 201 (ADMIN, 11 categorias, regra EQUAL 1970-01-01, `cutDay=1`), 400 sem criar nada, 2x simultâneas mesma chave = 1 família + `Idempotent-Replay`, chaves diferentes = 1x201 + 1x409 `ALREADY_IN_FAMILY`, atomicidade com falha injetada (nada persiste e nenhum registro de idempotência), isolamento entre famílias.
  - [x] I (`withApi`, SDD-000 §9): BAD_ORIGIN (sem Origin, Origin alheio, Content-Type não JSON), 401, NO_FAMILY, 400 `VALIDATION_ERROR` com `details`, `INVALID_JSON`, `.strict()` (`familyId` rejeitado), `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, replay, escopo da chave por usuário.
  - [x] E2E: 5 cenários BDD x desktop e mobile.
  - [x] `pnpm lint`, `typecheck`, `test` (111), `test:int` (41), `test:e2e` (26), `build` verdes.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev): mobile 375 px (usuário novo Ana Souza: nome sugerido "Família Souza", erro "Informe um nome com pelo menos 2 caracteres", botão fixo no rodapé, criação, passo de convite, "Fazer depois" leva à Home) e desktop (onboarding centralizado). Banco dev: 11 categorias e papel ADMIN conferidos por SQL.
- **Observação**: o passo de convite mostra apenas "Fazer depois" e o texto explicativo; o formulário de e-mail chega com a US-003.

---

## ✅ [TASK-004] US-004 — Cadastrar conta bancária com saldo inicial
- **História PO**: [US-004](../../product-owner/backlog/stories/US-004-cadastrar-conta-bancaria.md)
- **Especificação Técnica**: [SDD-004](../../tech-lead/sdd/SDD-004-contas-e-ledger.md) §1..§7 (parte US-004; transferência/US-010 fica para o Incremento 2) · ADR-007.
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - Banco: `prisma/schema.prisma`, migração `*_us004_ledger_contas` (BankAccount, TransferGroup, Transaction, TransactionRevision + SQL cru: índice de nome, CHECKs do ledger, índice de perna, triggers append-only/sem hard delete).
  - `src/modules/contas/{schemas,repo,service,ledger,ledger-queries,hooks}.ts` (`accountBalances` única, `recordRevision`), `src/app/api/v1/accounts/{route,[id]/route}.ts`.
  - UI: `src/app/(app)/contas/*` (lista, drawer Nova conta, renomear), `src/components/{money-input}.tsx`, `ui/{drawer,menu}.tsx`, `hydration-marker.tsx`; `src/lib/dates.ts` (`toDbDate`/`fromDbDate`).
  - Testes: `tests/unit/contas/schemas.test.ts`, `tests/integration/{us-004-contas,migrations}.int.test.ts`, `tests/e2e/features/US-004-contas.feature` + steps; `tests/support/factories.ts` (`makeAccount`), `tests/support/nav.ts`.
- **Checklist de QA & Testes**:
  - [x] U: schema (mensagens "Informe o nome da conta"/"Escolha o tipo da conta", saldo negativo, strict, limites), `formatBRL(-30000)` (EN-001).
  - [x] I (24 testes): criação 150000 (saldo, OPENING CREDIT, revisão CREATE, total consolidado), titular padrão, saldo -30000 (OPENING DEBIT), campos obrigatórios (400 + nada criado), nome duplicado com caixa/espaços (409 + corrida 1x201/1x409), visibilidade entre membros, isolamento (GET/PATCH), renomear (version, 409 `VERSION_CONFLICT`, corrida, duplicado, 404), atomicidade da abertura, idempotência, triggers (DELETE em `transactions` e UPDATE/DELETE em revisões), `accountBalances`, data futura (422) e titular de outra família (422).
  - [x] I: migração íntegra (CHECKs, índices e triggers existem e barram dados inválidos).
  - [x] E2E: 8 cenários BDD x desktop e mobile.
  - [x] `lint`, `typecheck`, `test` (120), `test:int` (69), `test:e2e` (42), `build` verdes; E2E rodado em sequência 3x sem falhas após o ajuste de hidratação.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev): desktop (estado vazio, drawer, máscara "R$ 1.500,00", criação, saldo consolidado) e mobile 375 px (skeleton, erro "Já existe uma conta com este nome", botão ± e "-R$ 300,00" em vermelho, toast, renomear, `scrollWidth == 375`). Ajustei o card para o saldo ir abaixo do nome no celular (nomes eram truncados).
- **Desvios**: botão "Transferir" e tela de transferência não existem (US-010, fora do Incremento 1). Achado: após mudar o schema Prisma, o `pnpm dev` precisa ser reiniciado (cliente Prisma singleton em cache). E2E ganhou `HydrationMarker` (`data-hydrated`) e `gotoReady` para evitar cliques antes da hidratação.

---

## ✅ [TASK-005] US-005 — Lançar uma despesa rapidamente
## ✅ [TASK-006] US-006 — Lançar uma receita
- **Histórias PO**: [US-005](../../product-owner/backlog/stories/US-005-lancar-despesa.md), [US-006](../../product-owner/backlog/stories/US-006-lancar-receita.md) (implementadas juntas: o drawer e o serviço são os mesmos, `type = INCOME`).
- **Especificação Técnica**: [SDD-001](../../tech-lead/sdd/SDD-001-transacoes.md) §1..§5 e §7 (US-005/US-006; edição/exclusão/histórico = US-013, Incremento 2).
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - API: `src/modules/transacoes/{schemas,repo,service,hooks}.ts`, `src/app/api/v1/{transactions/route.ts (POST),transactions/defaults/route.ts,categories/route.ts}`.
  - UI: `src/components/{quick-add,transaction-drawer,category-icon}.tsx` (FAB "+", drawer rápido, diálogo "Cadastre uma conta primeiro"), `ui/drawer.tsx` (foco inicial), `app-shell.tsx`.
  - Testes: `tests/unit/transacoes/schemas.test.ts`, `tests/integration/us-005-006-lancamentos.int.test.ts`, `tests/e2e/features/US-005-*.feature` e `US-006-*.feature` + steps + `tests/e2e/support/lancamento.ts`, `tests/support/constants.ts`.
- **Checklist de QA & Testes**:
  - [x] U: schema (valor 0/-5/1.5/ausente = "Informe um valor maior que zero", categoria/conta obrigatórias, descrição vazia/espaços/"a", strict, receita sem `isSharedExpense`).
  - [x] I (29 testes): despesa comum (saldo 84950, autor/pagador, hoje, revisão CREATE), outro pagador, pessoal, valores inválidos, descrição omitida, duplo clique simultâneo (1 linha, saldo 1x, `Idempotent-Replay`), `IDEMPOTENCY_KEY_REUSED`, data retroativa/futura com a mensagem exata e virada de dia em `America/Sao_Paulo` (02:30 UTC), referências de outra família (422), `CATEGORY_KIND_MISMATCH`, strict, atomicidade (falha na revisão), defaults (último lançamento, titular, sem contas), categorias (ordem, filtro, isolamento), receita (salário 650000, outro recebedor, `isSharedExpense` => 400, categoria de despesa => 422, futura).
  - [x] E2E: 13 cenários da US-005 + 5 da US-006, desktop e mobile (76 testes no total da suíte, verdes).
  - [x] `lint`, `typecheck`, `test` (133), `test:int` (98), `test:e2e` (76), `build` verdes.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev): mobile 375 px (FAB sobre a barra inferior, drawer inferior com foco no valor, categorias em grade, toast "Despesa registrada com sucesso!") e desktop (modal centralizado, alternância para "Nova Receita" com 3 categorias, "Quem recebeu?" e sem switch, `Esc` fecha). O saldo conferido em `/contas` batia com o lançamento (o valor digitado em duplicidade por mim no teste manual foi refletido corretamente: máscara acumula dígitos).
- **Desvios**: a atualização otimista (item `pending` no topo do extrato) fica com a US-007, onde existe a lista; aqui há invalidação de `["accounts"]`, `["transactions"]`, `["home"]`, `["settlement"]`. O campo "Descrição" fica em "Mais detalhes" (SDD-001 §5.1 só cita data e observação; o BDD "Descrição omitida" exige poder informá-la). `GET /transactions/defaults` devolve também `today` (data do servidor no fuso da família) para o `max` do campo data.

---

## ✅ [TASK-007] US-007 — Consultar o extrato com filtros
- **História PO**: [US-007](../../product-owner/backlog/stories/US-007-extrato-de-lancamentos.md)
- **Especificação Técnica**: [SDD-005](../../tech-lead/sdd/SDD-005-extrato-e-home.md) §1..§4 e §6 (parte US-007; Home/US-012 fica para o Incremento 2) · SDD-001 §3 (`GET /transactions/:id`) e §5.1 (atualização otimista).
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - API: `src/modules/transacoes/{extrato,schemas,repo,service,optimistic,hooks}.ts` (`buildLedgerWhere`, `ledgerTotals`, keyset, `listTransactions`, `getTransaction`), `src/app/api/v1/transactions/{route,[id]/route}.ts`.
  - UI: `src/app/(app)/extrato/*` (tela, filtros na URL, linhas, detalhe), `src/lib/use-media-query.ts`, `app-shell.tsx` (nav Extrato, banner "Sem conexão.").
  - Testes: `tests/unit/transacoes/optimistic.test.ts`, `tests/integration/us-007-extrato.int.test.ts`, `tests/e2e/features/US-007-extrato.feature` + steps; `tests/support/factories.ts` (`makeTransaction`, `makeTransfer`).
- **Checklist de QA & Testes**:
  - [x] U (8): atualização otimista (insere no topo/na posição certa, ajusta totais, não muta o original para permitir *rollback*, respeita filtros/período).
  - [x] I (26): extrato padrão (ordem, campos, sem OPENING, totais), membro (pagador OU autor, incluindo os dois cruzados), categoria+tipo, período (30/09 vs 01/10) e `from/to`, detalhe (autor/pagador, 404), vazios, isolamento, **keyset com 120 lançamentos de mesmo `occurredOn`/`createdAt`** (5 páginas, sem duplicata/omissão, ordem igual ao `ORDER BY` do banco), `limit=101`/cursor adulterado, **propriedade Σ itens == totais** em 9 combinações de filtro, transferência/acerto/abertura/excluído fora dos totais (`type=TRANSFER` zera os totais com `count=4`), `includeDeleted` (inclui `UNDONE`), `shared`, parâmetros inválidos (7 casos), EXPLAIN informativo.
  - [x] E2E: 9 cenários BDD x desktop e mobile (suíte inteira: 94 testes verdes).
  - [x] `lint`, `typecheck`, `test` (142), `test:int` (124), `test:e2e` (94), `build` verdes.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev): desktop (barra de filtros, totais, linha com marcador "Comum", novo lançamento pelo "+" aparece no topo e atualiza os totais sem recarregar) e mobile 375 px (botão "Filtros", cartões, detalhe com "Pago por"/"Registrado por", `scrollWidth == 375`). Ajustei títulos e totais para quebrar linha no celular (antes truncavam).
- **Desvios**:
  1. O Contexto do Gherkin da US-007 tinha uma frase em várias linhas, que o parser não aceita; virou três passos (`Dado… / E… / E…`).
  2. Rolagem infinita usa `IntersectionObserver` e também um botão "Carregar mais" (acessibilidade e teste).
  3. Lista no desktop é uma grade de colunas por linha (não uma `<table>`), mantendo o mesmo componente responsivo.
  4. Achado durante o E2E: duas mudanças de filtro em sequência rápida perdiam a primeira (a URL só atualiza após a navegação); corrigido com *ref* do último filtro pedido.

---

## 🔒 Demais tarefas (TASK-002 a TASK-014)

Cada uma segue o formato do `README.md` do desenvolvedor e só inicia com SDD publicado pelo Tech Lead. Sem checklist detalhado ainda: ele é derivado do BDD da história e da seção de testes do SDD no momento do início.
