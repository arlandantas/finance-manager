# 📋 Quadro de Tarefas & QA do Desenvolvedor

*Atualizado: 2026-10-04 · Responsável: Agente Desenvolvedor & QA · Base: D-GES-09 (uma TASK por história, na ordem do PO).*

## 📌 Fluxo de Execução

```text
[Todo/Bloqueado] ➔ [Em Desenvolvimento] ➔ [Em Testes/QA] ➔ [Concluído (validação do Gestor)]
```

Regra (diretriz 3 do Gestor em `decisoes-do-gestor.md`): nenhuma história começa sem SDD que a cubra. Ordem: a do PO.

## 🗂️ Visão geral

| TASK | História | Descrição | Depende de | Especificação | Tam. | Status |
| :-- | :-- | :-- | :-- | :-- | :-: | :-- |
| TASK-001 | EN-001 | Ambiente local e esqueleto | — | `architecture/ambiente-local.md` (ADR-001..006) | 5 | Concluído (aguardando validação do Gestor) |
| TASK-002 | US-001 | Entrar com a conta Google (dev-login + Google real em EXT-01) | EN-001 | SDD-003 (pendente TL) | 3 | Bloqueado: aguarda SDD |
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

## 🔒 Demais tarefas (TASK-002 a TASK-014)

Cada uma segue o formato do `README.md` do desenvolvedor e só inicia com SDD publicado pelo Tech Lead. Sem checklist detalhado ainda: ele é derivado do BDD da história e da seção de testes do SDD no momento do início.
