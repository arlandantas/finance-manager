# Produção: arquitetura, backup e restore (ADR-031; substitui a versão Railway do ADR-026)

*Atualizado: 2026-10-24 (D-GES-36). Desenvolvimento continua em Docker (`docker-compose.yml`: `db`, `db-test`, `mailpit`), ver `ambiente-local.md`.*

## Visão
- **App**: Vercel (Fluid compute, Node), `https://verbus-finance.vercel.app`. Região das funções = região do banco (`vercel.json` `regions`).
- **Banco**: Prisma Postgres. App usa a URL **pooled** (`DATABASE_URL`, `pooled.db.prisma.io`); CLI do Prisma e backup usam a **direta** (`DIRECT_URL`, `db.prisma.io`). `sslmode=require`.
- **Release**: `vercel-build` ⇒ `prisma migrate deploy` (só `VERCEL_ENV=production`, via `DIRECT_URL`) ⇒ `next build`. Migração falhou ⇒ *build* falha ⇒ versão anterior segue no ar. Migrações sempre compatíveis com a versão anterior (expandir ⇒ contrair).
- **Travas** (ADR-031 §4): `isProdDeploy` = `APP_DEPLOY_ENV=production` **ou** `VERCEL_ENV ∈ {production, preview}`; nele, a presença de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE` derruba o `register()`, desliga o login de teste e faz `/api/health` responder `503 unsafe_config`.
- **Reversão de código**: *Instant Rollback* da Vercel (não reverte migração).
- ***Smoke* pós-deploy**: `scripts/smoke-prod.sh https://verbus-finance.vercel.app` (+ `pnpm mcp:smoke` quando o MCP existir).
- **Implementação (EN-007)**: `scripts/vercel-build.mjs`, `vercel.json` (*cron*), `src/app/api/cron/purge/route.ts`, `src/lib/db-url.ts`, `src/lib/db.ts` (*pool*), `.github/workflows/backup.yml`. Dev continua em Docker (`docker-compose.yml`); o `Dockerfile` serve só para ensaio local da *build*.
- ***Previews***: sem acesso ao banco/segredos de produção (variáveis só em *Production*); desligadas ou com banco próprio (TL-44); *Deployment Protection* ligada.

## Variáveis (escopo Production)
`DATABASE_URL` (a que a integração Prisma injeta serve: o app deriva a *pooled* do host direto; ver ADR-031, adendo do Dev), `DIRECT_URL` (opcional se a integração já injeta a direta), `DB_POOL_MAX` (opcional, 3), `APP_DEPLOY_ENV=production`, `APP_URL` e `AUTH_URL` (`https://verbus-finance.vercel.app`), `AUTH_TRUST_HOST=true`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `APP_TIMEZONE=America/Sao_Paulo`, `CRON_SECRET`, variáveis de LLM (SDD-021) e de MCP (`MCP_ENABLED`, `MCP_CIMD_ALLOWED_HOSTS`). Opcional: `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`.
**Nunca definir** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE`.

## Jobs
- **Vercel Cron diário** `0 7 * * *` (04:00 BRT, ±59 min no Hobby) ⇒ `GET /api/cron/purge` com `Authorization: Bearer $CRON_SECRET`: expurgos de IA (24 meses) e do MCP (auditoria 12 meses, *tokens*, pedidos OAuth, clientes DCR, *buckets* de taxa). Idempotente; sem *retry* da Vercel (a próxima execução recupera).
- Os *scripts* `pnpm ai:purge-*` / `pnpm mcp:purge` continuam para uso manual.

## Backup
1. *Snapshots* do Prisma Postgres: só nos planos Starter+ (7 dias). **No Free não há** ⇒ o item 2 passa a ser diário.
2. `pg_dump -Fc` por `.github/workflows/backup.yml` (cliente PostgreSQL 17), criptografado com gpg (AES256), artefato com retenção de 35 dias. Segredos do repositório: `DATABASE_DIRECT_URL` (URL **direta**), `BACKUP_PASSPHRASE`. Manual: `scripts/backup.sh`.

## Restore (ensaiar antes de ligar o MCP com escrita)
```bash
# 1. baixar o artefato do GitHub Actions (Actions > execução > Artifacts) e descompactar
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d finance-backup.dump.gpg > finance.dump
# 2. ensaio local no Postgres do docker compose (ou docker run -e POSTGRES_PASSWORD=x -p 5499:5432 postgres:17)
pg_restore --clean --if-exists --no-owner -d "postgresql://postgres:x@localhost:5499/postgres" finance.dump
# 3. restore real: preferir o restore do Console do Prisma "no mesmo banco" (mantém as variáveis da Vercel);
#    pelo dump: app em manutenção e o mesmo comando com -d "$DIRECT_URL"
```
Depois do restore: `/api/health` e conferir contas/lançamentos recentes.
