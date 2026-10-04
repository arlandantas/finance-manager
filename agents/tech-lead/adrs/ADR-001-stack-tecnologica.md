# ADR-001: Definição da Stack Tecnológica da Aplicação Web

## Status
**Aceito** (revisão 2, aprovada pelo Gestor do Projeto). A stack de **produção/hospedagem** está explicitamente **adiada** (ver [ADR-005](ADR-005-hospedagem-producao-adiada.md)). O foco imediato é o **ambiente local** ([`architecture/ambiente-local.md`](../architecture/ambiente-local.md)).

## Contexto
A aplicação de Gestão Financeira Familiar necessita de:
- Interface web rica e interativa, com lançamento rápido (< 10 s no celular) e gráficos.
- Boa experiência em desktop e smartphone (responsividade, toque, PWA).
- Integridade contábil estrita (centavos exatos, transações atômicas, rateios sem perda).
- Multi-usuários no mesmo núcleo familiar, com edição concorrente (cônjuges).
- Facilidade de desenvolvimento, testes automatizados e deploy futuro.
- Volume pequeno (famílias, não milhões de eventos): arquitetura simples e barata.

Rastreabilidade: NEED-001..012, `mvp-definition.md`, `cronograma-e-releases.md`.

## Opções Avaliadas
1. **Next.js (React 19 / TypeScript) + Tailwind + PostgreSQL / Prisma** (escolhida).
2. Vite + React (SPA) + Node.js (Fastify) + PostgreSQL.
3. Python (FastAPI) + React + PostgreSQL.

## Decisão

**Estilo arquitetural:** monólito modular (`src/modules/<dominio>`: contas, cartões, transações, orçamento, split…). Regras de negócio em funções puras, sem dependência de framework. Sem microsserviços e sem Redis.

| Camada | Escolha |
| :--- | :--- |
| Linguagem / runtime | TypeScript estrito, Node 22 LTS, pnpm |
| Web / API | Next.js (App Router). Mutações financeiras via **Route Handlers REST** com `Idempotency-Key` (não Server Actions), validação Zod na borda |
| UI | React 19, Tailwind v4, shadcn/ui (Radix), Recharts |
| Estado / formulários | TanStack Query (cache + atualização otimista), React Hook Form + Zod |
| Banco | PostgreSQL 17, Prisma; SQL cru tipado (`$queryRaw`/TypedSQL) para relatórios |
| Autenticação | Auth.js v5 + Google ([ADR-002](ADR-002-autenticacao-google.md)) |
| Jobs / agendamento | pg-boss sobre o Postgres ([ADR-003](ADR-003-jobs-e-agendamento.md)) |
| PWA | Serwist: instalável, shell em cache, offline **somente leitura** ([ADR-004](ADR-004-escrita-offline-adiada.md)) |
| Testes | Vitest, Testing Library, Testcontainers (Postgres real), Playwright + playwright-bdd |
| Qualidade | Biome (lint/format), commitlint + Husky (Conventional Commits + trailer `Co-authored-by`) |
| Observabilidade | pino (logs estruturados), Sentry, `/api/health` com checagem de banco |

**Regras técnicas transversais**
- **Dinheiro:** `BIGINT` em centavos no banco e inteiro (`amountInCents`) no código; formatação apenas na apresentação. Rateios usam o **algoritmo do maior resto** (soma dos subitens == total, RN-008.1).
- **Ledger:** movimentações imutáveis; correções por estorno ou `AJUSTE_CONCILIACAO`. Saldo derivado por `SUM` (materializar só se medido como necessário).
- **Datas:** `DATE` para vencimento/competência; `timestamptz` (UTC) para eventos; exibição em `America/Sao_Paulo`. Ciclo orçamentário com dia de corte configurável por família.
- **Multi-tenancy:** `familyId` em toda tabela, imposto por uma camada única de repositório; avaliar RLS do Postgres como defesa em profundidade.
- **Concorrência:** coluna `version` (controle otimista) → `409` em conflito; idempotência por `Idempotency-Key`.

## Consequências
- **Positivas:** ecossistema TS unificado, contratos Zod compartilhados front/back, testes de integração com banco real, operação simples (1 app + 1 Postgres).
- **Trade-offs:** disciplina de centavos em toda a camada de dados; Prisma exige SQL cru em relatórios (alternativa registrada: Drizzle, descartada por ora).

## Histórico
- Rev. 1: Proposto (Tech Lead).
- Rev. 2: Aceito pelo Gestor, com Auth, jobs, PWA e testes detalhados; produção adiada.
