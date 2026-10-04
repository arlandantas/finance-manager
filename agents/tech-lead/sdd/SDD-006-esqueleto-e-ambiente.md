# SDD-006: Esqueleto da aplicação, ambiente e infraestrutura de testes (EN-001)

- **História**: [EN-001](../../product-owner/backlog/stories/EN-001-ambiente-local-e-esqueleto.md) (enabler)
- **Rastreabilidade**: ADR-001, ADR-002, ADR-003, ADR-008 · D-GES-09, D-GES-10, D-GES-11 · [`ambiente-local.md`](../architecture/ambiente-local.md)
- **Status**: Aprovado para Desenvolvimento (**EN-001 já pode ser concluído/ajustado; parte dele já existe no repositório**) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Complementa** o `ambiente-local.md`, que continua sendo a fonte de verdade de portas, variáveis e scripts. Este SDD fixa o que falta para as histórias seguintes: dependências, isolamento de testes, E2E, *seed* e verificações de qualidade.

---

## 1. Estado observado e ajustes ao que já existe
O repositório já traz Next 16, Prisma 7 (driver adapter), Zod 4, Vitest, Playwright-BDD, Biome, commitlint/Husky, `docker-compose.yml` (5442/5443/1025/8025), `/api/health`, módulos vazios e *baseline* `SystemInfo`. Ajustes pedidos:

| # | Ajuste | Motivo |
| :-- | :-- | :-- |
| 1 | EN-001 (história do PO) cita `http://localhost:3000`; **vale 3100** (D-GES-10). O cenário `.feature` do EN-001 usa 3100. | Colisão de porta |
| 2 | `playwright.config.ts`: E2E sobe o app em **porta 3101** com `DATABASE_URL = TEST_DATABASE_URL`, `AUTH_URL = http://localhost:3101`, `AUTH_DEV_LOGIN=true`, `AUTH_SECRET` de teste, `SMTP_HOST=localhost`, `SMTP_PORT=1025`; `reuseExistingServer: false`. | Não reutilizar por engano um `pnpm dev` (3100) que aponta para o banco de desenvolvimento |
| 3 | `getEnv()` ganha: `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_DEV_LOGIN`, `AUTH_GOOGLE_ID/SECRET`, `SMTP_HOST/PORT`, `MAIL_FROM`, `APP_URL`, `APP_NOW_OVERRIDE`, `NODE_ENV`; falha na subida se `NODE_ENV=production && AUTH_DEV_LOGIN=true` (ADR-008). | Validação central |
| 4 | Criar `src/lib/{api,money,period,dates,clock,apportion,ids,logger}` conforme SDD-000 §1 (esqueleto vazio **com testes dos utilitários puros** já na EN-001: `money`, `period`, `apportion`, `dates`). | Fundamentos de todas as histórias |
| 5 | Substituir o **Testcontainers** por `db-test` (5443) nos testes de integração (já refletido em `vitest.int.config.mts`). | `ambiente-local.md` rev. 2 |
| 6 | Script `check:imports` (§6) e `pnpm test:int` rodando migrações no `globalSetup`. | ADR-013 |

## 2. Dependências a instalar (por história que as exige)
| Pacote | Uso | Quando |
| :-- | :-- | :-- |
| `next-auth@5` (beta estável do Auth.js v5) + `@auth/prisma-adapter` | US-001 | |
| `nodemailer` + `@types/nodemailer` | e-mail de convite (ADR-012) | US-003 |
| `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers` | formulários e cache | US-002+ |
| `pino` (+ `pino-pretty` dev) | logs (ADR-001) | EN-001 |
| `tailwindcss` v4 (já), `shadcn/ui` (Radix), `lucide-react`, `sonner` (toasts) | UI | US-001+ |
| `serwist` | PWA | **fora do R1** (instalar só na R2/AP1; ADR-004) |
| `pg-boss` | jobs | **fora do R1** (nenhuma história R1 usa) |
Instalar apenas o que a história em curso precisa; versão exata a do registro no dia, travada no `pnpm-lock.yaml`.

## 3. Isolamento dos testes de integração (`pnpm test:int`)
1. `globalSetup` (já existe): aplica `prisma migrate deploy` em `TEST_DATABASE_URL` (migrações do repositório, **inclusive o SQL cru** do modelo §4).
2. `fileParallelism: false` (já configurado): um arquivo por vez no mesmo banco.
3. **`beforeEach(resetDb)`**: `TRUNCATE` de todas as tabelas de domínio (`RESTART IDENTITY CASCADE`, exceto `_prisma_migrations`/`system_info`). O trigger `transactions_no_delete` **não** afeta `TRUNCATE`; porém `TRUNCATE` exige estar fora de transação.
4. Chamada de rotas em integração: `tests/support/call.ts` → `call(as, method, path, body?, {idempotencyKey?})` invoca o **Route Handler** diretamente (importando `GET/POST/…` do arquivo `route.ts`), injetando sessão/`Origin`. `as` vem de `asUser(email)`, que cria `User`+`Session` reais e define o cookie na requisição.
5. Relógio: `withClock("2026-10-04T15:00:00Z", fn)` injeta `Clock` fixo (SDD-000 §8).
6. Falhas injetadas (atomicidade): repositórios aceitam *hook* de teste via *spy* (`vi.spyOn(repo, "insertLeg").mockRejectedValueOnce(...)`); proibido *mock* de Prisma inteiro.

## 4. E2E (Playwright + playwright-bdd)
- `.feature` em português (`# language: pt`) em `tests/e2e/features/<ID>-<slug>.feature`, com o texto **idêntico** aos cenários das histórias; steps em `tests/e2e/steps/*.ts` (reutilizáveis: *Dado a "Família Silva" com …*, `loginAs`).
- Estado inicial **por cenário** por meio das fábricas de `tests/support/factories.ts` chamadas direto no banco de teste (não pela UI), seguido de `loginAs(page, email)` (ADR-008). Banco limpo no início de cada *feature* (`resetDb`).
- Projetos `desktop` (Chrome 1280) e `mobile` (Pixel 7 / 375). Cenários marcados `@mobile-only`/`@desktop-only` quando necessário. Os dois projetos rodam **todos** os cenários de UI (DoD: 375 e 1280).
- E-mail: `tests/support/mailpit.ts` (`waitForMessage(to)`, `clearMessages()`) consulta `http://localhost:8025/api/v1/messages`.
- Relógio fixo: `APP_NOW_OVERRIDE` no `webServer.env` para cenários que citam datas (ex.: "em 04/10"); como o servidor é único, esses cenários ficam em *features* próprias marcadas `@clock-2026-10-04` (um segundo `webServer`/projeto, se necessário).
- Cenários que exigem falha de rede usam `page.route(..., r => r.abort())`.

## 5. Seed (`prisma/seed.ts`, idempotente) e fábricas

**Fábricas** (`tests/support/factories.ts`, também importadas pelo seed): `makeUser`, `makeFamily({ name, members })`, `makeAccount`, `makeExpense`, `makeIncome`, `makeTransfer`, `makeInvitation`, `makeSession`. Elas usam os **mesmos serviços/repositórios** do código de produção sempre que possível (garantem invariantes) e `Prisma` direto para estados "impossíveis" de teste.

**Dataset de demonstração** (`buildDemoFamily(referenceDate = hoje)`, sem dados reais):
| Item | Valor |
| :-- | :-- |
| Família | "Família Silva" (`cutDay = 1`), regra `EQUAL` |
| Usuários | `mariana@exemplo.com` "Mariana Silva" (ADMIN), `lucas@exemplo.com` "Lucas Silva" (MEMBER); ambos `emailVerified` |
| Contas | "Itaú Mariana" (CHECKING, titular Mariana, abertura R$ 1.500,00), "Nubank Conjunta" (CHECKING, titular Mariana, abertura R$ 1.000,00), "Itaú Lucas" (CHECKING, titular Lucas, abertura R$ 3.000,00) |
| Mês corrente (datas relativas ao 1º..25º dia) | Comuns pagas por Mariana: R$ 2.000,00 (Moradia) e R$ 400,00 (Contas e serviços); comuns pagas por Lucas: R$ 1.200,00 e R$ 400,00 (Supermercado); pessoal de Mariana: R$ 80,00 (Lazer e restaurantes); receita de Mariana R$ 5.000,00 (Salário); uma transferência Itaú Lucas → Nubank Conjunta de R$ 1.000,00 |
Resultado esperado do acerto (referência NEED-007): "Lucas deve R$ 400,00 para Mariana".
O seed **não cria sessões**: o login é sempre por dev-login (atalhos *Mariana*/*Lucas* na tela `/login`). O seed só é executado depois das migrações das histórias correspondentes (idempotente via `upsert`/*skip* se a família "Família Silva" existe).

> **Nota ao PO:** o cenário de cada história descreve um estado inicial próprio (ex.: saldo de R$ 1.000,00 sem outras movimentações). Por isso os E2E **não dependem do dataset de demonstração**; eles reutilizam as **fábricas** e os **mesmos usuários** (Mariana/Lucas), que também montam o seed. Isto mantém a intenção "seed reaproveitado" sem acoplar cenários entre si.

## 6. Qualidade e proteções automáticas
| Verificação | Implementação |
| :-- | :-- |
| Lint/typecheck/format | `pnpm lint`, `pnpm typecheck` (já existentes); pre-commit Husky |
| Commit | commitlint: Conventional Commits + trailer `Co-authored-by:` |
| Imports restritos (ADR-013) | `scripts/check-imports.ts` (`pnpm check:imports`): falha se `@/lib/db` for importado fora de `src/lib/api/**`, `src/modules/**/repo.ts`, `src/modules/**/ledger*.ts`, `tests/**`, `prisma/**`; e se `src/modules/**/{rules,settlement,period,money,apportion}*.ts` importar `next`, `@prisma/*` ou usar `Date.now()`/`new Date()` sem argumento. Executado no pre-commit e em `pnpm test`. |
| Migração íntegra | teste de integração que verifica a existência dos `CHECK`s, índices parciais e triggers do `modelo-de-dados.md` §4 (consulta ao `pg_catalog`). |
| Health | `/api/health` → `{ status: "ok", db: "up", version }`; 503 se o banco cair (já existe teste). |

## 7. Testes obrigatórios do EN-001 (BDD → teste)
| Cenário BDD (EN-001) | Teste |
| :-- | :-- |
| Subir o sistema em máquina limpa | **E**: já existe `ambiente.feature` (porta 3100 → ajustar para a porta do `webServer` de E2E, §1.2). **Manual/QA** documentado no `tasks-board.md`: sequência completa do README em clone limpo (comandos do `ambiente-local.md`). |
| Suíte de qualidade verde | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:int && pnpm test:e2e` sem falhas (log anexado ao `tasks-board.md`). |
| Hooks protegem o histórico | **I/Script**: `commitlint` rejeita mensagem sem tipo e sem trailer `Co-authored-by` (teste que executa o `commitlint` com mensagens de exemplo). |
| (infra) Utilitários puros | **U**: `money`, `period`, `apportion`, `dates` conforme SDD-000 §3..5 e SDD-002 §8 (propriedade). |
| (infra) Guarda de produção | **U**: `getEnv({ NODE_ENV:"production", AUTH_DEV_LOGIN:"true", … })` lança. |

## 8. Estimativa e ordem
EN-001: PO 5 → **TL 8** (dependências, estrutura `lib/`, utilitários puros com testes, isolamento de integração, E2E com Mailpit, fábricas, `check:imports`). Itens já prontos reduzem o trabalho restante; a re-estimativa do Dev pode baixar para 5.
Ordem sugerida dentro do EN-001: (1) env e guarda de produção; (2) `lib/*` puros + testes; (3) `resetDb`/`call`/`asUser` (stubs até US-001); (4) ajuste do `playwright.config.ts`; (5) `check:imports`; (6) README raiz.
