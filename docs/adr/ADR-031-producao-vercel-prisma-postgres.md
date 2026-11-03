# ADR-031 — Produção na Vercel + Prisma Postgres; desenvolvimento em Docker

**Status:** aceito (substitui ADR-026 na parte de provedor; D-GES-36) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
O app já roda em produção em `https://verbus-finance.vercel.app/` com Prisma Postgres (integração da Vercel). Funções serverless, pool de conexões e o cron do plano Hobby (1×/dia, UTC, sem retry, pode duplicar) exigem adaptar o ADR-026. Vercel não barra deploy por healthcheck.

## Decisão
1. **Dois ambientes:** dev/teste/homologação em Docker Compose (Postgres 17, Mailpit; `Dockerfile` mantido para ensaio de build de produção e plano B); produção na Vercel (Node, nunca Edge), só login Google.
2. **Região das funções = região do banco.** Sem estado em memória entre requisições. Rotas MCP/OAuth com `maxDuration = 30`.
3. **Banco:** `DATABASE_URL` = URL **pooled** (app, PgBouncer em modo transação; todos os locks são `pg_advisory_xact_lock`); `DIRECT_URL` = URL direta (migrações, `pg_dump`/`pg_restore`). `prisma.config.ts` usa `DIRECT_URL ?? DATABASE_URL`. `src/lib/db.ts`: `pg.Pool` (`max` 3, `idleTimeoutMillis` 5000) com `attachDatabasePool` quando `VERCEL` existe.
4. **Migração no build de produção:** `vercel-build` roda `prisma migrate deploy` **só se `VERCEL_ENV === "production"`**, depois `next build`; migração falhou ⇒ build falha. Migrações devem ser compatíveis com a versão anterior (rollback de código não reverte migração).
5. **Travas:** `isProdDeploy(env)` é verdadeiro se `APP_DEPLOY_ENV === "production"` OU `VERCEL_ENV` é `production` ou `preview`. A presença de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE` faz o `register()` lançar, desliga ferramentas de dev e `checkHealth` responder 503 `unsafe_config` (ADR-026 §3). `assertLlmConfig` usa o mesmo `isProdDeploy`.
6. **Smoke pós-deploy** (`scripts/smoke-prod.sh`, mais `pnpm mcp:smoke`); Instant Rollback para código.
7. **Previews:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_*`, `ANTHROPIC_API_KEY` e `MCP_*` só no escopo *Production*; Deployment Protection ligada; preferência por desligar previews no alpha.
8. **Limite de taxa no Postgres** (`mcp_rate_buckets`); proibidos `Map` em memória e Redis/KV. Não ligar bot protection em `/api/mcp`, `/api/oauth/*`, `/.well-known/*`.
9. **Jobs:** Vercel Cron diário em `GET /api/cron/purge` (expurgos de IA 24 meses e do MCP), exige `Authorization: Bearer CRON_SECRET` em tempo constante (ausente ⇒ 401), tarefas idempotentes sob `pg_advisory_xact_lock('cron:purge')`. **Backup** fora do provedor: GitHub Actions com `pg_dump` (segredo `DATABASE_DIRECT_URL`, `postgresql-client-17`), criptografado, diário se o plano não tiver snapshots; ensaio de restore obrigatório.
10. **Variáveis (Production):** banco (`DATABASE_URL`, `DIRECT_URL`, `DB_POOL_MAX`), ambiente (`APP_DEPLOY_ENV`, `APP_URL`, `APP_TIMEZONE`), auth (`AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_GOOGLE_*`), LLM, MCP (`MCP_ENABLED` padrão `false`), `CRON_SECRET` (≥ 32 caracteres), SMTP opcional. **Nunca** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE`.
11. **Domínio:** URL canônica `APP_URL`; decidir domínio definitivo **antes de ligar o MCP** (o `resource` OAuth fica gravado nas conexões). URLs de deploy não são canônicas.

## Consequências
- Sem servidor para manter; rollback de código em um clique; custo baixo. Dois provedores mais backup no GitHub.
- Sem healthcheck que barre deploy; cron Hobby impreciso (±59 min).
- Riscos a conferir no estado real: `APP_DEPLOY_ENV` ausente na Vercel, `prisma migrate status` em produção (drift), existência de backup, `DATABASE_URL` direta no app, região da função.
