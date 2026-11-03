# ADR-001 — Stack tecnológica da aplicação web

**Status:** aceito · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
App de gestão financeira familiar: lançamento rápido no celular, integridade contábil (centavos exatos, transações atômicas, rateios sem perda), edição concorrente entre cônjuges e volume pequeno (famílias). Produção adiada (ADR-005; depois ADR-031).

## Decisão
Monólito modular (`src/modules/<dominio>`), regras de negócio em funções puras, sem microsserviços nem Redis.
- TypeScript estrito, Node 22 LTS, pnpm. Next.js (App Router); mutações financeiras via **Route Handlers REST** com `Idempotency-Key` (não Server Actions), validação Zod na borda.
- UI: React 19, Tailwind v4, shadcn/ui, Recharts; TanStack Query; React Hook Form + Zod.
- PostgreSQL 17 + Prisma; SQL cru tipado para relatórios. Auth.js v5 + Google (ADR-002). Jobs com pg-boss (ADR-003). PWA com Serwist, offline somente leitura (ADR-004).
- Testes: Vitest, Testing Library, Testcontainers (Postgres real), Playwright + playwright-bdd. Biome, commitlint + Husky. Logs pino, Sentry, `/api/health`.

Regras transversais:
- **Dinheiro:** `BIGINT` em centavos no banco, inteiro `amountInCents` no código; formatação só na apresentação. Rateios pelo **maior resto** (soma dos subitens == total).
- **Ledger:** movimentações imutáveis (emendado pelo ADR-007); saldo derivado por `SUM`.
- **Datas:** `DATE` para vencimento/competência; `timestamptz` UTC para eventos; exibição em `America/Sao_Paulo`.
- **Multi-tenancy:** `familyId` em toda tabela, imposto por camada única de repositório.
- **Concorrência:** coluna `version` (controle otimista) → `409`; idempotência por `Idempotency-Key`.

## Consequências
- TS unificado, contratos Zod compartilhados, testes de integração com banco real, operação simples (1 app + 1 Postgres).
- Disciplina de centavos em toda a camada de dados; Prisma exige SQL cru em relatórios (Drizzle descartado por ora).
