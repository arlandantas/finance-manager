# 📋 Quadro de Tarefas & QA do Desenvolvedor

*Atualizado: 2026-10-27 (TASK-001..087 registradas; ver a seção final "Fila de implementação") · Responsável: Agente Desenvolvedor & QA · Base: D-GES-09 (uma TASK por história, na ordem do PO). Os trechos "Ponto de retomada" e "Estado do Incremento" abaixo são históricos e foram marcados como superados.*

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
| TASK-008 | US-003 | Convidar um membro por e-mail (Mailpit local; EXT-02) | US-002 | SDD-003 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-009 | US-008 | Definir a regra de divisão das despesas comuns | US-003 | SDD-002 | 2 | Concluído (aguardando validação do Gestor) |
| TASK-010 | US-009a | Painel de acerto: motor `computeSettlement`, API e painel essencial | US-005, US-008 | SDD-002 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-011 | US-010 | Transferir dinheiro entre contas da família | US-004 | SDD-004 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-012 | US-011 | Registrar o acerto de contas como transferência | US-009a, US-010 | SDD-002 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-013 | US-012 | Home: visão essencial da família | US-004, US-007, US-009a | SDD-005 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-014 | US-009b | Acerto com 3 membros e lista expansível das despesas (Should, cortável) | US-009a | SDD-002 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-015 | US-013a | Editar, excluir, restaurar com auditoria e conflito 409 (Should, núcleo) | US-005, US-007 | SDD-001 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-016 | US-013b | Desfazer transferência/acerto e aviso de mês acertado (Should, cortável) | US-013a, US-010, US-011 | SDD-001, SDD-004 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-017 | US-014 | Gerenciar categorias (R2, Could) | US-002, US-005 | SDD-007 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-018 | US-015 | Cadastrar cartão de crédito (R2) | US-002 | SDD-008 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-019 | US-016a | Compra à vista no cartão (R2; reescreve `tx_kind_shape_chk`) | US-015, US-005 | SDD-008 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-020 | US-017a | Ver a fatura do cartão (R2) | US-016a | SDD-008 | 3 | Concluído (aguardando validação do Gestor); cenário "fatura fechada em A pagar" (Home) entra com a US-018 |
| TASK-021 | US-018 | Despesa prevista pontual (R2) | US-005, US-012 | SDD-009 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-022 | US-019 | Dar baixa em despesa prevista (R2) | US-018, US-013a | SDD-009 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-023 | US-017b | Pagar a fatura (R2, Should) | US-017a, US-013a | SDD-008 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-024 | US-016b | Corrigir compra no cartão e filtrar por cartão (R2, Should) | US-016a, US-013a | SDD-008 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-025 | EN-001 | Ambiente dev multi-origem (localhost, IP da LAN, túnel) e diagnóstico do Google | EN-001 | SDD-000 | 2 | Concluído (aguardando validação do Gestor) |
| TASK-026 | US-027 | Ocultar valores (`Money`, `prefs`, olho, `maskMoneyInText`, regra de CI) | — | SDD-010 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-027 | US-022 | Rótulo honesto da regra (`explainByRules`, `splitExplanation`, histórico) | US-008/009a | SDD-011 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-028 | US-023 | Conta de origem padrão (`suggestSourceAccount`, `usageCountByMe`) | US-017b, US-019 | SDD-013 | 3 | Concluído (aguardando validação do Gestor); cenário "arquivada" liga com a US-032 |
| TASK-029 | US-024 | Descrição visível e opcional + busca `q` no Extrato | US-005/006/016a | SDD-013 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-030 | US-025 | Resumo do Mês (`getMonthSummary`, `GET /month-summary`, `listDueItems`, `ledger-where`) | US-012, US-017a, US-018 | SDD-010 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-031 | US-026 | Saldos das contas em card recolhível | US-025 | SDD-010 | 2 | Concluído (aguardando validação do Gestor) |
| TASK-032 | US-028 | Acerto opcional (`Family.settlementEnabled`, `FamilyEvent`, `PATCH /family/settings`, guarda `SETTLEMENT_DISABLED`, onboarding, linguagem neutra) | US-009a/011/012 | SDD-011 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-033 | US-029 | Indicador neutro de acerto no Resumo + aviso de meses anteriores (janela de 12 meses) | US-028, US-025 | SDD-011 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-034 | US-030 | Despesa e previsão nascem "Só meu"; rótulo da regra; linha "Só meu" no Acerto | US-028 | SDD-011 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-035 | US-031 | Prévia de impacto da regra, sugestão pela renda, FAB oculto na regra | US-022 | SDD-011 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-036 | US-032 | Arquivar, reativar e excluir (lógico) conta; lock de postagem; migração `r21_arquivamento` | US-004/010 | SDD-012 | 5 | Concluído (aguardando validação do Gestor); fecha os cenários "arquivada" das US-023/026 |
| TASK-037 | US-033 | Arquivar, reativar e excluir cartão (bloqueios de fatura, `getOrCreateInvoice` recusa arquivado) | US-032 | SDD-012 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-038 | US-034 | Editar nome da família, papéis, trilha de eventos (último Administrador sob lock) | US-028 | SDD-012 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-039 | US-035 | Remover membro e sair (ex-membro, migração `r21_ex_membro`, motor com `removedOn`, S14..S16, aviso único) | US-034, US-032 | SDD-012, ADR-019 | 8 | Concluído (aguardando validação do Gestor) |
| TASK-040 | US-036 | Detalhe do lançamento na Home (ações rotuladas, `?tx=`, "Ver no Extrato" + `highlight`) | US-013a | SDD-010 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-041 | US-037 | Tema claro, escuro e do sistema (script anti-flash, menu Aparência, contraste AA) | US-027 | SDD-012 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-042 | US-038 | Menu superior no desktop, conteúdo contido a 960 px, barra inferior até 1023 px | US-037 | SDD-012 | 2 | Concluído (aguardando validação do Gestor) |
| TASK-043 | US-039 | Copiar link / reenviar convite (rotação de token), polimento de filtros e validação reativa | US-033 | SDD-012 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-044 | US-040a | Compra parcelada atômica, faturas futuras, limite, parcelas somente leitura (migração `us040_parcelamento`, `competenceOn`) | US-016a | SDD-014 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-045 | US-040b | Excluir/desfazer a compra parcelada inteira, "Ver compra", Extrato por intervalo de até 24 meses | US-040a | SDD-014 | 3 | Concluído (aguardando validação do Gestor) |
| TASK-046 | EN-002a | Motor STORED, despachante por motor, `splitAmount`, `lockFamilySplit`, `computeSettlementLegacy` extraído (S1..S16 nos dois motores) | US-040a | SDD-015 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-047 | EN-002b | `allocateBackfill` (pesos exatos, ADR-021), `migrateFamily` com snapshot e gate de 1 centavo, reversão e `--verify`, script `migrate:split` | EN-002a | SDD-015 | 8 | Concluído (aguardando validação do Gestor); **janela de reversão em curso** |
| TASK-086 | US-045 | Tags livres no lançamento (migrações `us045_*`, `normalizeTagKey`, upsert atômico, edição só de tags, `TagInput`, privacidade) | US-005/006/016a/024 | SDD-016, ADR-022 | 5 | Concluído (aguardando validação do Gestor) |
| TASK-087 | US-047 | Filtrar o Extrato por tag (`tagIds`/`untagged` por `EXISTS`, filtros plurais, painel e chips, URL) | US-045, US-007 | SDD-016, ADR-022 | 2 | Concluído (aguardando validação do Gestor) |

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

## ✅ [TASK-008] US-003 — Convidar um membro por e-mail
- **História PO**: [US-003](../../product-owner/backlog/stories/US-003-convidar-membro.md)
- **Especificação Técnica**: [SDD-003](../../tech-lead/sdd/SDD-003-auth-familia-convite.md) §5 e §8 · ADR-012 · D-GES-07 · EXT-02.
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos Criados/Modificados**:
  - Banco: `prisma/schema.prisma`, migração `*_us003_convites` (Invitation + índice único parcial `(familyId, email) WHERE status='PENDING'`).
  - Serviço: `src/modules/familia/invitations/{constants,email,repo,service}.ts` (`createInvitation`, `cancelInvitation`, `acceptPendingInvitation`, `previewInvitation`), `src/lib/mail.ts` (`MailPort`, `SmtpMailer`/nodemailer, `InMemoryMailer`), `src/modules/familia/service.ts` (gate `resolveAppEntry` e `resolveOnboardingEntry`), `src/lib/api/{types,with-api}.ts` (`afterCommit`).
  - API: `src/app/api/v1/invitations/{route,[id]/cancel/route}.ts`; `GET /family` passa a trazer convites pendentes (só ADMIN).
  - UI: `src/app/(app)/familia/*` (membros, convites pendentes, cancelar com confirmação), `src/components/{invite-form,joined-notice}.tsx`, `src/app/(public)/convite/[token]/page.tsx`, `src/app/(public)/login-options.tsx`, passo de convite do onboarding, `app-shell.tsx` (nav Família).
  - Testes: `tests/integration/us-003-convites.int.test.ts`, `tests/unit/familia/invitation-email.test.ts`, `tests/e2e/features/US-003-*.feature` + steps, `tests/support/mailpit.ts`, `makeInvitation`.
- **Checklist de QA & Testes**:
  - [x] U: `invitationEmail` (snapshot, escape de HTML, sem imagens), `INVITATION_TTL_DAYS = 7`, schemas de e-mail/papel.
  - [x] I (21 testes): 201 com `expiresAt = now + 7 d`, `tokenHash` ≠ token, e-mail capturado no `InMemoryMailer` com o link; normalização `Lucas@Exemplo.com`; vínculo com o papel do convite e convite `ACCEPTED`; idempotência e corrida do vínculo (1 `Member`); `previewInvitation` (`WRONG_EMAIL`, `NEEDS_LOGIN`, `READY`, `INVALID`, `ACCEPTED`, `EXPIRED`); e-mail inválido; `DUPLICATE_MEMBER`; `DUPLICATE_INVITATION` + corrida 1x201/1x409 com 1 e-mail; cancelar (409 `INVITATION_NOT_PENDING`, convidado cai em `NONE`); vencimento exato e +1 s, reconvite após vencer; matriz de papéis (MEMBER = 403, sem sessão = 401); falha do e-mail (`FAILED`, convite persistido, replay com o status final); isolamento entre famílias.
  - [x] E2E: 9 cenários BDD x desktop e mobile, incluindo o e-mail real chegando no **Mailpit** (`GET :8025/api/v1/messages`). Suíte inteira: 112 testes, rodada 2x sem falhas.
  - [x] `lint`, `typecheck`, `test` (145), `test:int` (145), `test:e2e` (112), `build` verdes.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev, Mailpit 8025): desktop (tela Família, validação "Informe um e-mail válido", convite criado com toast e item em "Convites pendentes" com "Expira em 7 dias", e-mail visível na UI do Mailpit com o link); mobile 375 px (link aberto com a conta errada mostra "Este convite é para outro e-mail" + "Entrar com outra conta"; login como `Novo@Exemplo.com` volta ao convite e entra na família; segundo convidado cai na Home com "Você entrou na Família Silva"; membro comum não vê "Convidar membro" nem a seção de pendentes).
- **Bug achado na verificação manual (corrigido)**: o aviso "Você entrou na {Família}" sumia porque o `router.replace("/")` que limpa `?joined=1` remontava a página; o aviso agora vive no shell (`JoinedNotice`) com estado próprio, e o E2E confere URL limpa + aviso visível.
- **Desvios**: (1) o e-mail é enviado por `afterCommit` no `withApi` (o SDD manda enviar após o commit; o wrapper ganhou o gancho e mescla `emailStatus` no corpo e no registro de idempotência); (2) o onboarding ganhou `resolveOnboardingEntry` separado do gate para evitar laço de redirecionamento; (3) o formulário de convite do onboarding não mostra o papel (sempre Membro); (4) nova pendência EXT-09 (Auth.js beta e SMTP real).

---

## 📌 Estado do Incremento 1 (walking skeleton)
EN-001 (complemento), US-001, US-002, US-004, US-005, US-006, US-007 e US-003 **concluídos** e commitados, cada um com `lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `build` e verificação manual (375 px e desktop). (Histórico: o Incremento 2 foi concluído, ver abaixo.)
**Nota de ambiente:** o banco de desenvolvimento ficou com dados de teste manual (Família Silva, Família Souza e lançamentos); `prisma migrate reset` é bloqueado em sessões de IA e o ledger não aceita `DELETE` (trigger). Para limpar: `docker compose -p finance-manager down -v` e `pnpm db:up && pnpm db:migrate && pnpm db:seed` (executar manualmente).

---

## ✅ [TASK-009] US-008 — Definir a regra de divisão das despesas comuns
- **História PO**: [US-008](../../product-owner/backlog/stories/US-008-regra-de-divisao-familiar.md)
- **Especificação Técnica**: [SDD-002](../../tech-lead/sdd/SDD-002-split-e-acerto.md) §1..§3, §5.5, §6.3, §8 · ADR-011 · D-GES-08.
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos**: `src/modules/split/{rules,schemas,labels,repo,service,hooks}.ts`, `src/app/api/v1/split-rule/route.ts`, `src/app/(app)/acerto/regra/*`, `tests/unit/split/rules.test.ts`, `tests/integration/us-008-regra-divisao.int.test.ts`, `tests/e2e/features/US-008-regra-divisao.feature` + steps.
- **Checklist de QA & Testes**:
  - [x] U: `ruleAt` (troca no meio do mês, desempate por `createdAt`, regra futura), `parsePercentToBps` (60, 33,33, 100, 110, -10, abc), `formatBps`, `equalShares`, `isRuleStale`.
  - [x] I (12): padrão EQUAL 1970, PUT 6000/4000 (201, nova versão), soma ≠ 100 (400 e regra mantida), -1000/11000, matriz de papéis (MEMBER 403, `canEdit=false`), novo membro (`stale` na regra e no acerto), vigência (`upcoming`, `EFFECTIVE_FROM_IN_PAST`), setembro idêntico após nova regra, `SHARES_MEMBER_MISMATCH` (faltando/outra família), append-only, `.strict()`/`Idempotency-Key`, isolamento.
  - [x] E2E (7 cenários x 2 viewports): padrão, proporcional (painel usa 60/40), soma, inválido, somente leitura, novo membro (aviso no painel e banner), meses passados.
  - [x] `lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `build` verdes; verificação manual (375 px) junto com a US-009a: soma ao vivo "Total: 90%" + "Os percentuais precisam somar 100%", salvamento 60/40, painel recalculado, Lucas (Membro) em modo somente leitura.
- **Desvios**: DTO do acerto exibe `rule.kind` da regra vigente no último dia coberto pelo período (períodos encerrados nunca mudam); `stale` segue a regra vigente hoje (SDD-002 §4.5). Gherkin: acrescentados `Dado que sou Administrador na tela "Regra de divisão"` aos cenários 3 e 4 (a história não define contexto).

## ✅ [TASK-010] US-009a — Painel de acerto de contas (núcleo)
- **História PO**: [US-009a](../../product-owner/backlog/stories/US-009-painel-de-acerto-de-contas.md)
- **Especificação Técnica**: [SDD-002](../../tech-lead/sdd/SDD-002-split-e-acerto.md) §4, §5.1..§5.3, §6.1, §8.
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos**: `src/modules/split/{settlement,service}.ts` (motor puro + `loadSettlement`), `src/app/api/v1/settlement/{route,expenses/route}.ts`, `src/app/(app)/acerto/{page,acerto-screen}.tsx`, `src/components/app-shell.tsx` (item "Acerto"), `tests/unit/split/settlement.test.ts`, `tests/integration/us-009-acerto.int.test.ts`, `tests/e2e/{features/US-009-*.feature,steps/US-009-*.ts,support/acerto.ts}`.
- **Checklist de QA & Testes**:
  - [x] U: vetores S1..S13 do SDD-002 §4.7, 400 casos aleatórios de propriedade (Σ quota = total, Σ diferença = 0, Σ saldo = 0, sugestões zeram saldos, ≤ N-1, valores > 0, resultado idêntico ao permutar `members`/`expenses`/`rules`), EQUAL só com membros que entraram até o fim do período.
  - [x] I (14): S1 via `POST /transactions`, pessoal fora, 60/40 (S2), centavo ímpar (S3), BALANCED/EMPTY/NEEDS_MORE_MEMBERS, três membros (S4), virada de mês no fuso SP, `GET /settlement/expenses` (total = totalShared; exclui pessoais, receitas, transferências e excluídas), regressão "transferência e acerto não alteram total/quotas/outro mês", despesa excluída muda o painel, isolamento, parâmetros inválidos.
  - [x] E2E (8 cenários x 2): cálculo igualitário, pessoal, proporcional, centavo ímpar, equilibrado, vazio, um membro, navegar entre meses.
  - [x] `lint`, `typecheck`, `test` (170), `test:int` (171), `test:e2e` (142), `build` verdes.
  - [x] Verificação manual (navegador integrado, 3100, Postgres dev limpo com Família Silva): desktop e 375 px sem rolagem horizontal; frase-herói, cartões Pagou/Cota/Diferença com cores e sinal, resumo da regra, link de engrenagem.
- **Desvios**: botão "Registrar acerto" e histórico entram com a US-011; lista expansível e cenário de 3 membros na UI ficam para a US-009b (a lista de sugestões adicionais já é exibida). O painel renderiza todas as sugestões desde já. Gherkin: "Navegar entre meses" ganhou `Dado despesas comuns de setembro e de outubro` e o passo virou `E navego para o mês anterior` (colide com o passo homônimo da US-007).

## ✅ [TASK-011] US-010 — Transferir dinheiro entre contas da família
- **História PO**: [US-010](../../product-owner/backlog/stories/US-010-transferencia-entre-contas.md) · **SDD-004** §2..§5, §7 (inclui `undo`, usado pela US-013b).
- **Arquivos**: `src/modules/contas/{transfers,transfer-preview,schemas,repo,hooks}.ts` (`createTransferGroup` compartilhada com o acerto, `undoTransferGroup`), `src/app/api/v1/transfers/{route,[groupId]/route,[groupId]/undo/route}.ts`, `src/app/(app)/contas/{transfer-drawer,contas-screen}.tsx`, testes `tests/unit/contas/transfer-preview.test.ts`, `tests/integration/us-010-transferencia.int.test.ts`, `tests/e2e/features/US-010-*.feature` + steps.
- **QA**: U (prévia de saldos); I (14: sucesso com `balanceAfter`, vinculada no extrato, fora dos totais/acerto, contas iguais, valores inválidos, sem saldo, atomicidade, duplo clique, outra família 404, data futura, índice de pernas, undo/ALREADY_UNDONE/VERSION_CONFLICT, isolamento); E2E 8 cenários x 2 (atomicidade é `@integration`); lint, typecheck, test (173), test:int (185), test:e2e (158), build verdes; verificação manual (375 px e desktop): aviso "A conta de origem ficará negativa" + "Confirmar mesmo assim", saldo -R$ 100,00, consolidado inalterado, linhas "Mesma transferência" no extrato.
- **Desvios**: passo "toco duas vezes em" virou `preencho a transferência e toco duas vezes em` (colisão com US-006); contexto de transferência acrescentado aos cenários 2 e 3; `Promise.all` sobre `tx` evitado no módulo split (aviso do pg sobre consultas concorrentes; permanece em `getFamily` do Inc 1, ponto de atenção).

## ✅ [TASK-012] US-011 — Registrar o acerto de contas como transferência
- **História PO**: [US-011](../../product-owner/backlog/stories/US-011-registrar-acerto-de-contas.md) · **SDD-002** §3, §5.4, §6.2, §8.
- **Arquivos**: `src/modules/split/service.ts` (`registerSettlement`: lock advisory por família+período, recálculo, `createTransferGroup`), `src/app/api/v1/settlements/route.ts`, `src/app/(app)/acerto/{settle-drawer,acerto-screen}.tsx`, `tests/integration/us-011-registrar-acerto.int.test.ts`, `tests/e2e/features/US-011-*.feature` + steps.
- **QA**: I (15): quitar, parcial (S9), acima do devido (mensagem exata + `dueInCents`), totais/saldo consolidado inalterados, histórico, nova despesa (S11), duplo clique (mesma chave = 1; chaves diferentes = o 2º falha), corrida com valor integral (1x201/1x422), contas iguais, permissões (envolvido/ADMIN/estranho 403), par não devido, undo, inversão S12, atomicidade, referências/data/período; E2E 8 cenários x 2; lint, typecheck, test (173), test:int (200), test:e2e (174), build verdes; manual 375 px: drawer com valor sugerido e contas padrão, confirmação "Itaú Lucas → Nubank Mariana, R$ 500,00", painel "Lucas deve R$ 460,00", cartão "Saldo restante" e histórico "Lucas transferiu R$ 500,00 para Mariana em 04/10".
- **Desvios**: fluxo em dois passos (Continuar -> Confirmar acerto) para atender à confirmação do SDD; cada sugestão adicional tem botão "Registrar"; passos renomeados por colisão (`preencho o acerto e toco duas vezes em`, `escolho a mesma conta nos dois campos do acerto`); mensagem de data futura do acerto "A data do acerto não pode ser futura" (SDD não define). "Desfazer acerto" fica na US-013b.

## ✅ [TASK-013] US-012 — Home: visão essencial da família
- **História PO**: [US-012](../../product-owner/backlog/stories/US-012-home-dashboard.md) · **SDD-005** §2, §3.2, §4.2, §6.
- **Arquivos**: `src/modules/home/{schemas,repo,service,hooks}.ts`, `src/app/api/v1/home/route.ts` (`RepeatableRead`), `src/modules/split/hero.ts` (frase-herói compartilhada), `src/app/(app)/{page,home-screen}.tsx`, testes `tests/unit/lib/apportion-percent.test.ts`, `tests/integration/us-012-home.int.test.ts`, `tests/e2e/features/US-012-*.feature` + steps.
- **QA**: I (9): dados, resumo sem transferência/acerto, 75/25 (inclui pessoais; total 0 => 0), checklist, últimos 5 (sem OPENING/excluídos, com transferências), spy de `isolationLevel: RepeatableRead`, `period`, isolamento, 401; E2E 8 cenários x 2 (CLS medido <= 0,01 com resposta atrasada; 375 e 1280 px sem rolagem horizontal); lint, typecheck, test (175), test:int (209), test:e2e (190), build verdes; manual 375 px e desktop (dados do casal: saldo R$ 1.600,00, card "Lucas deve R$ 460,00 para Mariana", resumo 75%/25%, últimos lançamentos com "Mesma transferência", `scrollWidth == 375`).
- **Desvios**: o passo genérico `vejo {string}` (US-004) e `vejo {string} e {string}` (US-007) passaram a aceitar texto composto no `main`; "Erro parcial por bloco" do SDD é coberto por um único cartão de erro (a API é única).

## ✅ [TASK-014] US-009b — Acerto com três membros e detalhe das despesas
- **História PO**: [US-009b](../../product-owner/backlog/stories/US-009b-acerto-tres-membros-e-detalhe.md) · **SDD-002** §6.1.
- **Arquivos**: `src/app/(app)/acerto/acerto-screen.tsx` (`SharedExpensesList`: `<details>` que só consulta `GET /settlement/expenses` ao abrir), `tests/e2e/features/US-009b-*.feature` + steps. Motor (N>2) e API já cobertos por S4 e pelos testes de integração da US-009a.
- **QA**: E2E 2 cenários x 2 (três membros com cotas iguais e duas sugestões; lista cuja soma = total comum); lint, typecheck, test (175), test:int (209), test:e2e (194), build verdes; manual 375 px: lista com 6 despesas, "Total: R$ 6.400,00" igual ao total comum, `scrollWidth == 375`.
- **Desvios**: cenário "Ver as despesas…" ganhou `Dado despesas comuns de … por Mariana e … por Lucas`.

## ✅ [TASK-015] US-013a — Corrigir ou excluir um lançamento com trilha de auditoria
- **História PO**: [US-013a](../../product-owner/backlog/stories/US-013-corrigir-ou-estornar-lancamento.md) · **SDD-001** §3, §4.2, §4.3, §5.2, §7.
- **Arquivos**: `src/modules/transacoes/{mutations,schemas,repo,hooks}.ts` (`updateTransaction`, `deleteTransaction`, `restoreTransaction`, `listHistory`), `src/app/api/v1/transactions/[id]/{route,delete,restore,history}`, `src/app/(app)/extrato/{transaction-detail-drawer,edit-transaction-form,history-list}.tsx`, `tests/integration/us-013-corrigir-lancamento.int.test.ts`, `tests/e2e/features/US-013-*.feature` + steps.
- **QA**: I (14): valor corrigido (saldo, version, `editedBy`, revisão), histórico com rótulos e append-only, excluir/ALREADY_DELETED, restaurar/NOT_RESTORABLE, conflito `Promise.all` (200+409, mensagem com o nome), versão velha, acerto recalculado (excluir e restaurar), validações (valor 0, tipo da categoria, data futura), sem alteração, mover conta/receita sem `isSharedExpense`/excluído, atomicidade, `NOT_EDITABLE` (pernas e abertura), isolamento, `.strict()`/idempotência; E2E 7 cenários x 2; lint, typecheck, test (175), test:int (223), test:e2e (208), build verdes; manual 375 px: menu Editar/Excluir/Histórico, edição R$ 400,00 -> R$ 350,00, "Editado por Lucas", histórico "Valor: R$ 400,00 -> R$ 350,00" e "Criado por Mariana".
- **Observação**: o diálogo "Mês já acertado" (409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`) e a regra no servidor já existem aqui e foram vistos funcionando no manual; seus testes dedicados fazem parte da US-013b.
- **Desvios**: passos renomeados por colisão (`restauro o lançamento clicando em`, `Lucas vê o conflito`); contexto acrescentado ao cenário "Trilha de auditoria" ("corrigida por Mariana para …"); formulário de edição usa selects (conta/categoria/quem pagou) em vez da grade do drawer de criação.

## ✅ [TASK-016] US-013b — Desfazer transferência/acerto e aviso de mês já acertado
- **História PO**: [US-013b](../../product-owner/backlog/stories/US-013b-desfazer-e-mes-acertado.md) · **SDD-001** §3, §4.2, §5.2 · **SDD-004** §4.4.
- **Arquivos**: `src/components/undo-transfer-dialog.tsx`, `src/modules/contas/hooks.ts` (`useUndoTransfer`), `src/app/(app)/extrato/transaction-detail-drawer.tsx` (Desfazer transferência/acerto; sem "Editar" em pernas), `src/app/(app)/acerto/acerto-screen.tsx` ("Desfazer acerto" no histórico), `tests/integration/us-013b-mes-acertado.int.test.ts`, `tests/e2e/features/US-013b-*.feature` + steps.
- **QA**: I (6): 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` (mensagem + `periods`) e 200 com a flag, só descrição/pessoal sem flag, delete/restore, mover de mês (período antes e depois), undo remove a exigência, perna de acerto `NOT_EDITABLE`; E2E 3 cenários x 2; lint, typecheck, test (175), test:int (229), test:e2e (214), build verdes; manual 375 px: confirmação de mês acertado ao salvar edição, "Desfazer acerto?" no painel (R$ 490,00 -> R$ 990,00, histórico vazio).
- **Desvios**: cenário "Transferência não é editável" ganhou `Dado uma transferência entre contas`.

---

## 📌 Estado do Incremento 2
US-008, US-009a, US-010, US-011, US-012, US-009b, US-013a e US-013b **concluídas e commitadas**, com todos os portões verdes. (Superado: R1 homologada com ressalvas, ver `backlog.md`.)


---

# R2 (Incremento 3): ordem de execução do PO
US-014 → US-015 → US-016a → US-017a → US-018 → US-019 → US-017b → US-016b (SDD-008 §9 / SDD-009 §8).
**Nota de ferramenta:** `tsc --noEmit` incremental (TypeScript 7) deixava passar erros com `tsconfig.tsbuildinfo` desatualizado; `pnpm typecheck` agora roda com `--incremental false`.

## ✅ [TASK-017] US-014 — Gerenciar categorias
- **História PO**: [US-014](../../product-owner/backlog/stories/US-014-gerenciar-categorias.md) · **SDD-007** · migração `us014_categorias`.
- **Arquivos**: `prisma/migrations/*_us014_categorias`, `src/modules/categorias/{schemas,repo,service,hooks}.ts`, `src/app/api/v1/categories/{route,[id]/route,[id]/archive,[id]/unarchive}`, `src/app/(app)/categorias/*`, `src/components/category-icon.tsx` (26 ícones), atalhos em `app-shell.tsx` (menu do usuário) e `transaction-drawer.tsx`; extrato (filtro/detalhe/edição) rotula "(arquivada)"; `mutations.ts` valida categoria ativa só quando a categoria muda.
- **QA**: U (schemas, 26 ícones mapeados); I (25: criar/ordem, nome duplicado/corrida/arquivada, curto/longo, renomear preserva histórico e totais, arquivar em uso, repetir archive/unarchive, última do tipo (mensagens) e corrida, limite 40 (arquivadas contam), conflito `Promise.all` + sequencial com nome do autor, MEMBER gerencia, isolamento, idempotência, `.strict()`, atomicidade, índice funcional no banco, filtro com arquivada); E2E 16 cenários x 2 viewports (passos comuns: "que não há conexão" agora cobre qualquer POST/PATCH e "o formulário preserva…" virou passo comum via `world.data.formCheck`).
- **Desvios**: "Mudar ícone" e "Renomear" abrem o mesmo drawer (campo de nome ou galeria conforme a ação); ordem de checagem em archive/unarchive: estado (`ALREADY_ARCHIVED`/`NOT_ARCHIVED`) antes de `VERSION_CONFLICT` (SDD não fixa a ordem; escolhida para que repetir a operação com a versão antiga seja idempotente em semântica).

## ✅ [TASK-018] US-015 — Cadastrar cartão de crédito
- **História PO**: [US-015](../../product-owner/backlog/stories/US-015-cadastrar-cartao-de-credito.md) · **SDD-008** §2, §3.1, §4.1, §4.8 · migração `us015_cartoes`.
- **Arquivos**: `src/modules/cartoes/{cycle,schemas,repo,queries,service,hooks}.ts`, `src/app/api/v1/cards/{route,[id]/route}.ts`, `src/app/(app)/cartoes/{page,cartoes-screen,card-drawer}.tsx`, item "Cartões" no `app-shell.tsx`, `scripts/check-imports.ts` (`cycle` entra nas regras puras).
- **QA**: U (`cycle.ts` com todos os vetores do SDD §4.1 + propriedade de 1.500+ combinações; schemas com as 4 mensagens); I (15: sucesso, titular padrão/inválido, saldo da família intacto, validações, duplicado/corrida, visibilidade, isolamento, edição, ciclo editável, conflito `Promise.all` + mensagem "alterado por Mariana", idempotência, `.strict()`, atomicidade, CHECKs no banco, `migrations.int.test`); E2E 16 cenários x 2 (incluindo "dias travados após a primeira compra", ativado após a US-016a).
- **Desvios**: campos de dia como `<input type="number">` (e não seletor 1–28) para permitir o cenário "dia 31"; frase ao vivo "do mês seguinte/do mesmo mês" (texto do PO).

## ✅ [TASK-019] US-016a — Compra à vista no cartão
- **História PO**: [US-016a](../../product-owner/backlog/stories/US-016-compra-a-vista-no-cartao.md) · **SDD-008** §3.2, §4.3, §4.4, §5, §6, §10 · migrações `us016_enum_invoice_payment` e `us016_compra_cartao` (a única que reescreve uma constraint da R1; regressão R1 rodada logo em seguida: int 100%, E2E desktop 156/157 + 1 *flake* de deadlock no TRUNCATE, corrigido com retry em `resetDb`).
- **Arquivos**: `prisma/schema.prisma` (`CardInvoice`, `Transaction.accountId?/cardId/invoiceId`, `INVOICE_PAYMENT`), `src/modules/cartoes/{invoices,queries}.ts`, `src/modules/transacoes/{schemas,service,repo,extrato,mutations,optimistic,hooks}.ts` (`createExpenseCore`, `loadTransactionDTOs`), `src/modules/contas/ledger-queries.ts` (`accountBalances` ignora `accountId` nulo), `src/components/transaction-drawer.tsx` ("Pagar com", dica da fatura, aviso de limite, atalho Cadastrar cartão), extrato (linha/detalhe/edição com cartão e fatura), `src/app/api/dev/clock/route.ts` + `src/lib/clock.ts` (relógio de teste, DEV-18), fábricas `makeInvoice/makeCardPurchase/makeInvoicePayment`.
- **QA**: I (26: compra com sucesso/revisão, fatura aberta, 25/10, 26/10, 26/12, retroativa, fuso `2026-10-26T02:30Z`, em nome de outro/pessoal, acerto = acerto por conta (regressão), totais/Home/Σ saldos, `accountBalances` sem chave nula, acima do limite, data futura/virada em SP, defaults, receita com `cardId` = 400, referências, idempotência, extrato, CHECK do banco, atomicidade, 10 compras simultâneas = 1 fatura, corrida PATCH do ciclo x 1ª compra, ciclo travado, relógio de teste); U (schemas com cartão); E2E 19 cenários x 2.
- **Desvios**: ver DEV-18, DEV-19, DEV-21, DEV-22, DEV-24. O Zod só executa o `superRefine` "Escolha uma conta ou um cartão" quando os demais campos são válidos (a UI sempre envia um meio de pagamento).

## ✅ [TASK-020] US-017a — Ver a fatura do cartão
- **História PO**: [US-017a](../../product-owner/backlog/stories/US-017-ver-fatura-do-cartao.md) · **SDD-008** §3.1, §4.2, §6.
- **Arquivos**: `src/modules/cartoes/invoice-service.ts` (`listInvoices`, `getInvoice`, `listPayableInvoices`), `src/app/api/v1/cards/[id]/invoices/{route,[ref]/route}.ts`, `src/app/(app)/cartoes/[id]/{page,invoice-screen}.tsx`, lista de cartões com fatura aberta/"A pagar", `providers.tsx` (retry).
- **QA**: I (12: aberta com ordem das compras, `GET /cards`, situação 25/10 → 26/10 → 06/11, limite com aberta+fechada e paga fora, navegação `previousRef/nextRef` e 404/400, subtotal por membro (0 para quem não comprou), retroativa em fechada, excluída, fatura virtual sem materializar, lista de faturas, `listPayableInvoices`, isolamento, `cardUsage` x soma manual com 30 compras aleatórias); E2E 12 cenários x 2 (o cenário "Fatura fechada aparece em A pagar" da Home vem com a US-018).
- **Desvios**: DEV-20 (data do cenário de navegação), DEV-23 (retry).

## ✅ [TASK-021] US-018 — Despesa prevista pontual
- **História PO**: [US-018](../../product-owner/backlog/stories/US-018-despesa-prevista-pontual.md) · **SDD-009** · migração `us018_previstas`.
- **Arquivos**: `src/modules/previstas/{schemas,rules,repo,service,payables,hooks}.ts`, `src/app/api/v1/{planned-expenses,payables}`, `src/app/(app)/previstas/*`, bloco "A pagar" em `home-screen.tsx` e `HomeDTO.payables` (dentro do `REPEATABLE READ`), item "A pagar" no menu.
- **QA**: U (12: atrasada/borda, ordenação, elegibilidade Home, schemas); I (20: criar, padrões, regressão "previsão não mexe em saldo/extrato/totais/acerto", atrasada e virada de dia em SP, edição/conflito/sem diferença, PAGO travado, exclusão lógica, lista por mês, Home com borda hoje+7 e máx. 5, faturas em /payables e Home, isolamento, idempotência, CHECK, atomicidade); E2E 19 cenários x 2.
- **Desvios**: nenhum de regra; layout da tela segue o FLUXO-005.

## ✅ [TASK-022] US-019 — Dar baixa em despesa prevista
- **História PO**: [US-019](../../product-owner/backlog/stories/US-019-dar-baixa-em-despesa-prevista.md) · **SDD-009** §4.3–§4.5.
- **Arquivos**: `previstas/service.ts` (`payPlannedExpense`, `undoPlannedPayment`), `transacoes/service.ts` (`createExpenseCore` reutilizado, `plannedExpenseId`), `transacoes/mutations.ts` (`LINKED_TO_PLANNED`), `previstas/pay-drawer.tsx`, ações na tela e na Home.
- **QA**: I (21: baixa, valor efetivo/diferença, despesa real no extrato/totais, pagador/autor, acerto pelo valor efetivo e pessoal fora, mês seguinte intacto, validações/virada SP, conta negativa, referências, categoria arquivada, baixa única, idempotência e conflito, isolamento, desfazer, LINKED_TO_PLANNED, correção da despesa atualiza a previsão, 3 atomicidades); E2E 20 cenários x 2 (2 `@integration`: "Baixa única" e "Isolamento", sem rota de UI).
- **Desvios** (DEV-25): três textos de Gherkin ajustados por colisão de passos ("escolhe, para a baixa, uma data…", "que o saldo de X é Y").

## ✅ [TASK-023] US-017b — Pagar a fatura
- **História PO**: [US-017b](../../product-owner/backlog/stories/US-017b-pagar-a-fatura.md) · **SDD-008** §4.5, §4.7.
- **Arquivos**: `cartoes/payment-service.ts`, `app/api/v1/cards/[id]/invoices/[ref]/{pay,undo-payment}`, `app/(app)/cartoes/[id]/pay-invoice-drawer.tsx`, "Desfazer pagamento" na fatura e no detalhe do extrato, atalho "Pagar fatura" (`?pay=1`) na Home, travas `INVOICE_PAID_LOCKED` em `transacoes/mutations.ts`.
- **QA**: I (19: pagar, limite, regressão de totais/Home/acerto/Σ saldos, extrato neutro e filtros, não pagável, validações, conta negativa, duplo clique, já paga, total mudou e corrida compra x pagamento, isolamento, desfazer, compra recusada, travas, restaurar, pagamento não editável, CHECK/índice/trigger, atomicidade); E2E 19 cenários x 2.

## ✅ [TASK-024] US-016b — Corrigir compra no cartão e filtrar por cartão
- **História PO**: [US-016b](../../product-owner/backlog/stories/US-016b-corrigir-compra-no-cartao-e-filtro.md) · **SDD-008** §4.6, §5.
- **Arquivos**: `transacoes/mutations.ts` (`lockPurchaseInvoices`: locks em ordem crescente de `ref`, troca de fatura por data, `PAYMENT_SOURCE_NOT_EDITABLE`), filtro "Cartão"/"Pagamento de fatura" em `extrato/filters*.ts*`, edição com "Pagar com" desabilitado.
- **QA**: I (11, incluindo PATCH cruzados sem deadlock); E2E 10 cenários x 2.
- **Desvios** (DEV-25): ordem dos passos do cenário "Corrigir o valor" (detalhe antes do total) e `vejo` em vez de `vê … e …` por colisão de passos.

## ✅ [TASK-025] Ambiente dev multi-origem (localhost, IP da LAN, túnel)
- **Origem**: pedido do usuário via Gestor · EXT-01/EXT-10/EXT-11.
- **Arquivos**: `src/lib/dev-origins.ts` (novo), `next.config.ts`, `package.json` (`next dev -H 0.0.0.0`), `src/lib/auth/dev-login-guard.ts`, `src/lib/api/with-api.ts` (CSRF), `src/lib/env.ts` (`publicBaseUrl`), `invitations/{service,route}.ts`, `src/app/layout.tsx` + `components/tunnel-retry.tsx`, `src/lib/http.ts` (fallback de UUID), `.env.example`, `README.md`.
- **QA**: U (`dev-origins`, `auth-pure`, `env`, `http-idempotency-key`); I (CSRF multi-origem, link de convite por origem); validado no navegador embutido em `http://192.168.1.81:3102` (2ª instância): login de teste até a Home. A validação achou o bug do `crypto.randomUUID` em http (DEV-28).
- **Desvios**: DEV-27 a DEV-31.


---

# R2.1 — Lote 1 (D-GES-19/D-GES-14..20)

> **Ponto de retomada (SUPERADO em 2026-10-25)**: R2.1 concluída (TASK-026..043, US-022..039); R3-A também foi entregue. Estado atual: seção "Fila de implementação" no fim deste arquivo.

## ✅ [TASK-026] US-027 — Ocultar valores
- **SDD-010** §1, §4.4. **Arquivos**: `src/lib/prefs.ts`, `src/lib/mask-money.ts`, `src/components/money.tsx` (`Money`, `useFormatMoney`, `useMoneyText`), olho em `app-shell.tsx`, `PrefsProvider` no `(app)/layout`, `ApiClientError` mascara valores de mensagens do servidor, todas as telas migradas, regra `check:imports` (`money-format`, `period-predicate`).
- **QA**: U (prefs 7, Money 7, regras de CI 3); E2E 15 cenários x 2 (`@valores-ocultos`); E2E legados rodam com um shim que simula "preferência = visível" por contexto (`hooks.ts`). Mobile 375 px sem overflow (E2E "Máscara em todo o app").
- **Desvios**: DEV-32, DEV-33.

## ✅ [TASK-027] US-022 — Rótulo honesto da regra
- **SDD-011** §4.1. `split/explain.ts` (puro), `SettlementDTO.splitExplanation`, `GET /split-rule/history`, tela de Acerto (rótulo, ponderado, histórico).
- **QA**: U (X1..X8 + 3 trechos + homologado), I (7), E2E 7 x 2. Números homologados preservados (set 717,00/358,50; out 3.169,90/1.584,95); `computeSettlement` e `rules.ts` intocados.
- **Desvios**: DEV-34.

## ✅ [TASK-028] US-023 — Conta de origem padrão
- **SDD-013** §4.1. `contas/suggest-source.ts` (A1..A10), `AccountDTO.usageCountByMe` (90 dias), hook `useSourceAccount` nos drawers "Pagar fatura" e "Dar baixa" (motivo, "saldo insuficiente", `userPicked`).
- **QA**: U 11, I 4, E2E 11 x 2. Regressão: `defaults` do lançamento inalterado.

## ✅ [TASK-029] US-024 — Descrição visível e opcional + busca
- **SDD-013** §4.2. Campo "Descrição (opcional)" fora de "Mais detalhes"; `DESCRIPTION_MSG` única; `q` em `buildLedgerWhere` (ILIKE escapado); campo "Buscar" no painel de filtros.
- **QA**: U 3, I 11 (inclui `%`/`_` literais e Σ itens = totais), E2E 10 x 2.

## ✅ [TASK-030] US-025 — Resumo do Mês
- **SDD-010** §4.1–§4.3. `ledger-where.ts` (único ponto de período; `periodFilter` para o Prisma), `getMonthSummary`, `listDueItems`, `GET /month-summary`, novo `HomeDTO`, card herói com setas.
- **QA**: I 8 (inclui propriedade de 200 conjuntos com semente fixa: resumo = Extrato; Σ byMember = despesas); ajustados us-012/016a/017b/018; E2E 5 x 2.
- **Desvios**: DEV-35, DEV-36.

## ✅ [TASK-031] US-026 — Card de saldos recolhível
- **SDD-010** §6.2. `BalancesCard` com `usePref("balancesExpanded")`, `aria-expanded`, "Nenhuma conta cadastrada".
- **QA**: E2E 4 x 2 (recolhido por padrão, expandir/recolher, lembrado e por dispositivo, Enter). "Ignora arquivadas" liga com a US-032.

## Lote 2 (US-028..032)

### ✅ [TASK-032] US-028 — Acerto opcional
- **SDD-011** §4.4, §5. Migração `r21_familia_configuracoes` (colunas de `families`, `family_events` append-only, default `false` em `planned_expenses`), `updateFamilySettings` (lock `FOR UPDATE`, `VERSION_CONFLICT` com nome, `SETTLEMENT_PENDING` com todos os meses), `pendingSettlementMonths`, guarda `409 SETTLEMENT_DISABLED` em todas as rotas de acerto/regra, `422` ao gravar despesa dividida desligado, `split.available` em `defaults`, menu sem "Acerto", onboarding com a pergunta, `copy.ts` (sem "deve").
- **QA**: U (copy 4), I (11: ligar/desligar, 409/422, checksum de imutabilidade, homologado, Membro 403, conflito, duplo clique, append-only, isolamento), E2E 10 x 2.

### ✅ [TASK-033] US-029 — Indicador de acerto
- `split/indicator.ts` (fonte única `loadSettlement`; `previous` em janela de 12 meses), `HomeDTO.settlementIndicator` substitui o card; linhas no Resumo. **QA**: I (6, inclui reconciliação por semente fixa), E2E 7 x 2.

### ✅ [TASK-034] US-030 — Só meu por padrão
- Defaults Zod `false` (despesa e previsão), `defaults.split.ruleShares`, rótulo dinâmico do interruptor, `SettlementDTO.personal` e linha com link `shared=false`. Testes R1/R2 ajustados (isSharedExpense explícito nas fábricas de API). **QA**: I (5), E2E 8 x 2.

### ✅ [TASK-035] US-031 — Prévia da regra
- `split/preview.ts` (P1/P2, R1..R3), `POST /split-rule/preview` (ADMIN, sem gravar), prévia com debounce, "Sugerir pela renda" (renda nunca sai do navegador), "Salvar regra" desabilitado se soma ≠ 100%, volta ao painel, `HIDE_FAB_ROUTES`. **QA**: U 6, I 3, E2E 5 x 2.
- **Achado**: `rule.current.shares` vinha na ordem das linhas do banco; agora segue a ordem canônica dos membros (DEV-38).

### ✅ [TASK-036] US-032 — Arquivar/excluir conta
- `contas/lock.ts` (`lockAccountsForPosting` `FOR SHARE` ordenado, `assertAccountsEditable`), `contas/archive.ts` (`FOR UPDATE`), rotas archive/unarchive/delete, `GET /accounts?archived=`, `neverUsed`, índices de nome parciais, marcador "(arquivada)" no Extrato, seção "Contas arquivadas", "Transferir o saldo" pré-preenchido. **QA**: I 11 (inclui corrida arquivar x postar nas duas ordens), E2E 9 x 2.
- **Desvios**: DEV-38, DEV-39.

## Lote 3 (US-033..036)
- **US-033**: `cartoes/archive.ts`, `cardsWithTransactions`, `getOrCreateInvoice` recusa cartão arquivado após o `FOR SHARE`; UI "Cartões arquivados". QA: I 5 (inclui corrida), E2E 6 x 2.
- **US-034**: `familia/manage.ts` (`updateFamily`, `changeRole` sob advisory lock + conferência do ator dentro do lock), `GET /family` com `events` e `exMembers`. QA: I 7 (corrida de rebaixamento), E2E 5 x 2.
- **US-035**: migração `r21_ex_membro` (índices parciais; `User.members`), `findActiveMembership`, `MemberRef.removed`, `computeSettlement` com `removedOn` (S14..S16), `removal.ts` (revisão + remoção atômica), `/members/:id/{removal-review,remove}`, `/family/{leave,leave-review}`, `/api/auth/membership-ended`. QA: U 4, I 17 (inclui corrida remover x rebaixar, atomicidade, reconvite, estrutural), E2E 7 x 2. **Bug achado e corrigido pela corrida**: `changeRole` contava Administradores removidos.
- **US-036**: `TransactionDetailDrawer` com botões Editar/Excluir/Histórico, painel lateral >= 1024 px, toast de 8 s, "Despesa excluída"; Home abre por `?tx=`; Extrato lê `highlight`. QA: E2E 7 x 2; passos legados migrados do menu "…" para botões.


---

# R3-A — Parcelamento + percentual por lançamento (D-GES-23/25)

> **Ponto de retomada (SUPERADO em 2026-10-25; ver "Fila de implementação" no fim)**: R3-A implementada (TASK-044..047). **Pausa** até a janela de reversão (≥ 7 dias desde a migração em produção, `--verify` limpo e um fechamento de mês conferido). Bloqueados pela janela: US-042, US-043, US-044 (migração de contrato). Independentes do rateio: US-041, tags (045/047/046), Análise (048/049), cor (050), receitas previstas (051). Decisão pendente do usuário sobre antecipá-los (não antecipados até 2026-10-25: tags, Análise, cor e receitas previstas seguem sem código).

**Baseline verificada em 2026-10-05 (máquina nova, Node 22.23, pnpm 11.1.2, Postgres 17):**
- `typecheck`, `lint` e `check:imports`: verdes.
- Unitários: 388 de 388. Integração: 586 de 586 (inclui o harness de 200+ famílias e a propriedade da EN-002).
- `pnpm migrate:split --dry-run` no banco de dev: 1 família, 11 despesas, gate ok, nada gravado.
- E2E completo (desktop + mobile): **790 de 794**. As 4 falhas são timeouts de 30 s, todas em filtros do Extrato no desktop (US-007 "Filtrar por membro" e "Estado vazio com filtro", US-016b "Filtrar o extrato por cartão", US-039 "Limpar filtros"). Reexecutadas isoladamente, as duas da US-007 passam; a causa provável é o servidor de dev compilando devagar em disco NTFS (aviso "Slow filesystem" do Next), não regressão. Recomenda-se repetir a suíte em disco local (ext4) antes da homologação.
- **Desvio DEV-47**: `scripts/migrate-split.ts` não carregava `.env.local`/`.env` (ZodError em `DATABASE_URL` fora do Next). Corrigido (`fc89478`).
- `INSTALLMENT_SPLIT_RELEASED` continua `false` (a parcela dividida é da US-042, após a janela).

---

# v0 alpha — lotes de implementação (SDD-018, SDD-019, ADR-025, ADR-026)

> Ordem do PO ([release-v0-alpha.md](../../product-owner/backlog/release-v0-alpha.md)); **uma migração por lote**; cada lote ≤ 1 sessão. Regressão obrigatória em todo lote: S1..S16 e valores homologados (3.169,90 / 1.584,95 / 1.149,95). Modelo sugerido: Sonnet; L3 com revisão Opus.

| TASK | Lote | Escopo | Pts | Migração | Depende de |
| :-- | :-: | :-- | :-: | :-- | :-- |
| ✅ TASK-048 | L1 | US-056 camada de diálogos (`dialog-layer.tsx`, z por profundidade) + tokens de contraste (unidade; axe E2E pendente) (SDD-019 §1) — concluído, aguardando validação do Gestor | 3 | — | — |
| ✅ TASK-049 | L2 | US-052 aviso do parcelado (SDD-018 §1) + US-057 conta reserva (SDD-019 §2) — concluído (unidade + integração; E2E BDD pendente), aguardando validação do Gestor | 5 | `v0_conta_reserva` | — |
| ✅ TASK-050 | L3 | US-058/059 backend: schema, `recurrence.ts`, `ensureRecurrenceHorizon`, rotas, testes G/E/F/B/C (SDD-019 §3) — concluído (unidade + integração G1–G6, E1–E7, F1–F2, B1, C1–C2); aguardando validação do Gestor. Decisões: `paymentAccountId` obrigatório na série e no formulário (UI), opcional na API da prevista avulsa (legado sem conta continua válido); geração via hook `prepare` do `withApi` (transação própria, antes do REPEATABLE READ) | 6 | `v0_recorrencia_e_conta_prevista` | TASK-049 |
| ✅ TASK-051 | L4 | US-058/059 UI: "Repetir todo mês", gerenciar série, "Pagar com", baixa pré-preenchida — concluído e verificado no navegador (criar série, selo, editar esta e as próximas com impacto, encerrar; escuro e 375 px); **E2E/BDD pendentes para o smoke final** (cenários das US-058/059 e eventual ajuste dos steps existentes, pois "Pagar com" agora é obrigatório no formulário); aguardando validação do Gestor | 4 | — | TASK-050 |
| ✅ TASK-052 | L5 | US-055 fonte única do A pagar (SDD-018 §2: `collectOpenPayables` + `slicePeriod`/`sliceWindow`; `/payables` reusa `listDueItems`, ganha `groups` e `invoiceStatus`; tela com grupos Faturas/Previstas e selo Aberta/Fechada) + US-062 filtros do Extrato (painel fechado por padrão em todas as larguras via drawer "Filtros", contador "Filtros (N)", "N filtros ativos" e "Limpar filtros" mantendo o mês) — unidade + integração (propriedade A pagar = Resumo); E2E/BDD pendentes para o smoke final (US-018/019/025 que assumiam só fatura fechada; steps do Extrato desktop agora usam o drawer); aguardando validação do Gestor | 4 | — | — |
| ✅ TASK-053 | L6 | US-061 Início enxuta (ações rápidas, "Vence nos próximos dias" via `homePayables`/`sliceWindow`, "Extrato recente" com 10, card "Resumo do mês" fechado por padrão no topo com síntese, pref `homeSummaryOpen`) + US-063 Previstas no Resumo (`planned`, `unplannedInCents`, `projectedExpenseInCents`; "Despesas" = projeção, "Resultado" sobre o realizado; D-TL-v0-2 ratificada) — unidade + integração; **E2E/BDD pendentes para o smoke final** (steps da Início/Resumo agora precisam expandir o card "Resumo do mês"; título "Últimos lançamentos" virou "Extrato recente"); aguardando validação do Gestor | 8 | — | TASK-051, TASK-052 |
| ✅ TASK-054 | L7 | US-064 menu lateral (entregue antes) e US-060 resumo por conta (SDD-029): concluído, aceito pelo Gestor (D-GES-65); ver seção TASK-054 abaixo | 5 | — | TASK-048, TASK-051 |
| ⛔ TASK-055 | P | Produção (ADR-026): Dockerfile, trava `APP_DEPLOY_ENV`, health `unsafe_config`, correção do `sessionToken`, `smoke-prod.sh`, backup/restore. **Encerrada, superada pela TASK-064 (EN-007, ADR-031).** O alvo de hospedagem é Vercel + Prisma Postgres; `railway.json` foi removido. Entregue e reaproveitado pela TASK-064: trava, health, smoke, `backup.sh`. Não é mais pendência do Dev; pendências reais em `agents/estado/hospedagem-producao.md` §d. | 5 | — | superada |
| 🟡 TASK-056 | R4-A | US-065 parcelas já pagas na entrada (SDD-020, ADR-027): contador `paidBeforeAppCount` + trigger/CHECK, `buildRemainingInstallments`/`previewInstallments`, schema `paidBeforeApp`, serviço, DTO do plano, drawer (campo, seletor de fatura, prévia) e "Ver compra" — unidade (P1..P8 + propriedade), integração (16) e E2E/BDD (11 x 2); cenário `@depende-us-042` marcado `@skip`; aguardando validação do Gestor | 5 | SDD-020 | TASK-044, TASK-045 | (modelo intermediário: SDD já resolve o domínio crítico; DEV-48..50) |
| ✅ TASK-057 | R4-B | EN-004 infra de LLM (SDD-021, ADR-028): `LlmPort`, `FakeLlmAdapter` (padrão), `AnthropicLlmAdapter` (único que importa o SDK), config/boot, preços em micro-reais, teto R$ 5,00 por família/mês, reserva/acerto atômicos, `runLlm`, logs sem conteúdo, `GET /ai/usage` e bloco "Consumo do mês" — unidade, integração e E2E/BDD; aguardando validação do Gestor | 8 | `en004_llm_consumo` | TASK-056 | (modelo: Sonnet; DEV-51, DEV-52, DEV-57) |
| ✅ TASK-058 | R4-B | EN-005 opt-in de privacidade (SDD-022, ADR-029): consentimento por família e finalidade, texto v1 versionado, registro append-only, `assertConsentEffective` na reserva, rotas enable/disable/settings, tela "IA e privacidade" e payload com allowlist Zod estrita + propriedade (250 famílias) — unidade, integração e E2E/BDD; **análise (US-070+) não implementada**; aguardando validação do Gestor | 5 | `en005_ai_consent` | TASK-057 | (modelo: Sonnet; DEV-53..57) |
| ✅ TASK-059 | R4-C | US-070a análise de gastos (SDD-023 §1-§4, §6): migração `us070_analise_ia`, agregados pelo predicado único, payload/preview com hash, prompt fixo, saída sem números, `reconcileOutput`, fixtures do fake, `POST/GET` análises, limite de 3 por período, telas de pedido e resultado — unidade, integração (26) e E2E/BDD (10 x 2); aguardando validação do Gestor | 5 | `us070_analise_ia` | TASK-058 | (modelo: Sonnet; DEV-58..65) |
| ✅ TASK-060 | R4-C | US-070b recorrentes `SCHEDULED`/`DETECTED` locais e cartões de gasto evitável com mensal e anual — unidade (recurring), integração (5) e E2E/BDD (3 x 2) | 3 | — | TASK-059 | (DEV-58, DEV-63) |
| ✅ TASK-061 | R4-C | US-071 descartar ("Importante para nós"), lista, voltar a sugerir, descartado fora do payload — migração `us071_descartes`, integração (7), E2E/BDD (6 x 2) | 3 | `us071_descartes` | TASK-060 | (DEV-66, DEV-67) |
| ✅ TASK-062 | R4-C | US-073 histórico, "O que foi enviado", apagar uma/todas, expurgo `pnpm ai:purge-analyses` (24 meses) — integração (7), E2E/BDD (5 x 2) | 2 | — | TASK-059 | (DEV-67) |
| ✅ TASK-063 | R4-C | US-072 sugestão de categoria por regra local (sem IA), aceitar/recusar/desfazer, origem no histórico — migração `us072_sugestoes`, unidade (regra 10), integração (10), E2E/BDD (7 x 2) | 3 | `us072_sugestoes` | TASK-059 | (DEV-68, DEV-69) |

## R4-A
### [TASK-056] US-065 — Parcelas já pagas na entrada
- Migração `20261024120000_us065_parcelas_anteriores` (coluna, `CHECK` P < N, trigger de imutabilidade); `buildRemainingInstallments` reusa `splitInstallments`/ciclo (P = 0 idêntico a `buildInstallments`); `CreateExpenseSchema.paidBeforeApp`; `createInstallmentPurchase` trava só as faturas das restantes; `InstallmentPlanDTO.paidBeforeApp/purchaseOnKnown`; sem regra nova de limite.
- UI: "Parcelas já pagas" abaixo de "Parcelas", seletor "Próxima parcela na fatura de" (substitui a Data), prévia "Restam N parcelas…", erro e botão desabilitado se P >= N; "Ver compra" com "Parcelas 1 a P: anteriores ao app (já pagas)".
- **QA**: U 10 (P1..P8, propriedade 1000 casos) + 4 de componente da prévia, I 16 (inclui corrida, atomicidade, trigger/CHECK, isolamento), E2E 11 x 2 + 1 `@skip` (`@depende-us-042`, roda quando `INSTALLMENT_SPLIT_RELEASED = true`).
- **Desvios**: DEV-48, DEV-49, DEV-50.

## R4-B
### [TASK-057] EN-004 — Infra de LLM, teto de custo e consumo
- **Especificação**: [SDD-021](../../tech-lead/sdd/SDD-021-infra-llm-en-004.md), [ADR-028](../../tech-lead/adrs/ADR-028-integracao-llm-cliente-unico-e-teto-de-custo.md) · **História**: [EN-004](../../product-owner/backlog/stories/EN-004-infra-llm-chave-do-app-e-teto-de-custo.md)
- **Status**: Concluído (aguardando validação do Gestor)
- **Arquivos**: `src/modules/ia/{config,pricing,month,port,fake-adapter,anthropic-adapter,provider,budget,repo,errors,run,service,hooks,dto}.ts`; `src/app/api/v1/ai/usage`, `src/app/api/dev/llm-scenario`; `src/app/(app)/familia/ia/*`; migração `20261024173727_en004_llm_consumo`; `scripts/ai-admin.ts` (`pnpm ai:set-cap`, `pnpm ai:purge-usage`); regras `llm-sdk-import` e `ia-in-client` no `check:imports`; dependência `@anthropic-ai/sdk`.
- **Garantias**: provedor `fake` por padrão (dev, unidade, integração, E2E); `vitest.setup` falha com `LLM_PROVIDER=anthropic` e bloqueia `fetch` a `anthropic.com`; boot recusa anthropic em teste/homologação, sem chave, produção com IA ligada e `fake`, modelo sem preço; teto padrão 500 centavos (env `LLM_MONTHLY_CAP_CENTS`, família `aiMonthlyCapCents`); reserva sob `FOR UPDATE`, reserva órfã vence em 10 min e conta como gasta; log sem conteúdo (`redact` + teste de captura); bundle sem `ANTHROPIC`/`sk-ant`.
- **QA**: U (config/boot, preços, mês SP, propriedade real ≤ reserva com 1500 casos, fake, contrato HTTP do adapter, `check:imports`, bundle), I (orçamento, concorrência 10×3, órfã, CHECKs, esquema sem conteúdo, `runLlm` com 8 falhas, prazo, cancelamento, logs, `/ai/usage`, scripts), E2E/BDD "Infra comum de LLM" (2 x 2: desktop e mobile).
- **Pendências externas (não bloqueiam o código)**: conta e chave Anthropic de produção, limite de gasto na console, `LLM_PROVIDER=anthropic` + `AI_FEATURES_ENABLED=true` no Railway (documentar em `architecture/producao.md` no go-live da IA); `pnpm ai:golden` (manual) só existirá com a US-070.

### [TASK-058] EN-005 — Opt-in de privacidade para IA
- **Especificação**: [SDD-022](../../tech-lead/sdd/SDD-022-opt-in-privacidade-en-005.md), [ADR-029](../../tech-lead/adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md) (+ contrato de payload do SDD-023 §2.1) · **História**: [EN-005](../../product-owner/backlog/stories/EN-005-opt-in-de-privacidade-para-ia.md)
- **Status**: Concluído (aguardando validação do Gestor)
- **Arquivos**: `src/modules/ia/{consent,consent-texts,consent-schemas}.ts`; `src/modules/analise-ia/payload.ts`; `src/app/api/v1/ai/{settings,consents/[purpose]/enable,consents/[purpose]/disable}`; `src/app/(app)/familia/ia/{ia-screen,consent-switch,usage-block}.tsx` (link em Família); migração `20261024174642_en005_ai_consent` (tabela append-only + `AI_CONSENT_CHANGED`).
- **QA**: U (snapshot texto×versão com hash, saneamento, allowlist `.strict` e snapshot de chaves, propriedade com 250 famílias com nomes/CPF/cartão/e-mail/URL/instrução maliciosa, enviado == exibido byte a byte), I (OFF por padrão, 403/400/422, quem/quando, idempotência, versão velha 409, bloqueio `AI_DISABLED` sem reserva, desligar não apaga (checksum), corrida desligar × envio, texto v2 ⇒ `NEEDS_RECONSENT`/`CONSENT_TEXT_OUTDATED`, append-only no banco, isolamento, `runLlm` envia o JSON canônico), E2E/BDD (5 cenários x 2; 2 cenários `@integration`); verificado no navegador integrado (375 px, escuro).
- **Fora de escopo (respeitado)**: análise de gastos US-070..073, importação de fatura (D-GES-28), MCP.
- **Desvios**: DEV-51..57 em [pedidos-ao-gestor.md](../../manager/pedidos-ao-gestor.md).

## R4-C
### [TASK-059..063] Análise de gastos evitáveis (US-070a, 070b, 071, 073, 072)
- **Especificação**: [SDD-023](../../tech-lead/sdd/SDD-023-analise-de-gastos-evitaveis.md), [respostas-r4](../../_historico/tech-lead/respostas-r4.md) · FLUXO-017 · D-GES-27..33
- **Status**: Concluído (aguardando validação do Gestor). Ordem entregue: 070a, 070b, 071, 073, 072.
- **Arquivos**: `src/modules/analise-ia/{aggregates,recurring,output,prompt,fake-fixtures,fake-register,build-dto,readable,dismissals,suggestions,rules-category-suggestion,service,schemas,labels,dto,hooks}.ts`; rotas `src/app/api/v1/ai/{spending-analysis/preview,spending-analyses,avoidable-dismissals}` e `src/app/api/v1/category-suggestions`; telas `src/app/(app)/analise/gastos-evitaveis/*`; `runLlm.beforeReserve`, `withApi.timeoutMs`; migrações `us070_analise_ia`, `us071_descartes`, `us072_sugestoes`; `scripts/ai-admin.ts purge-analyses`.
- **Garantias**: só agregados vão à LLM (payload `.strict()` + `assertNoIdentifiers`; descartes e motivo nunca no payload); enviado = exibido byte a byte e `PREVIEW_STALE`; saída da IA sem campos numéricos (texto com número/pessoa vira texto local); análise nunca altera domínio (checksum); US-072 é regra local sem IA; provedor sempre simulado (suíte bloqueia `anthropic.com`); teste de ouro `pnpm ai:golden` **não** implementado (manual, fora do CI, SDD §8.4).
- **QA**: unidade 542 (inclui recurring, output/fixtures, regra de categoria); integração full 729 (1 ajuste do snapshot de colunas de `llm_usage_events` com `analysisId`); E2E das telas novas e regressões EN-004/EN-005/US-013/US-034 verdes (desktop e mobile); verificado no navegador integrado em 375 px e desktop (tema escuro): sem opt-in, pedido, resultado e teto estourado. Desvios DEV-58..70 em [pedidos-ao-gestor.md](../../manager/pedidos-ao-gestor.md).

## R4-D (EN-007 e POC do MCP)
### [TASK-064] EN-007 — Hospedagem de produção: Vercel + Prisma Postgres
- **Especificação**: [ADR-031](../../tech-lead/adrs/ADR-031-producao-vercel-prisma-postgres.md) (§2–§11 e adendo do Dev), [producao.md](../../tech-lead/architecture/producao.md) · **História**: [EN-007](../../product-owner/backlog/stories/EN-007-hospedagem-vercel-prisma-postgres.md) · D-GES-36/37
- **Status**: Concluído (aguardando validação do Gestor). Só o que mora no repositório; o painel da Vercel/Prisma/GitHub é do usuário ([checklist-vercel-producao.md](../../manager/checklist-vercel-producao.md)). Nenhum acesso externo, deploy ou login foi feito.
- **Arquivos**: `src/lib/db-url.ts` (leitura tolerante: `DATABASE_URL`/`POSTGRES_URL`, host direto `db.prisma.io` ⇒ `pooled.`; CLI usa `DIRECT_URL`/`DATABASE_URL_UNPOOLED`/`POSTGRES_URL_NON_POOLING`/…; `prisma+postgres://` ignorada), `src/lib/db.ts` (`pg.Pool` explícito, `max` 3 e `idleTimeoutMillis` 5 s + `attachDatabasePool` só na Vercel; fora dela o padrão do `pg`), `src/lib/env.ts` (`DB_POOL_MAX`, URL resolvida), `prisma.config.ts`, `scripts/vercel-build.mjs` + script `vercel-build` (`migrate deploy` só com `VERCEL_ENV=production`, depois `next build`), `isProdDeploy` por `VERCEL_ENV` (production/preview) em `dev-login-guard.ts` e `ia/config.ts`, `vercel.json` (cron `0 7 * * *`), `src/app/api/cron/purge/route.ts` + `src/modules/cron/{purge,repo}.ts` + `src/modules/ia/purge.ts` (scripts `ai:purge-*` reaproveitam), `.github/workflows/backup.yml` (diário, `DATABASE_DIRECT_URL`) e `scripts/backup.sh`, `scripts/smoke-prod.sh`, `Dockerfile`/`next.config.ts` (comentários), remoção do `railway.json`, `.env.example`, ADR-031 (adendo), `producao.md`, `ambiente-local.md`; dependência `@vercel/functions`.
- **QA**: unidade 32 (matriz `VERCEL_ENV`×`APP_DEPLOY_ENV` das travas, `register()`/health/login de teste/homologação/LLM; resolução das URLs; `vercel-build`; autenticação do cron), integração 3 (cron: 401 sem/errado/ausente, expurgo + idempotência, 3 execuções simultâneas); suítes completas verdes.
- **Não feito (depende do painel; ver checklist)**: `regions` do `vercel.json` (região do banco desconhecida), escopo das variáveis e *previews* (não há configuração de repositório que impeça preview de ver variáveis; no código `VERCEL_ENV=preview` já é tratado como produção), `APP_DEPLOY_ENV`, `CRON_SECRET`, segredos do GitHub, `prisma migrate status`, ensaio de *restore*, medição de *cold start*.
- **Desvios**: DEV-71, DEV-72.

### [TASK-065] Spike do SDK MCP (SDD-024 §10, tarefa 0)
- **Status**: Concluído (resultado abaixo). Sem rede externa: nenhum cliente real foi conectado.
- **Resultado**: `@modelcontextprotocol/server` **2.4.0** (v2, estável) serve **as duas eras** num Route Handler, *stateless*: (a) `isLegacyRequest()` roteia a era 2025 para `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` com uma instância de `McpServer` por requisição: `initialize` 2025-11-25 e 2025-03-26 respondem `application/json`, **sem** `Mcp-Session-Id`, `GET`/`DELETE` ⇒ 405; (b) a era 2026-07-28 vai por `createMcpHandler(factory, { legacy: "reject", responseMode: "json" })` (`server/discover` + `tools/call` com `_meta`); versão desconhecida ⇒ 400 "Unsupported protocol version". `createMcpHandler` sozinho serviria a era antiga em SSE (`text/event-stream`): por isso o desvio acima. Mensagem de exceção lançada numa ferramenta **vaza** para o cliente no SDK (vira `isError` com o texto): o `runTool` captura tudo e devolve `INTERNAL` neutro. A validação de entrada do SDK devolve `isError` "Input validation error". `@modelcontextprotocol/sdk` 1.x **não** foi necessário (sem `mcp-handler`).
- **Não feito**: conectar o Claude Code por túnel (exige serviço externo real); fica para a homologação do Gestor/usuário (SDD-025 §6, itens 1–2) com `pnpm mcp:smoke`.
- **Desvios**: DEV-74.

### [TASK-066] EN-006a — Servidor de autorização OAuth 2.1 próprio (POC com Claude: CIMD, sem DCR)
- **Especificação**: [SDD-024](../../tech-lead/sdd/SDD-024-mcp-base-oauth-escopo-auditoria-en-006.md) §2–§4 e §11, [ADR-030](../../tech-lead/adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md) · **História**: [EN-006](../../product-owner/backlog/stories/EN-006-servidor-mcp-base.md) (006a)
- **Status**: Concluído (aguardando validação do Gestor; `MCP_ENABLED` segue desligado, checklist SDD-024 §9 e `/security-review` pendentes)
- **Arquivos**: migração `20261024212153_en006_mcp_oauth` (clientes, pedidos, conexões `mcp_grants` com `kind`/`clientId` opcional já para o PAT, tokens só em hash, buckets de taxa, auditoria append-only, `families.assistantAccessEnabled`, CHECKs); `src/modules/mcp/{config,tokens,redirect,cimd,metadata,authorize,token-endpoint,grants,audit,rate-limit,http,repo}.ts`; rotas `src/app/.well-known/{oauth-protected-resource[/api/mcp],oauth-authorization-server}`, `src/app/oauth/{authorize (endpoint),consent (página + formulário)}`, `src/app/api/oauth/{authorize/decision,token,revoke}`; `src/proxy.ts` (matcher exclui `.well-known/` e `oauth/authorize`), `next.config.ts` (CSP `frame-ancestors 'none'` na tela de consentimento), `src/lib/env.ts` (`MCP_ENABLED`, `MCP_CIMD_ALLOWED_HOSTS`, boot recusa produção + `MCP_ENABLED` + `APP_URL` http), `src/lib/logger.ts` (redação de credenciais), `removal.ts` (remover/sair revoga as conexões na mesma transação).
- **Garantias**: PKCE S256 obrigatório; `iss` e `state` em todo redirecionamento; cliente/`redirect_uri` inválidos ⇒ página de erro **sem** redirecionar; CIMD só https, host da allowlist, sem redirecionar, 5 KB, 5 s, cache 24 h; código de uso único (replay revoga a conexão), *refresh* rotativo com detecção de reuso, consumo atômico (`UPDATE … WHERE usedAt IS NULL`); audiência `resource` canônico; reconectar o mesmo cliente revoga a anterior; `write` só com pedido + marcação + segunda ciência; limites no Postgres (`authorize` 20/min, `token` 30/min por cliente); nenhum estado em memória.
- **QA**: unidade 42 (vetores R1–R6, CIMD/SSRF com `fetch` injetado, saneamento de nome, PKCE com o vetor do RFC 7636, flag/boot, allowlist de auditoria, redação de logs, matcher do proxy, tela de consentimento, smoke); integração 36 (`tests/integration/en006a-oauth.int.test.ts`: fluxo inteiro com o cliente de teste, escopo, iss/state, PKCE, replay de código e de *refresh*, concorrência, expiração e `expires_in`, revogação, audiência, bloqueio da família, remoção/troca de família, isolamento entre famílias). Verificado no navegador integrado (375 px) contra o servidor de dev: authorize ⇒ consentimento, "Permitir" desabilitado até as duas ciências, redirect `…/callback?code&state&iss`; dados de teste do banco DEV removidos depois.
- **Desvios**: DEV-73, DEV-75, DEV-77, DEV-78.

### [TASK-067] EN-006b — Base MCP: transporte, contexto do membro, escopos, auditoria e limite de taxa
- **Especificação**: SDD-024 §5–§8 e §11 · **História**: EN-006 (006b)
- **Status**: Concluído (aguardando validação do Gestor). **Parada aqui**: US-074 (telas de conexões/revogar/bloquear) em diante não foram feitas; `tools/list` de produção é **vazio** até a US-075.
- **Arquivos**: `src/modules/mcp/{context,run-tool,handler,tools,purge}.ts`, `src/app/api/mcp/route.ts`, `src/modules/cron/purge.ts` (tarefa `mcp:purge` no cron), `scripts/{mcp-admin,mcp-smoke}.ts` (`pnpm mcp:purge`, `pnpm mcp:smoke <url>`); testes `tests/support/{mcp-client,mcp-client-extra,mcp-tools}.ts`.
- **Garantias**: `POST /api/mcp` stateless nas duas eras (ver TASK-065); `Origin` só a canônica; 401 com `WWW-Authenticate` (`resource_metadata`, `scope="read write"`); `resolveMcpContext` é a única porta (token ACCESS ⇒ grant ativo/não vencido ⇒ audiência ⇒ família não bloqueada ⇒ vínculo ativo idêntico), mensagens públicas só distinguem "credencial expirada"; escopo insuficiente ⇒ 403 `insufficient_scope` + resultado `isError` "sem permissão de lançamento" + `_meta["mcp/www_authenticate"]`; `tools/list` só traz o que a conexão pode chamar; ferramentas de leitura rodam em transação `READ ONLY`; saída validada por Zod (allowlist); exceção interna ⇒ `INTERNAL` neutro; auditoria gravada **antes** de devolver (sem valores, nomes nem texto livre; allowlist de chaves); 60 chamadas/min e 1.000/dia por conexão (429 + `Retry-After`); lote JSON-RPC 400, corpo > 64 KB 413; expurgo `mcp:purge` (auditoria > 12 meses por gatilho com `SET LOCAL app.mcp_purge`, tokens, pedidos, clientes DCR, buckets) também na rota `/api/cron/purge`.
- **QA**: integração 20 (`en006b-mcp.int.test.ts`: sem credencial, escopo, duas eras, erros mascarados, auditoria sem conteúdo + propriedade, append-only/expurgo, `lastUsedAt` 1×/min, limite por minuto/dia, 10 concorrentes ⇒ exatamente o limite, revogação) + `en006a` (36) usam o mesmo cliente de teste (OAuth inteiro em processo, sem LLM, sem rede: o único `fetch` é o falso do CIMD); unidade 2 do smoke.
- **Desvios**: DEV-76, DEV-79.

## R4-D (rodada US-074 ➔ 075 ➔ 077 ➔ 076a/b)
### [TASK-068] US-074 — Conectar, ver e revogar o assistente; bloqueio pela família
- **Especificação**: [SDD-025](../../tech-lead/sdd/SDD-025-mcp-conexoes-e-revogacao-us-074.md) (§1–§5 e rev. 2 §8.1/§8.3) · **História**: [US-074](../../product-owner/backlog/stories/US-074-conceder-e-revogar-acesso-do-assistente.md)
- **Status**: Concluído (aguardando validação do Gestor). `MCP_ENABLED` segue desligado por padrão; nenhum cliente real conectado.
- **Arquivos**: migração `20261024230000_us074_assistant_access_event` (`FamilyEventType.ASSISTANT_ACCESS_CHANGED`); `src/modules/mcp/{connections,connections-schemas,hooks}.ts`; rotas `GET /api/v1/assistant/settings`, `POST /api/v1/assistant/connections/:id/revoke`, `PATCH /api/v1/family/assistant-access`; telas `src/app/(app)/configuracoes/assistente/*` (chave da família, lista, diálogo "Conectar um assistente" só com Claude, revogar com confirmação, abas); link em Família; textos do consentimento (`consent-form.tsx`); `playwright.config.ts` (`MCP_ENABLED=true` só no servidor de E2E).
- **Garantias**: nenhuma credencial é exibida (só a URL pública); revogar apaga os tokens e vale na hora (`/api/mcp` 401); outro membro ou outra família ⇒ `404` igual; bloquear revoga todas (`FAMILY_BLOCKED`), grava `FamilyEvent` e o religar não restaura; só ADMIN altera (`403` "Só o Administrador pode alterar"); `409` por versão; sem atualização otimista.
- **QA**: integração 14 (`us074-assistente.int.test.ts`), unidade 1 nova (diálogo) + consentimento ajustado, E2E/BDD 11 cenários x 2 (desktop e mobile; 1 `@integration` coberto em `en006a`).
- **Desvios**: DEV-81.

### [TASK-069] US-075 — As 7 ferramentas de leitura do assistente (MCP)
- **Especificação**: [SDD-026](../../tech-lead/sdd/SDD-026-mcp-ferramentas-de-leitura-us-075.md) · **História**: [US-075](../../product-owner/backlog/stories/US-075-consultar-pelo-assistente-somente-leitura.md)
- **Status**: Concluído (aguardando validação do Gestor). `MCP_ENABLED` segue desligado por padrão.
- **Arquivos**: `src/modules/mcp/tools/{common,cadastros,saldos,resumo,gastos-categoria,cartoes,lancamentos,previstas}.ts`; registro em `src/modules/mcp/tools.ts` (ordem alfabética); `run-tool.ts` ganha `prepare` e `isolationLevel` por ferramenta (mesmos da rota da tela); extração `src/modules/transacoes/category-totals.ts` (`expenseByCategory`, refatoração isolada da Análise); regra `mcp-tools-no-sql` no `check:imports`.
- **Garantias**: cada ferramenta chama o MESMO serviço da tela (`listAccounts`, `listCards`/`getCard`, `listCategories`, `getMonthSummary`, `listTransactions`, `listPayables`); saída por função de tradução + Zod `.strict()` (sem `note`/`version`/`usageCountByMe`/e-mail); `Money = { inCents, text }`; período com `key/label/start/end` e `currency`; `tools/list` só com as 7 (anotações de leitura) e `TEXT_IS_DATA` em todas as descrições; `q` e valores nunca na auditoria; ignora "ocultar valores" (é do navegador); leitura roda em transação `READ ONLY`.
- **QA**: integração 19 (`us075-ferramentas-leitura.int.test.ts`): reconciliação gastos × Resumo × Extrato (inclui propriedade com 40 famílias), saldos × `/accounts`, resumo campo a campo em 3 períodos × `/month-summary`, cartão × `/cards`, previstas × `/payables`, Extrato 45 itens em 3 páginas, validações, injeção em descrição, tamanho, isolamento com a Família Souza nas 7 ferramentas, auditoria sem conteúdo, duas eras; unidade: regra do `check:imports`. Sem E2E (não há tela nova; os cenários BDD são de integração).
- **Desvios**: DEV-82.

### [TASK-070] US-077 — Atividade / auditoria do assistente
- **Especificação**: [SDD-027](../../tech-lead/sdd/SDD-027-mcp-proposta-confirmacao-e-auditoria-us-076-077.md) §5 e §R2.6 (um evento = um item) · **História**: [US-077](../../product-owner/backlog/stories/US-077-auditoria-do-assistente.md)
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos**: `src/modules/mcp/{activity,activity-schemas}.ts`, `GET /api/v1/assistant/activity` (`grantId`, `range` 7d/30d/month ou `from`/`to` até 12 meses, cursor, `limit` ≤ 50), `useAssistantActivity` (`hooks.ts`), aba "Atividade" (`activity-panel.tsx`, `revoke-dialog.tsx` compartilhado com a lista de conexões).
- **Garantias**: só os eventos do membro da sessão (de outro membro/família ⇒ lista vazia, mesmo com o `grantId` dele); nunca o conteúdo devolvido: o item traz ferramenta, período/filtros (nomes resolvidos na leitura) e resultado; lançamento = dado do próprio membro (descrição, valor, "excluído depois", atalho "Ver no Extrato" só se não excluído); `LIMIT_EXCEEDED` ⇒ "Bloqueado pelo seu limite"; `LIMITS_CHANGED` ⇒ "Você alterou o limite…" (estrutura `limitChange`, gravada pela US-076b); revogar a partir da atividade.
- **QA**: integração 9 (`us077-atividade.int.test.ts`), E2E/BDD 10 cenários x 2. Nenhum registro de proposta/confirmação existe no POC.
- **Desvios**: DEV-81.

### [TASK-071] US-076a — Lançar despesa direto pelo assistente (`lancar_despesa`)
- **Especificação**: [SDD-027](../../tech-lead/sdd/SDD-027-mcp-proposta-confirmacao-e-auditoria-us-076-077.md) §R2.1–R2.2, R2.4, R2.5, R2.7 · **História**: [US-076a](../../product-owner/backlog/stories/US-076a-lancar-despesa-direto-pelo-assistente.md) · **Sai junto com a US-076b e depois da US-077**
- **Status**: Concluído (aguardando validação do Gestor). `MCP_ENABLED` segue desligado por padrão.
- **Arquivos**: migração `20261025000000_us076_assistant_direct_write` (`TransactionOrigin`, `transactions.origin/assistantGrantId/assistantIdemKey` + único + `CHECK`s, `members.assistantReviewedAt`, `member_assistant_limits`); `createExpenseCore(…, { assistant })` e `repo.insert` (origem + `createdAt` do relógio do app); `TransactionDTO.viaAssistant`, filtro `origin` (`buildLedgerWhere`/query/UI "Origem": Todas, Pelo app, Via assistente), selo "via assistente" na linha e no detalhe; `src/modules/mcp/{assistant-write,review}.ts`, `tools/lancar-despesa.ts` (escopo `write`, só ids na auditoria), `run-tool.ts` (`LIMIT_EXCEEDED`), `listar_lancamentos` com `origin`; `GET /api/v1/assistant/review`, `POST /api/v1/assistant/reviewed`; cartão de conferência na Home (`assistant-review-card.tsx`, Excluir com Desfazer) e Extrato `origin=ASSISTANT` marca como conferido.
- **Garantias**: uma transação com `pg_advisory_xact_lock` por membro (limites + gravação serializados); ordem fixa: idempotência por chave (mesmo conteúdo ⇒ `duplicate`, outro ⇒ `IDEMPOTENCY_KEY_REUSED`; excluído depois ⇒ não regrava) ⇒ duplicata natural em 10 min (não consome cota) ⇒ data (hoje a 60 dias atrás) ⇒ limites ⇒ o MESMO `createExpenseCore` do app; só despesa à vista "Só meu" do membro (sem rateio); sem ferramentas de excluir/editar; texto da LLM é dado.
- **QA**: integração 32 (`us076-lancar-direto.int.test.ts`: lança direto, leitura não lança, chave (inclusive 5 concorrentes), duplicata natural, data, valor, referências da outra família, fatura paga, texto com instruções, auditoria sem valor, revogação, duas eras, conferência); E2E/BDD 15 cenários x 2 (cliente MCP de teste falando com o `/api/mcp` real do servidor de E2E).
- **Desvios**: DEV-81, DEV-84.

### [TASK-072] US-076b — Limites de lançamento no perfil
- **Especificação**: SDD-027 §R2.3 e SDD-025 §8.1–8.2 · **História**: [US-076b](../../product-owner/backlog/stories/US-076b-limites-de-lancamento-no-perfil.md)
- **Status**: Concluído (aguardando validação do Gestor).
- **Arquivos**: `src/modules/mcp/{limits,limits-schemas}.ts`, `GET/PUT /api/v1/assistant/limits`, aba "Limites de lançamento" (`limits-panel.tsx`, `#limites`), consentimento com os limites vigentes e "Alterar limites" (nova aba).
- **Garantias**: padrão R$ 500,00 / 10 por dia / 5 por hora já vale sem linha; cada campo aceita `null` (sem limite); `riskAcknowledged` obrigatório para sem limite ou acima do padrão (`400 RISK_NOT_ACKNOWLEDGED`); `PUT` com versão (`409`); só os limites do PRÓPRIO membro; cada campo alterado gera `LIMITS_CHANGED` (valores só na auditoria de configuração); diálogo "Remover este limite?" com o aviso de lançamentos indevidos E de que o app não movimenta dinheiro em bancos reais; excluir não devolve a cota (dia no fuso da família, hora em janela de 60 min); bloqueio devolve mensagem clara, nada é gravado e a Atividade mostra "Bloqueado pelo seu limite".
- **QA**: unidade 4 (`limits.test.ts`) + consentimento ajustado, integração (na suíte do TASK-071: limites padrão/valor/dia/hora, virada do dia, concorrência 10×1 cota, API, versão, riscos, isolamento entre membros), E2E/BDD 12 cenários x 2.
- **Desvios**: DEV-81, DEV-85.

### Rodada US-074 ➔ 075 ➔ 077 ➔ 076a/b — verificação final
Ver o relatório de entrega ao Gestor e DEV-81..86 em [pedidos-ao-gestor.md](../../manager/pedidos-ao-gestor.md). Pendente de serviço externo (não feito): MCP Inspector, Claude real/Claude Code, `/security-review`, homologação SDD-025 §6, deploy.

### [TASK-073] DEV-86 — E2E da Início desatualizados pela US-061/US-063
- **Status**: Concluído (aguardando validação do Gestor). **Só testes; nenhum código de produção alterado.**
- **Causa**: o card "Resumo do mês" vem fechado (US-061), a Início lista 10 lançamentos e Despesas inclui Previstas (US-063); os steps esperavam o card aberto.
- **Arquivos**: `tests/e2e/support/hooks.ts` (preferência `homeSummaryOpen` simulada como aberta, exceto `@resumo-fechado`), `tests/e2e/features/US-012-home-dashboard.feature` e `steps/US-012-*.ts` (últimos 10; cenário do padrão fechado), `features/US-025-resumo-do-mes.feature` e `steps/US-025-*.ts` (despesas `R$ 2.458,90`; segundo dispositivo).
- **QA**: Playwright desktop + mobile de US-012/025/026/027/029/036: 94 passando; biome e `tsc --noEmit` limpos. Antes: 32 falhas (16 citadas + US-025/026).
- **Desvios**: DEV-86.

### [TASK-074] Correções de segurança do Grupo A (D-GES-40) — SEC-002/003/005/006/007/012/014/019/020/022/023/024
- **Status**: Concluído (aguardando validação do Gestor e reteste do Agente de Segurança). Um commit por achado, cada um com teste de regressão.
- **Status por achado** (coluna Status do levantamento `_historico/security/relatorios/levantamento-2026-10-24.md`, que não foi editado):
  - SEC-002 **Corrigido**: `next` 16.4.3 (sem breaking changes nas notas 16.4.x), `images.unoptimized`; teste de piso de versão.
  - SEC-003 **Corrigido**: `safeCallbackUrl` por lista de permissão + `new URL`; unit com TAB/LF/CR/espaço/`%09`/`/\`.
  - SEC-005 **Corrigido**: `/token` e `/authorize` limitados por IP+client_id (+ freio por código/refresh); sem balde global por `client_id`. IP vem de `x-real-ip`/`x-forwarded-for` (confiável na Vercel).
  - SEC-006 **Corrigido (CSP em Report-Only)**: X-Frame-Options, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, HSTS em produção. CSP completa só em `Content-Security-Policy-Report-Only` (script de tema inline exige nonce; não validado em navegador real).
  - SEC-007 **Corrigido**: `zod` 4.6.7 e teto de 256 KB no `withApi` (413).
  - SEC-012 **Corrigido**: `describeError` (sem message/stack de 1ª linha) no `withApi` e nos logs do MCP.
  - SEC-014 **Corrigido**: 5 convites/h e 10/dia por família (429 `INVITATION_LIMIT`); `nodemailer` 10.2.1.
  - SEC-019 **Parcial**: zod duplicado do MCP SDK deduplicado; restam avisos sem correção disponível: Prisma CLI (lodash, deepmerge-ts, mysql2, fast-uri), vite via vitest e zod 4.1.11 do `@vercel/cli-config`. `pnpm update` geral foi descartado (sobe biome/playwright sem ganho). `overrides` do pnpm 11 não surtiram efeito.
  - SEC-020 **Corrigido**: 300 req/min por usuário em `/api/v1` via `mcp_rate_buckets` (429 `RATE_LIMITED`). O `/api/dev/login` não foi limitado (fora do escopo; SEC-001/015 risco aceito).
  - SEC-022 **Corrigido**: health público devolve `degraded`; `unsafe_config` só com `Bearer CRON_SECRET`. O checklist-vercel-producao (itens 8.1) menciona `503 unsafe_config`: o Gestor deve ajustar.
  - SEC-023 **Corrigido**: o código OAuth só é consumido depois de validar cliente, redirect e PKCE.
  - SEC-024 **Corrigido**: migração `20261025010000_sec024_split_rule_composite_fk` (pré-checagem, FK NOT VALID + VALIDATE), aplicada com `migrate deploy`.
- **QA**: lint, `tsc`, unit 648, integração 871 passando (1 falha intermitente preexistente em `us-016a` "corrida PATCH do ciclo", que também falha no HEAD sem estas mudanças), `pnpm build` ok, E2E (desktop+mobile) US-001/003/007/039/074/076/077: 164 passando.
- **Desvios**: DEV-87.

### [TASK-075] Correções de segurança do Grupo B, rodada 1 (D-GES-42) — SEC-021, SEC-004, SEC-010, SEC-011, SEC-018a, SEC-013, SEC-009 e U6
- **Especificação**: ADR-032 / SDD-028 (§§1–6) · **Histórias PO**: US-084, US-003 (rev.), US-074, US-075, US-078, US-083 · **Status**: Concluído (aguardando validação do Gestor e reteste do Agente de Segurança). Um commit por item, cada um com teste de regressão que reproduz o achado. **Não feitos (próxima rodada)**: SEC-017a..e e a fase 2 da SEC-018 (apagar `sessions.sessionToken`).
- **SEC-021** (`ownership.ts`): "Só meu" = despesa não dividida; dono = quem pagou (D-PO-92); só o dono edita, exclui, restaura, exclui/restaura compra parcelada, estorna a baixa de prevista e aceita sugestão de categoria (403 `PERSONAL_OWNER_ONLY`); UI somente leitura com aviso; aviso ao registrar "Só meu" em nome de outro; MCP só tem `lancar_despesa` (cria do próprio membro). DEV-88.
- **SEC-004**: sem vínculo automático; `GET /me/invitations`, `POST /me/invitations/{id}/accept|decline`, `/convites`, cartão em `/convite/[token]`, status `DECLINED`, evento `MEMBER_JOINED`, "Recusado" para o Administrador; 2 migrações (enum e colunas). DEV-90.
- **SEC-010**: `MCP_CIMD_ALLOWED_CLIENT_IDS` (URL exata), URL canônica, DNS contra faixas privadas, leitura em stream (5 KB), `application/json`, `redirect_uris` https no host do `client_id` (loopback recusado), revalidação a cada uso e `scripts/sec010-revalidate-mcp-clients.ts`. **A URL do `client_id` do Claude NÃO foi confirmada** (DEV-89).
- **SEC-011**: cookie `__Host-mcp_authz` com nonce (só o hash no banco), `OTHER_BROWSER`, nome/domínio verificados no servidor, "Entendo o risco" para cliente não verificado, aviso fixo e URL de retorno, cartão "Nova conexão" na Home e e-mail (U4). DEV-92.
- **SEC-018a** (inclui a validade da 018b pedida pelo Gestor): `sessions.tokenHash` (backfill em SQL, mesmo cookie continua valendo), adaptador do Auth.js por hash, ociosidade 30 d, prazo absoluto 90 d, `POST /me/sessions/revoke-others` (item "Encerrar as outras sessões" no menu do usuário), troca de papel encerra as sessões do afetado. DEV-91.
- **SEC-013**: `llm_global_budget_months`, ordem família ➜ global, `503 AI_UNAVAILABLE` neutra, alarme 50/80/100 % (log + e-mail `OPS_ALERT_EMAIL`); `LLM_GLOBAL_MONTHLY_CAP_CENTS` e `OPS_ALERT_EMAIL` obrigatórias em produção com IA ligada. DEV-93.
- **SEC-009**: envelope `{ untrusted_text, flagged }` em todo texto de pessoas, aviso de DADOS no bloco lido pela LLM, `instructions` do servidor, `flaggedCount` na auditoria. DEV-94.
- **U6**: `ALLOWED_SIGNUP_EMAILS` (vazia = aberto). DEV-95.
- **Migrações novas** (aplicar na ordem; `migrate deploy` roda no `vercel-build`): `20261025020000_sec004_enum_values`, `20261025020100_sec004_aceite_explicito_convite`, `20261025030000_sec011_consent_binding`, `20261025040000_sec018_session_token_hash`, `20261025040100_sec018_session_idle_cap`, `20261025050000_sec013_llm_global_budget`.
- **QA**: ver DEV-96 (lint, typecheck, unit 689, integração 934, build ok; E2E completo com 19 falhas a triar).

### [TASK-076] Grupo B, rodada 2 (parte 1): E2E alinhados, DEV-91, SEC-018b (fase 2 preparada) e SEC-017a
- **Especificação**: SDD-028 §6 e §7.2 / ADR-032 · **Histórias PO**: US-035, US-078 · **Status**: Concluído (aguardando validação do Gestor e reteste do Agente de Segurança). Um commit por item. **Não feitos**: SEC-017b..e (próxima rodada); fase 2 **não aplicada** (pendente em `prisma/pending`).
- **1. E2E**: `tests/e2e/steps/US-004*`, `US-016a*`, `US-017b*`, `US-018*`, `US-015*`, `US-040a*`, features US-016a/017b/018 e `tests/support/nav.ts` (`reloadIfOpen`). Nenhum código de produção. DEV-100.
- **2. DEV-91**: `sessions.endedAt` (migração `20261026000000_dev91_session_ended_at`), `endUserSessions`, `findSessionUser`/adaptador ignoram sessão encerrada, aviso único por aparelho no `/login`. Testes: `sec018-sessao` (3 novos) e `us-035`. DEV-98.
- **3. SEC-018b fase 2**: SQL em `prisma/pending/…_sec018_drop_plain_session_token` e `scripts/sec018-phase2-check.ts` (somente leitura). DEV-97.
- **4. SEC-017a**: `src/modules/cron/retention.ts` (4 tarefas no cron), `noProviderTokensAdapter`, migração `20261026010000_sec017_strip_google_tokens`; `sec017a-retencao.int.test.ts` (10 testes). DEV-99.
- **QA**: biome e `tsc` limpos; unit 689; integração 944 (+1 skip); `pnpm build` ok; E2E desktop+mobile de US-001/003/004/015/016a/017b/018/034/035/040a/078: 268 passando (servidor aquecido). Suíte E2E completa **não** rodada nesta parte.

### [TASK-077] Grupo B, rodada 2 (parte 2): direitos do titular (LGPD) — SEC-017b, 017c, 017d e 017e
- **Especificação**: SDD-028 §7.3–§7.6 / ADR-032 §6 · **Histórias PO**: US-079, US-080, US-081, US-082 · **Status**: Concluído (aguardando validação do Gestor, reteste do Agente de Segurança e **aprovação do texto da Privacidade pelo usuário**). Um commit por item. Nada de deploy nem de acesso a painéis. Prazos de LGPD e o texto seguem **sem validação jurídica** (U5).
- **SEC-017b** (`GET /api/v1/me/export`, `src/modules/privacidade/export*.ts`, `/perfil`): JSON estrito (`ExportSchema`, `version: 1`), centavos, 3/dia, teto de 50 MB, ex-membro só com o que fez ou pagou. DEV-101.
- **SEC-017c** (`POST /api/v1/me/delete-account`, `delete-account.ts`, `/perfil/excluir-conta`, `/conta-excluida`): sai da família (US-035), revoga conexões MCP e consentimentos de IA, apaga sessões/Google/tokens/idempotência, anonimiza `users` (`deletedAt`), convites encerrados e eventos de reenvio. Migração `20261027010000_sec017c_user_deleted_at`. DEV-102.
- **SEC-017d** (`POST /api/v1/family/delete`, `delete-family.ts`, `/familia/excluir`, "Zona de risco"): apaga as 26 tabelas com `familyId` numa transação com a exceção `app.purge_family` às travas. Migração `20261027020000_sec017_forbid_mutation_purge_bypass`. DEV-103.
- **SEC-017e** (`/privacidade`, `policy.ts`, `PRIVACY_CONTACT_EMAIL`): rascunho do PO com faixa "Rascunho", versão/data, tabela de retenção derivada das constantes do expurgo. DEV-104.
- **Testes novos**: `sec017b-exportar-dados` (9), `sec017c-excluir-conta` (19, inclui varredura de PII em todas as colunas textuais do banco, idempotência e concorrência), `sec017d-excluir-familia` (14, inclui `count = 0` em todas as tabelas com `familyId` pelo `information_schema`, bypass só da própria família, rollback e corrida), `unit/privacidade/politica` (6); E2E US-079 (5), US-080 (10), US-081 (7), US-082 (7).
- **Desvios**: DEV-101 a DEV-105.
- **QA**: biome e `tsc` limpos; unit 695; integração 986 passando + 1 falha (`us-016a` "corrida do ciclo", instável preexistente); `pnpm build` ok; E2E desktop+mobile de US-078/079/080/081/082 e US-034/035: 90 passando (o servidor Next de E2E precisa de `.next-e2e` limpo: com cache sujo a execução trava). Navegador integrado: `/privacidade`, `/perfil`, `/perfil/excluir-conta` e `/familia/excluir` em 375 px escuro e desktop claro com dados do banco de TESTE (limpo depois); achado e corrigido: o "+" cobria o botão de exclusão. **Não verificado**: login Google real, e-mail real, produção.


### [TASK-078] Rodada 3 de segurança (D-GES-45): SEC-025/026, SEC-027, SEC-014, SEC-028, SEC-022 e causa raiz da corrida do ciclo (us-016a)
- **Especificação**: reteste-2026-10-25 (SEC-025..028), D-GES-42/45, SDD-028 · **Histórias PO**: US-084 ("Só meu"), US-003/US-039 (convites), US-016a · **Status**: Concluído (aguardando validação do Gestor). Um commit por item, cada um com teste de regressão que reproduz o achado do reteste. Sem deploy e sem acesso a painéis. SEC-001/008/015/016 inalterados (risco aceito).
- **SEC-025/026** ("Só meu", `src/modules/transacoes/ownership.ts`): só o pagador atual converte uma dividida em "Só meu" (e só em nome próprio); quem não é pagador nem autor não "assume" o pagamento de uma dividida de outro (caminho de 2 PATCH); ninguém cria nem entrega "Só meu" em nome de outro (`403 PERSONAL_ON_BEHALF_FORBIDDEN`, no núcleo de despesa e de parcelado, logo também baixa de prevista e MCP); previstas e séries "Só meu" (editar, excluir, encerrar, dar baixa) só pelo responsável (`PERSONAL_OWNER_ONLY`; responsável que saiu = somente leitura). UI: seletores de pagador/responsável travados em "eu" quando é "Só meu"; previstas alheias "Só meu" sem "Dar baixa" nem menu. DEV-106.
- **SEC-027/014** (`familia/invitations/service.ts`, `email.ts`): contagem + insert do limite sob `pg_advisory_xact_lock` por família; assunto do e-mail sem o nome da família e com o convidante saneado. DEV-107.
- **SEC-028** (`mcp/token-endpoint.ts`): o balde por segredo (antes da validação) foi trocado por um balde só de FALHAS por (IP, client_id, segredo), consultado depois da validação; troca correta nunca é barrada. DEV-108.
- **SEC-022** (`health/check-health.ts`): a visão pública não traz mais `checks`. DEV-109.
- **us-016a (causa raiz)**: BUG REAL de concorrência em produção: a compra lia o cartão sem lock e depois criava a fatura com os dias lidos, de modo que um PATCH do ciclo confirmado no intervalo gerava a 1ª fatura com datas do ciclo antigo. Correção `findCardForPosting` (FOR SHARE antes de ler os dias) em compra à vista e parcelada. Teste determinístico (segura o UPDATE do ciclo não confirmado, espera a compra bloquear, solta). DEV-110.
- **Testes novos/alterados**: `sec025-026-so-meu-regras` (14), `us-003-convites` (+2), `en006a-oauth` (+1, 1 ajustado), `us-016a` (+2 determinísticos), `us-013` (trilha reescrita sem depender do atalho SEC-025), unit `sec021-ownership` (+1), `invitation-email` (+1), `health-publico` (reforçado).

### [TASK-079] Rodada 4 de segurança (D-GES-46): revisão de LGPD — SEC-029 a SEC-034, SEC-036 e SEC-037
- **Especificação**: revisao-lgpd-2026-10-25 (SEC-029..037), SDD-028 §7, D-GES-46 · **Histórias PO**: US-079, US-080, US-081 · **Status**: Concluído (aguardando validação do Gestor). Um commit por item (SEC-029+032 e SEC-030+033 juntos, por compartilharem arquivos). SEC-035 aceito, não alterado. Sem deploy e sem acesso a painéis.
- **SEC-029** (`export.ts`): ex-membro segue o mesmo filtro do ativo: "Só meu" de outra pessoa (valor, descrição e a observação atual) fora do arquivo. **SEC-032**: divisões carregadas em lotes de 5 mil ids (33 mil lançamentos exportam), e 5xx ou 413 devolvem a cota (`refund`). DEV-111.
- **SEC-030** (`session.ts`, `session-adapter.ts`, `dev-login.ts`): usuário com `deletedAt` não autentica (sessão apagada, login de teste 403 `ACCOUNT_DELETED`). **SEC-033**: `MemberRef.deleted` vindo de `users.deletedAt` em todos os DTOs; telas e MCP não decidem mais pelo nome. DEV-112.
- **SEC-034**: `/onboarding?deleted=1` e `?left=1` com texto fixo ("Família excluída"/"Você saiu da família"); o nome da família não vai mais na URL. DEV-113.
- **SEC-031**: exclusão da conta apaga as respostas de idempotência que citam id, membro, e-mail ou nome do titular (de qualquer usuário); exclusão da família apaga as de todos os (ex-)membros e as que citam id, nome ou membros; a resposta de `/family/delete` deixou de levar `familyName`. DEV-114.
- **SEC-036** (migração `20261027030000_sec036_pin_search_path_scope_anonymize`): `search_path = pg_catalog, public` nas 8 funções de trava; `app.anonymize_user` agora carrega o id do titular e só permite trocar `changes.email` pelo e-mail anonimizado dele em `INVITATION_RESENT`. DEV-115.
- **SEC-037**: e-mail de aviso após excluir conta ou família (`deletion-notice.ts`, melhor esforço, depois do commit). Reautenticação não implementada (pergunta P3 ao usuário). DEV-116.
- **Testes novos**: `sec029-032-exportacao` (3, inclui 33 mil lançamentos), `sec030-033-conta-excluida` (3), `sec031-idempotencia-excluidos` (2), `sec036-travas` (3), `sec037-aviso-exclusao` (3); E2E US-081/US-035 ajustados ao texto fixo.

### [TASK-080] Rodada 5 de segurança (D-GES-48): SEC-038, SEC-039 e SEC-040
- **Especificação**: reteste-final-2026-10-25 §3, D-GES-48 · **Status**: Concluído (aguardando validação do Gestor). Um commit por item. SEC-041 aceito, não alterado. Sem deploy e sem acesso a painéis.
- **SEC-038** (`ownership.ts` `violatesPlannedCapture`/`assertPlannedNoCapture`, `previstas/service.ts`, `recurring-service.ts`, `planned-drawer.tsx`): numa prevista ou série DIVIDIDA, só o responsável atual a torna "Só meu"; só ele ou o autor se coloca como responsável. UI: interruptor e botão de responsável ficam desabilitados nesses casos; o DTO da série ganhou `author`. MCP: não existe ferramenta de escrita em previstas (teste de guarda na lista de ferramentas). DEV-117.
- **SEC-039** (`delete-account.ts`, `delete-family.ts`): a limpeza de `idempotency_records` não procura mais o nome em toda a tabela. Identificadores únicos (UUIDs e e-mail completo) valem em qualquer linha; o nome do titular só nas linhas dos co-membros (`userId`); na exclusão da família, só ids e as linhas dos (ex-)membros. Sem migração (a tabela já tem `userId`). DEV-118.
- **SEC-040** (`invitations/service.ts`): balde por `userId` em `mcp_rate_buckets` (5/hora e 10/dia, somando famílias criadas e excluídas); reenvio com e-mail conta, copiar o link não. DEV-119.
- **Testes novos** (os de integração falham no código antigo): `sec038-previstas-captura` (5), `sec039-idempotencia-escopo` (3), `sec040-convites-por-pessoa` (3), unit `planned-capture` (4).
- **Validação**: lint, typecheck, 701 unit, 1031 int (1 skip), E2E US-003/018/019/030/058/059 (124), `pnpm build`.

### [TASK-081] "Só meu" também pelo dono da conta e pelo lançador (D-GES-50, US-084, SDD-028 §11)
- **Especificação**: US-084 revisada (D-PO-94), SDD-028 §11, D-GES-50 · **Status**: Concluído (aguardando validação do Gestor e reteste da Segurança). Sem deploy.
- **Regra** (`ownership.ts`): controlam um "Só meu" o pagador (dono), o dono da conta (ou do cartão) e o lançador (autor); previstas e séries: responsável, autor e dono da conta "Pagar com". `canWriteTransaction`/`canWritePlanned` usam `personalControllerIds`/`plannedControllerIds`; `assertCanWriteTransaction`/`assertCanWritePlanned` completam o dono da conta numa consulta só quando o ator não é dono nem autor. Dono ex-membro continua bloqueando todos. DEV-120.
- **Travas mantidas**: `assertCanMakePersonal`, `violatesPlannedCapture`, `assertPersonalForSelf`. A checagem "em nome de outro" só dispara quando o "Só meu" nasce ou o pagador muda (quem só controla edita valor/descrição sem virar pagador). A baixa por quem controla mantém o pagador (`personalFromPlanned`). DEV-121.
- **Mensagens**: 403 `PERSONAL_OWNER_ONLY` agora lista os nomes ("Só Lucas e Carla podem alterar este lançamento."); recusa de conversão usa "Só quem pagou pode tornar este lançamento "Só meu"." DEV-122.
- **UI**: DTOs ganharam `accountOwnerId` (lançamento), `paymentAccount.ownerId` e `paid.authorId/accountOwnerId` (prevista), `authorId/paymentAccountOwnerId` (a pagar); detalhe do Extrato e Previstas mostram "Só X, Y e Z podem alterar este lançamento (Só meu)"; aviso do formulário diz quem poderá alterar.
- **Testes**: unit `sec021-ownership` ampliado (matriz, mensagens, previstas); integração nova `us084-so-meu-controle` (dono da conta, lançador, cartão/plano, prevista com baixa e estorno, travas, ex-membro); `sec021-so-meu-dono` ajustado (o autor agora altera).

### [TASK-082] Rodada 6 do "Só meu": reteste SEC-042..046 + Administrador sobre ex-membro (D-GES-52/53, US-084, SDD-028 §11)
- **Especificação**: US-084 (D-PO-95), SDD-028 §11 (revisado), D-GES-52, D-GES-53, `reteste-so-meu-2026-10-25` · **Status**: Concluído (aguardando validação do Gestor e novo reteste da Segurança). Sem deploy; uma migração nova (enum de evento).
- **D-GES-52** (`ownership.ts`): `canWriteTransaction`/`canWritePlanned`/`assertCanWriteTransaction`/`plannedWriteDecision` liberam o Administrador atual quando o dono saiu; o Admin age com os limites de quem só controla (DEV-123). O histórico já grava o ator.
- **SEC-042** (`cartoes/service.ts`, migração `sec042_card_owner_event`): só o titular atual ou o Admin troca o titular; evento `CARD_OWNER_CHANGED` no histórico da família (DEV-124).
- **SEC-043/044** (`assertCanMakePersonal`, `assertPlannedControllerLimits`, `previstas/service.ts`, `recurring-service.ts`): quem só controla não muda divisão, pagador/responsável, conta nem "Pagar com" e não assume o pagamento; baixa só com conta do responsável ou do ator; estorno checa a prevista (DEV-125). UI: campos desabilitados no editor do Extrato e no de previstas.
- **SEC-045** (`endSeries`): preserva as ocorrências "Só meu" que o ator não controla (DEV-126).
- **SEC-046** (`familia/removal.ts`, diálogo de remoção): `reassignNotice` (DEV-127).
- **Testes**: unit `sec021-ownership` (Admin/ex-membro, limites de controlador) ajustado e ampliado; integração nova `sec042-046-so-meu-reteste` (provas do relatório como regressão, Admin sobre ex-membro, histórico); `us084-so-meu-controle` ajustado (assumir passou a ser 403; Admin altera ex-membro).

### [TASK-083] Administrador com poderes plenos sobre o "Só meu" de ex-membro (D-GES-55, US-084 / D-PO-96, SDD-028 §11.3 item 12)
- **Status**: Concluído (aguardando validação do Gestor e reteste da Segurança da rodada 6 + D-GES-55). Sem migração nem deploy extra.
- **Backend** (`ownership.ts`): `isAdminOverRemovedOwner` e a regra pura `canChangeStructure`; `assertCanMakePersonal` e `assertPlannedControllerLimits` ganham `{ fullPower }`, que dispensa os limites SEC-043/044 só quando o ator é o Administrador atual e o dono tem `removedAt`. Usado em `updateTransaction`, `updatePlannedExpense`, `updateSeries` e na baixa (`payPlannedExpense`) (DEV-128). Dono da conta, lançador e Admin sobre membro ativo: inalterados.
- **Sem IDOR** (DEV-129): pagador/responsável novo passa por `findMember` (só ativos da família) e conta por `findAccount`/`findActiveAccount` (escopo da família); enquanto "Só meu", o pagador novo só pode ser o próprio Admin (`PERSONAL_ON_BEHALF_FORBIDDEN`).
- **UI** (DEV-130): editor do Extrato e de previstas habilitam divisão, "Quem pagou?"/responsável, conta e "Pagar com" ao Admin sobre ex-membro; o ex-membro aparece como opção atual rotulada "(ex-membro)" (corrige o seletor vazio).
- **Testes**: unit `sec021-ownership` (+4); integração nova `d-ges-55-admin-poderes-plenos` (11 cenários: lançamento, prevista, série, baixa, histórico com o Admin; negativos: Admin/dono da conta/lançador sobre membro ativo, Membro, dono da conta e lançador sobre ex-membro, pagador ex-membro/inexistente/de outra família, conta de outra família); `sec042-046-so-meu-reteste` ajustado (Admin sobre ex-membro deixou de ser 403 em divisão/pagador/conta). Lint, typecheck, 711 unit e 1078 int verdes (1 skip).

### [TASK-084] Rodada 7: SEC-047..050 (D-GES-57, US-084 / D-PO-97, SDD-028 §11.3 item 13)
- **Status**: Concluído (aguardando validação do Gestor e reteste curto da Segurança). Sem migração nem deploy extra.
- **SEC-047** (`cartoes/service.ts`, `card-drawer.tsx`): só o titular atual troca o titular (403 `CARD_OWNER_ONLY`, mensagem "Só o titular do cartão pode trocar o titular."); o Admin só reatribui na remoção/saída de membro (`removal.ts`, que não passa por `updateCard`). Seletor "Titular" desabilitado a quem não é o titular (DEV-131).
- **SEC-048** (`ownership.ts`, `edit-transaction-form.tsx`, `planned-drawer.tsx`): com `fullPower`, ao dividir, pagador/responsável só pode ser omitido ou igual ao ex-membro; outro ⇒ 403 `PERSONAL_OWNER_ONLY`. DEV-129 segue enquanto "Só meu". UI trava o seletor no ex-membro ao dividir (DEV-132).
- **SEC-049** (`ownership.ts` `ownerStanding`, `mutations.ts`, `previstas/service.ts`, `recurring-service.ts`, `analise-ia/suggestions.ts`, DTO `activeId`): dono ativo = mesmo usuário com vínculo ativo na mesma família; o Admin perde o poder pleno, quem voltou age como dono (editar, dividir, excluir, baixa em nome do vínculo ativo). Consultas sempre com `familyId` (IDOR; vínculo em outra família não conta). Exportação já reunia os vínculos do usuário (DEV-133).
- **SEC-050** (`privacidade/export.ts`): `observacao` de dividida/prevista dividida de ex-membro sai `null` no arquivo dos demais; descrição sai (DEV-134).
- **Testes**: integração nova `sec047-050-reteste-rodada6` (SEC-048 4 cenários, SEC-049 6, SEC-050 3, com as provas do relatório e negativos: Admin, Membro, dono da conta, outro usuário, outra família), `sec042-046-so-meu-reteste` (+3: SEC-047 prova, novo titular, remoção reatribui) e `d-ges-55` ajustados; unit `sec021-ownership` (+7: SEC-048 e `ownerStanding`/`effectiveOwner`/`memberRefsWithReturn`). Lint, typecheck, 718 unit e 1094 int verdes (1 skip). UI não verificada no navegador.


### [TASK-085] Rodada 8: pagador de ex-membro imutável (D-GES-59, SEC-051 + resíduo DEV-132, US-084 / D-PO-98, SDD-028 §11.3 item 14)
- **Status**: Concluído (aguardando validação do Gestor e reteste curto da Segurança). Sem migração nem deploy extra.
- **Regra** (`ownership.ts` `violatesGonePayerLock`, `GONE_PAYER_LOCKED_MESSAGE`; `mutations.ts`, `previstas/service.ts`, `recurring-service.ts`): pagador/responsável ex-membro sem retorno (`ownerStanding.ownerRemoved`) não muda para ninguém, nem para o Admin, em "Só meu" e dividida, em qualquer PATCH (lançamento, cartão/parcela, prevista, série): 403 `PERSONAL_OWNER_ONLY`. Substitui a trava SEC-048 só-no-pedido-que-divide. `fullPower` do Admin ficou só para divisão, conta e "Pagar com" (e só no "Só meu"). Quem voltou e membros ativos: como antes.
- **Baixa de prevista de ex-membro** (`payPlannedExpense`, DEV-135): pagador = quem realiza a baixa; outro pagador ⇒ 403 (`GONE_PAYER_BAIXA_MESSAGE`).
- **UI**: `edit-transaction-form.tsx`, `planned-drawer.tsx` (ex-membro fixo e desabilitado para todos), `pay-drawer.tsx` (envia o próprio pagador). **Não verificada no navegador.**
- **Testes**: integração nova `d-ges-59-pagador-ex-membro-imutavel` (12: provas do reteste como 403, dividida criada com ex-membro, cartão, prevista, série, baixa, negativos de Admin, ativos, quem voltou, outra família); `d-ges-55` e `sec047-050` ajustados; unit `sec021-ownership` (`violatesGonePayerLock`, `payerGone`). Lint, typecheck, 718 unit e 1106 int verdes (1 skip).

### [TASK-086] US-045 — Tags livres no lançamento (SDD-016 §1-§6, §8; ADR-022)
- **Status**: Concluído (aguardando validação do Gestor). **Migrações** `20261029010000_us045_enum_family_event_tags` (isolada; `TAG_RENAMED/MERGED/DELETED`) e `20261029010100_us045_tags` (`tags`, `transaction_tags`, FKs compostas `RESTRICT`, CHECKs de tamanho e gatilho `transaction_tags_kind` com `search_path` fixo). Aplicadas em dev (`pnpm db:deploy`) e no banco de teste; a produção recebe no próximo `migrate deploy`.
- **Código**: `tags/{normalize,schemas,service,hooks}.ts` (`normalize.ts` entra em `PURE`); `transacoes/{service,installment-create,mutations,schemas,repo,optimistic,hooks}.ts`; `api/v1/tags`; `lib/api/with-api.ts` (parâmetro repetido da query vira array); `privacidade/{export,export-schema,delete-family}.ts`; UI `components/{tag-input,transaction-drawer}.tsx`, `extrato/{edit-transaction-form,edit-tags-form,ledger-row,transaction-detail-drawer}.tsx`; fábricas `makeTag/attachTags`, `seedEverything` com tag.
- **Regras**: ver `estado/lancamentos-contas-extrato.md` regras 24, 25 e 27.
- **Testes**: unit `tags/normalize` (14: T1..T9, propriedades, schemas); int `us-045-tags` (26: criação/sugestão/caixa/acento, 4/20/21 tags, validações, transferência e gatilho, corrida de 10 POSTs = 1 tag, `Idempotency-Key`, edição (revisão `tags`, mesmo conjunto, `[]`), conflito de versão desfaz as tags, excluído 422, "Só meu" 403, mês acertado + acerto idêntico, fatura paga, conta arquivada, parcelada (10 parcelas, `PATCH` em uma = 10 com revisão e `version` por parcela), isolamento entre famílias, exportação); E2E `US-045` (15 cenários x 2 projetos; 3 cenários marcados `@integration`: tag não muda o acerto, mês acertado e fatura paga).
- **Rodada final** (2026-10-27): lint, typecheck, 732 unit (14 novos), 1144 int verdes (1 skip; +38), E2E US-045/047/005/006/024: 104 verdes (desktop + Pixel 7). Em rodadas longas o dev server E2E às vezes degrada (páginas recarregando em laço, todos os testes falham por timeout); reexecutar com servidor novo resolveu, sem relação com o código.
- **Não verificada no navegador de verdade**: só pelo Playwright (desktop e Pixel 7); sem teste manual de leitor de tela, teclado em celular real nem do lembrete de foco do `TagInput`.

### [TASK-087] US-047 — Filtrar o Extrato por tag (SDD-016 §4.4, §8)
- **Status**: Concluído (aguardando validação do Gestor). Sem migração (índice `transaction_tags (tagId, transactionId)` e a PK vieram na TASK-086).
- **Código**: `transacoes/{extrato,schemas,service}.ts` (`buildLedgerWhere` com `tagIds`/`untagged` por `EXISTS` e os plurais `categoryIds`, `payerIds`, `sourceIds`; `ListTransactionsQuerySchema` com a recusa `untagged` + `tagIds`); UI `extrato/{filters,filters-panel,tag-filter,extrato-screen}`; `transacoes/hooks.ts` (`ledgerQueryString` repete `tagIds`). O intervalo de 24 meses do Extrato já existia (US-040b).
- **Testes**: int `us-047-filtro-tags` (12: uma tag, duas tags sem duplicar nem somar em dobro, tag + categoria, vazio, excluído, `untagged`, 400 de `untagged` + `tagIds`/id inválido/mais de 20, isolamento por família, cursor, `payerIds`/`sourceIds`, parcelada em 10 meses e total do mês, propriedade de 200 combinações com semente fixa); E2E `US-047` (10 cenários x 2 projetos).

### Desvios e hipóteses (TASK-086/087)
- **DEV-136**: `untagged=true` filtra só `EXPENSE`/`INCOME` sem tag (o SDD §4.4 traz um `NOT EXISTS` puro, que traria transferências, acertos e pagamentos de fatura para o chip "Sem tag").
- **DEV-137**: `withApi` passou a montar `?tagIds=a&tagIds=b` como array (antes `Object.fromEntries` guardava só o último valor). Efeito colateral: parâmetro singular repetido na URL agora dá 400 em vez de usar o último.
- **DEV-138**: `prisma/seed.ts` não semeia família nem lançamentos, então não ganhou as "duas tags de exemplo" do SDD §5; as fábricas `makeTag/attachTags` e `seedEverything` cobrem os testes.
- **DEV-139**: no `PATCH` de tags em compra parcelada, as parcelas JÁ excluídas recebem o novo conjunto (invariante 6) mas sem `version + 1` nem revisão (a atualização versionada só vale para linha ativa). `TagDTO` ficou sem `updatedBy` (nasce com a US-046).
- **DEV-140**: o painel de filtros não oferece "Sem tag" como opção (a US-047 diz que o filtro por ausência só existe como chip vindo da Análise; o SDD §6 sugere a opção): o chip aparece pela URL (`untagged=true`) e é removível.
- **DEV-141**: nome só de hífens/pontos (ex.: `--`) passa pela validação do SDD (letras, números, `-`, `_`, `.`); não há regra de "ao menos uma letra ou número". Hipótese: aceitar; pedir ao TL se quiser fechar.
- **DEV-142**: o SDD §6 cita `invalidateFinancialCaches`, que não existe no código; as chaves `["tags"]` e `["analysis"]` entraram em `useInvalidateAfterTransactionChange` (`transacoes/hooks.ts`).
- **DEV-143**: o formulário de edição manda só `{version, tags}` quando nada financeiro mudou (é o que torna a edição só de tags "não financeira" na prática); o detalhe ganhou o botão "Editar tags", que também serve à parcela (somente leitura para o resto).

### [TASK-054] US-060 — Resumo por conta no A pagar (SDD-029)
- **Status**: Concluído, aceito pelo Gestor (D-GES-65). Sem migração. Hipóteses TL-U4-1..5 ratificadas pelo Gestor.
- **Código**: `previstas/by-account.ts` (puro, R1..R9), `previstas/{payables,schemas}.ts` (`byAccount`, `paymentAccountId`), `contas/service.ts` (`listAccountBalances`), `api/v1/payables/route.ts` (`RepeatableRead`), `mcp/tools/previstas.ts` (`byAccount:false`), `contas/hooks.ts` (invalida `["payables"]`), UI `previstas/by-account-block.tsx` + `previstas-screen.tsx` (filtro por conta, limpo ao trocar de mês).
- **Testes**: unit `by-account` (8, incl. propriedade de 200 casos); int `us-060-resumo-por-conta` (12 + 1 `todo` da fatura/US-089; reconciliação Σ linhas = total = Resumo em 3 períodos x 12 rodadas semeadas); E2E `US-060` (16 cenários x 2 projetos = 32 verdes; `@pendente-us-089` excluído por tag em `playwright.config.ts`). Axe não existe no repo: contraste conferido a olho (ver relatório).
- **Rodada**: lint, typecheck, 740 unit, 1156 int verdes (1 skip, 1 todo).
- **DEV-144**: a lista vazia mantém "Nenhuma conta a pagar neste mês" (o SDD pede "Nada a pagar neste mês"), pois o BDD da US-018 depende do texto atual.
- **DEV-145**: o cenário "Valores ocultos" ganhou um Dado (Corrente com saldo e a pagar) para existir "Falta" a conferir.

### [TASK-088..091] Polimento UR-1 (US-085..088, sem SDD; notas do TL em `tech-lead/architecture/notas-polimento-us-085-088.md`)
- **TASK-088 / US-085** — Concluído, aceito pelo Gestor (D-GES-65). `components/ui/segmented-choice.tsx` (genérico: `options` com ícone/tom/`disabled`/`hint`, `variant` radio|tabs, roving tabindex e setas), aplicado em `transaction-drawer.tsx`, `categorias-screen.tsx` (tabs) e `category-drawer.tsx` (criar, antes sem seletor). Texto "Nova despesa/receita" e "Salvar despesa/receita". Passos E2E atualizados: US-006, US-016a, US-045 (radio em vez de button). Testes: E2E `US-085` (5 cenários x 2 projetos, inclui contraste AA calculado no navegador no tema escuro e teclado); regressão E2E US-005/006/012/014/016a/045 (verdes). Verificado no navegador (tema claro mobile 375 e escuro desktop).
- **TASK-089 / US-087** — Concluído, aceito pelo Gestor (D-GES-65). `extrato/ledger-row.tsx`: contêiner `ledger-card` no `<li>` (borda/realce/hover do par), grade com colunas fixas (celular `40px 1fr 24px 6.75rem`; ≥ md `88px … 28px 7.5rem`), célula de avatar sempre presente, valor `justify-end nowrap tabular-nums`, descrição `line-clamp-2` (celular) / `line-clamp-1` (≥ md); `data-testid` `ledger-row` e `view-plan` preservados (pai comum no contêiner). Testes: E2E `US-087` (6 cenários x 2 projetos: borda direita do valor e esquerda da data medidas em todas as linhas, ≤ 1 px; tags/selo; parcela 2/10; 375 px; descrição de 120 caracteres); regressão E2E US-007/013/016b/017a/036/040b/047/062/065 (160 verdes). Verificado no navegador (mobile claro e desktop escuro, Extrato). Desvio **DEV-146**: o selo "via assistente" do cenário de selos depende de `origin=ASSISTANT` sem concessão no banco (tentado; ignorado se o banco recusar), por isso o E2E afere tags e "Pessoal".
- **TASK-090 / US-088** — Concluído, aceito pelo Gestor (D-GES-65). "Ver compra" = botão só de ícone (`ListOrdered`, `aria-label` e `title` "Ver compra", ≥ 44 px) no rodapé do `ledger-card`, irmão da linha clicável (sem button em button), só em parcela. **DEV-147**: alinhado à esquerda (no celular o botão flutuante `+` cobria o canto direito e interceptava o toque, achado pelo E2E US-065 mobile). O TL previa rótulo visível a partir de 640 px; seguiu-se o pedido do usuário (apenas ícone). Testes: E2E `US-088` (4 cenários x 2 projetos); regressão US-040b/065/016b/017a (88 verdes na rodada). Verificado por captura do Playwright (412 px, tema claro); o detalhe da transação já tinha o botão no formato pedido.
- **TASK-091 / US-086** — Concluído, aceito pelo Gestor (D-GES-65), com desvio. `globals.css`: `--space-field` (0,5 rem), `--space-group` (1 rem) e `@utility form-stack`; 17 `<form>` trocaram `gap-4/gap-5` por `form-stack` (invite, lançamento, baixa, edição, tags, categoria, transferência, nova conta, renomear, acerto/regra, limites do assistente, família, pagar fatura, cartão, prevista); consent-form do OAuth e login ficaram fora. Slot de erro `min-h-5` do `Field` mantido (US-039 verde). Categorias do lançamento: 4 colunas, tile de 56 px. Testes: E2E `US-086` (5 cenários x 2 projetos: Salvar visível sem rolar a 375x667, 4 colunas de ≥ 44 px, gap de 8 px igual em "Nova conta" e "Nova despesa", alvos ≥ 44 px, erro sem deslocar o campo de cima, foco alcançável); regressão E2E US-039/004/032.
- **DEV-148**: medição no navegador a 375x667 (tema claro): "Nova despesa" tem corpo de 1259 px de altura contra 545 px visíveis; "Nova conta", 874 contra 545. A meta "sem rolagem" não fecha só com tokens e tiles (a previsão do TL se confirma); o rodapé "Salvar" fixo (`sticky`) já existia no `TransactionDrawer`. Entregue a meta alternativa do TL (Salvar sempre visível, rolagem interna); decisão do PO pendente. A data segue em "Mais detalhes".

### [TASK-092] US-089 Conta pagadora padrão do cartão (SDD-030)
- **TASK-092 / US-089** — Concluído, aceito pelo Gestor (D-GES-65). `CreditCard.paymentAccountId` (2 migrações: enum `CARD_PAYER_ACCOUNT_CHANGED` isolada + coluna/FK composta/índice parcial); `createCard`/`updateCard` validam via `lockAccountsForPosting` (conta antes de cartão); `deleteAccount` limpa o vínculo e registra evento; `AccountDTO.payerForCards`; `PayableInvoice`/`invoiceItem` ligam o gancho `// US-089`; MCP `payWith` restrito a PLANNED; export `contaPagadoraId`; UI: campo no `card-drawer`, `payer-line.tsx` ("Paga pela"), `pay-invoice-drawer` + `useSourceAccount.preferredReason`, avisos de arquivar/excluir conta, "Sai da conta" em A pagar. Testes: unit (schemas 2, hook 4, rótulos de evento), int `us-089-conta-pagadora` (14) + `it.todo` da US-060 virou teste, E2E `US-089` (10 cenários x 2 projetos) + `@pendente-us-089` removido. Desvios: DEV-149 (validação de `accountId` ausente no pagamento retorna 400 e não 422, o código vence o SDD §9.2-7); DEV-150 (`us-017a` ajustado para os 2 campos novos de `PayableInvoice`; os demais testes de regressão ficaram sem edição); DEV-151 (extras do SDD §9.3 não cobertos: teclado no select, tema claro/escuro e "Sai da conta" na Início; coberto "Sai da conta" em A pagar).

### [TASK-093] US-092a Membro sem conta: modelo e leitura segura (SDD-033 §3, ADR-033; sem selo, que é a 093a)
- **TASK-093 / US-092a** — Concluído (aceito pelo Gestor, D-GES-65; revisão final do TL/Opus aprovada em a73c88e, no diff no diff da migração e do gatilho, como pede o SDD). 2 migrações (`20261030020000_us092_enum_member_events`, `20261030020100_us092_unlinked_member`: `userId` anulável, colunas, 5 CHECKs, índice de `pendingEmail`, gatilho `members_link_guard`, `invitations.memberId`); `familia/display-name.ts` (+ `toMemberRef`, `samePerson`, saneamento) e troca de todas as leituras de nome (TS apontou ~80); `MemberRef.unlinked`; `ownerStanding`, exportação e sugestões sem `userId` nulo; contagens, remoção de sem conta, `UNLINKED_MEMBER_ROLE`, exclusão de conta zera `members.name`; `endUserSessions` guarda. Testes: unit `display-name` (10) e estático `member-reads` (4); int `us-092a-modelo-membro-sem-conta` (20, com R2/R3 reproduzindo a falha sem a correção), `us-092a-harness-sem-conta` (240 famílias, gate de 1 centavo), `sec036-travas` ampliado; `buildUniverse(seed,{unlinked})`, `snapshotFamily` e `makeUnlinkedMember` nas fixtures. Sem cenário E2E novo (os 8 BDD da US-092 são da 092b); regressão E2E de família/privacidade rodada. Desvios: DEV-152 (`sec036` agora cobre TODAS as funções do schema, inclusive `sql`, não só `plpgsql`: `purge_family_bypass` é `sql`); DEV-153 (`GET /family` já devolve `unlinked`/`email:null` na 092a por §3.5; a UI ainda não mostra selo, e `MemberDTO.email` passou a `string | null`); DEV-154 (`analise-ia` `memberIdentifiers` passa a listar também `members.name`; `pendingEmail` NÃO entra, para respeitar a regra estática do SDD §8.1-3b).

### [TASK-094] US-092b Cadastrar membro sem conta (SDD-033 §4, ADR-033)
- **TASK-094 / US-092b** — Implementada, aguarda validação do Gestor. Migração `20261031000000_us092b_linked_requires_user_chk` (CHECK `linkedAt IS NULL OR userId IS NOT NULL`, revisão TL a73c88e); `POST /api/v1/members` + `familia/members.ts` (`createUnlinkedMember`: lock, teto 20, nome único/saneado/reservado, e-mails, `MEMBER_CREATED {hasEmail}`); `createInvitation` com `lockFamilyAdmins` e `EMAIL_BELONGS_TO_UNLINKED_MEMBER`; `GET /family` com `pendingEmail` só para ADMIN; UI: `add-member-drawer.tsx`, botão "Cadastrar membro", selo "Sem acesso ao app", menu só com Remover, histórico. Testes: unit `create-unlinked-member-schema` (4), int `us-092b-cadastrar-membro` (14, inclui a CHECK), E2E `US-092-cadastrar-membro-sem-conta` (9 cenários x 2 projetos = 18, `--retries=1`). Desvios: DEV-155 (erro de corpo Zod devolve 400 `VALIDATION_ERROR`, não 422; `NAME_RESERVED` 422 fica no serviço, não no Zod); DEV-156 (o campo "Responsável" do BDD é "Responsável pelo pagamento" na Nova despesa prevista, e "Quem pagou?" na Nova despesa; steps com frases próprias para não colidir com steps existentes; 9º cenário extra do aviso de divisão); DEV-157 (`member-reads` aceita `pendingEmail` na tela Família; o diálogo de remoção não tinha o texto "perderá o acesso", então nada a omitir; menu da lista agora aparece para ADMIN em qualquer membro).

---

## Fila de implementação (atualizada em 2026-10-25)

Verificada no código (`src/`, `prisma/schema.prisma`, `prisma/migrations`, `tests/`) e no `git log`; o código vence a documentação. Estados de área em `agents/estado/`. Pontos = estimativa do TL/PO no backlog.

| Item | Status real | Bloqueio | Pts | Próximo passo |
| :-- | :-- | :-- | :-: | :-- |
| TASK-054 / US-060 (resumo por conta no A pagar) | **Aceita pelo Gestor** (D-GES-65; SDD-029); fatura na conta pagadora ligada pela US-089 | — | 5 | — |
| TASK-093 / US-092a (membro sem conta: modelo e leitura) | **Aceita pelo Gestor** (D-GES-65; revisão final do TL aprovada em a73c88e; SDD-033 §3); nenhum caminho cria sem conta ainda | Migrações `20261030020000/020100` a aplicar em produção (expand, antes do código) | 3 | — |
| TASK-095 / US-090 + TASK-096 / US-091 (porta única e "Repetir todo mês") | **Implementadas, aguardam validação do Gestor** (SDD-031; sem migração) | — | 5 / 3 | Gestor valida; DEV-158..160 em `estado/previstas-series.md` §e |
| TASK-094 / US-092b (cadastrar membro sem conta) | **Implementada, aguarda validação do Gestor** (SDD-033 §4) | Migração `20261031000000` a aplicar em produção junto com a 092a | 2 | Gestor valida; próximo 093a (SDD do TL) |
| TASK-092 / US-089 (conta pagadora padrão do cartão) | **Aceita pelo Gestor** (D-GES-65; SDD-030) | Migrações `20261030010000/010100` a aplicar em produção | 3 | — |
| TASK-055 (produção, ADR-026) | Encerrada: superada pela TASK-064 (ADR-031) | Nenhuma; `docker build` e restore viram itens de `agents/estado/hospedagem-producao.md` §d | 5 | Gestor registra o encerramento |
| TASK-056 / US-065 | Código completo, testes escritos | Validação do Gestor; cenário `@depende-us-042` marcado `@skip` | 5 | Gestor valida |
| EN-007 / TASK-064 (Vercel + Prisma Postgres) | Código no repositório concluído | Painel da Vercel/Prisma/GitHub é do usuário (checklist); `regions`, `CRON_SECRET`, `APP_DEPLOY_ENV`, ensaio de restore | 8 | Usuário executa o checklist; Dev ajusta `regions` depois |
| TASK-057..063 (EN-004, EN-005, US-070..073) | Concluídas | Validação do Gestor; conta e chave Anthropic, limite na console (EXT-12) e valor do teto (Q-U10) para ligar a IA real | 27 | Gestor valida; usuário decide o teto |
| TASK-065..072 (MCP: EN-006a/b, US-074, 075, 076a/b, 077) | Concluídas, `MCP_ENABLED` desligado | Validação do Gestor; MCP Inspector, Claude real e homologação SDD-025 §6 dependem de serviço externo | 33 | Gestor valida; usuário liga o MCP após o checklist |
| TASK-073..085 (DEV-86, segurança grupos A/B, LGPD, Só meu rodadas 4 a 8; US-078..084) | Concluídas | Validação do Gestor e reteste curto da Segurança (SEC-051/DEV-135 etc., ver `estado/seguranca.md`) | n/d | Gestor valida; Segurança reteste; migrações 2026-10-26+ a aplicar em produção |
| US-082 (página Privacidade) | Implementada com texto rascunho | Texto aguarda aprovação do usuário e revisão jurídica | 1 | Usuário aprova o texto |
| TASK-044..047 (US-040, EN-002) | Concluídas; `INSTALLMENT_SPLIT_RELEASED=false` | Janela de reversão do rateio em curso (>= 7 dias desde a migração em produção, `--verify` limpo e um fechamento conferido) | 21 | Gestor valida; aguardar a janela |
| US-041 (editar/excluir parcela) | Não iniciada (nenhum código; `INSTALLMENT_NOT_EDITABLE` vigente) | Nenhum técnico; ordem de risco do PO a coloca depois da US-043 | 5 | Pode iniciar (independente do rateio) se o Gestor antecipar |
| US-042, US-043, US-044 (rateio por parcela, três modos, lembrar por categoria) | Não iniciadas | Janela de reversão do rateio (motor STORED, EN-002); US-042 liga o flag | 3 / 5 / 3 | Esperar a janela; depois US-042, US-043, US-044 |
| US-045, US-047 (tags) | **Implementadas (TASK-086/087)**; US-046 (gerenciar tags) não iniciada | Validação do Gestor; migrações `20261029*` a aplicar em produção | 5 / 2 / 3 | Gestor valida; Dev segue com US-046 se o Gestor liberar |
| US-048, US-049 (visão sintética na Análise) | Não iniciadas | Dependem de tags (filtro) e da competência da US-040 (pronta) | 5 / 5 | Após as tags |
| US-050 (cor por conta e cartão) | Não iniciada (sem coluna de cor no schema) | Independente; decisão sobre antecipar | 3 | Dev (SDD-017 aprovado) |
| US-051 (receitas previstas e saldo previsto) | Não iniciada | Independente; decisão sobre antecipar | 5 | Dev (SDD-017 aprovado) |
| US-053, US-054 (textos do acerto; avisar antes de arquivar e botão flutuante) | Sem TASK e sem evidência de código | Sem estimativa/SDD do TL registrada | 3 / 3 | PO/TL confirmam se seguem na fila (ver dúvidas do relatório) |
| US-066..069 (importação de fatura) | Não iniciadas (R5 adiada, D-GES-28/33); `INVOICE_IMPORT` indisponível | Sem SDD/ADR (armazenamento, extração, dedupe, lote); Q-U07..Q-U10 | 5 / 8 / 5 / 3 | TL escreve ADR/SDD quando a R5 for retomada |
| US-074b (token pessoal) e US-076c (exigir confirmação) | Não iniciadas, fora do POC | Decisão do usuário (D-GES-37) | n/d | Sem ação |
| US-083 (lista de e-mails permitidos) | Implementada em TASK-075 (U6) | Sem SDD próprio; usuário define `ALLOWED_SIGNUP_EMAILS` em produção | 1 | Usuário configura |

### Decisões pendentes do usuário
1. (Tags US-045/US-047 antecipadas por autorização do usuário em 2026-10-27; US-046, US-048 e US-049 seguem pendentes.) Antecipar o resto das tags (US-046, US-048, US-049), cor (US-050) e receitas previstas (US-051), independentes do rateio, enquanto a janela de reversão corre? E ratificar DEV-48..50.
2. Q-U10: valor do teto mensal de custo da IA (padrão técnico R$ 5,00 por família; teto global sugerido R$ 50) e EXT-12 (conta e chave Anthropic).
3. Aprovar o texto da página de Privacidade (US-082) e a revisão jurídica.
4. Ordem de US-041 frente à US-042 (ordem técnica: US-042, US-043, US-041).
