# Spec 11 — Hospedagem e produção (Vercel + Prisma Postgres)

Atualizado: 2026-10-31. Fonte de verdade: código e `vercel.json`. O painel da Vercel, do Prisma e do GitHub é do usuário.

## Resumo
- Produção: Vercel, `https://verbus-finance.vercel.app` (domínio fixo), Prisma Postgres plano Free (sem snapshot automático). Dev em Docker.
- Código da EN-007 está no repositório. Não verificado: produção real, restore, cold start, `docker build`.

## Regras
| Tema | Regra | Fonte |
| :-- | :-- | :-- |
| Build | `vercel-build` roda `prisma migrate deploy` SÓ com `VERCEL_ENV=production`, depois `next build`. Migração falha => build falha => versão anterior segue no ar | `scripts/vercel-build.mjs` |
| Migrações | Compatíveis com a versão anterior (expandir antes de contrair). Rollback da Vercel reverte o código, não o banco | ADR-031 |
| URLs do banco (app) | `DATABASE_URL` ou `POSTGRES_URL`; host `db.prisma.io` vira `pooled.db.prisma.io`. `prisma+postgres://` é ignorada | `src/lib/db-url.ts`, `src/lib/db.ts` |
| URLs do banco (CLI/backup) | `DIRECT_URL` > `DATABASE_URL_UNPOOLED` > `POSTGRES_URL_NON_POOLING` > `DATABASE_URL` com host `pooled.` revertido a `db.prisma.io` | `src/lib/db-url.ts`, `prisma.config.ts` |
| Pool | `DB_POOL_MAX` padrão 3 (1..20). Na Vercel: `idleTimeoutMillis` 5 s e `attachDatabasePool` | `src/lib/env.ts`, `src/lib/db.ts` |
| Ambiente de produção | `isProdDeploy` = `APP_DEPLOY_ENV=production` OU `VERCEL_ENV` em {production, preview}. Preview conta como produção nas travas | `src/lib/auth/dev-login-guard.ts` |
| Trava de boot | `register()` falha na subida se `AUTH_DEV_LOGIN` ativo em produção sem homologação | `src/instrumentation.ts` |
| Trava de presença | `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` presentes (qualquer valor) em prod/preview => `/api/health` = `unsafe_config` e login de teste desligado | `dev-login-guard.ts`, `check-health.ts` |
| Health público | `/api/health`: só `status` (`ok`/`degraded`) e `timestamp`; `200` se `ok`, senão `503` | `src/app/api/health/route.ts` |
| Health detalhado | `checks.database` e `unsafe_config` só com `Authorization: Bearer <CRON_SECRET>` | `route.ts` |
| Cron de expurgo | `vercel.json`: `0 7 * * *` (04:00 BRT; Hobby +-59 min). `GET /api/cron/purge` exige `Bearer CRON_SECRET` (senão 401). Idempotente, sem retry; limpa sessões, convites, idempotência, IA e MCP | `vercel.json`, `src/modules/cron/purge.ts` |
| Proxy | O matcher exclui `api/` (cron e health não passam pelo proxy) | `src/proxy.ts` |
| Backup | GitHub Actions `backup-postgres`, diário 06:00 UTC: `pg_dump -Fc` pela URL DIRETA, cifrado gpg AES256, artefato 35 dias. Manual: `scripts/backup.sh` | `.github/workflows/backup.yml` |
| Smoke pós-deploy | `scripts/smoke-prod.sh <url>`: health 200; `POST /api/dev/login` 404; `/login` sem login de teste; `/api/auth/session` sem `sessionToken` nem `userId` | `scripts/smoke-prod.sh` |
| MCP em produção | `MCP_ENABLED=false` padrão; nunca liga em preview; produção exige `APP_URL` https | `src/modules/mcp/config.ts` |
| Domínio | `APP_URL` e `AUTH_URL` = `https://verbus-finance.vercel.app`. Não usar URLs `*-<hash>.vercel.app` em login/OAuth | ADR-031 |
| Homologação | Só local. Nunca `APP_HOMOLOG_MODE` em produção | ADR-024 |

## Variáveis e segredos
Escopo **Production** para tudo; nenhuma variável sensível em Preview. (S) = segredo.
| Variável | Estado |
| :-- | :-- |
| `DATABASE_URL` (S) | Obrigatória; pooled ou direta (o app deriva a pooled) |
| `DIRECT_URL` (S) | Opcional; se ausente, CLI e backup derivam a direta de `DATABASE_URL` |
| `DB_POOL_MAX` | Opcional, padrão 3 |
| `APP_DEPLOY_ENV` | Recomendada `production` (`VERCEL_ENV` já cobre as travas) |
| `APP_URL`, `AUTH_URL` | `https://verbus-finance.vercel.app` |
| `AUTH_TRUST_HOST` | `true` |
| `AUTH_SECRET` (S) | Valor novo e forte |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (S) | Google OAuth; redirect `/api/auth/callback/google` |
| `CRON_SECRET` (S) | Mínimo 32 caracteres; exigido por cron e health detalhado |
| `APP_TIMEZONE` | `America/Sao_Paulo` |
| `ALLOWED_SIGNUP_EMAILS` | Vazia = cadastro aberto |
| `PRIVACY_CONTACT_EMAIL` | Contato da página de privacidade |
| `AI_FEATURES_ENABLED`, `LLM_PROVIDER`, `ANTHROPIC_API_KEY` (S) | IA; chave de produção |
| `LLM_GLOBAL_MONTHLY_CAP_CENTS`, `OPS_ALERT_EMAIL` | Obrigatórias com IA ligada em produção (teto global) |
| `MCP_ENABLED` | `false` até o ensaio de restore e a revisão de segurança |
| `MCP_CIMD_ALLOWED_CLIENT_IDS` | Vazia = nenhum cliente CIMD (`MCP_CIMD_ALLOWED_HOSTS` é ignorada) |
| `SMTP_*`, `MAIL_FROM` | Opcionais |
| GitHub secrets `DATABASE_DIRECT_URL` (S), `BACKUP_PASSPHRASE` (S) | URL direta para o `backup.yml`; sem a passphrase o backup não abre (guardar também fora do GitHub) |

**Nunca em produção:** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE`.

## Riscos em aberto
- Backup sem restore testado; escopos Production/Preview e previews não conferidos; `regions` ausente em `vercel.json` (deve igualar a região do banco, ex.: `us-east-1` => `iad1`).
- Segurança de produção (SEC-005 `x-real-ip`, HSTS, SEC-036): ver spec de segurança.

## Fontes
Código: `scripts/{vercel-build.mjs,backup.sh,smoke-prod.sh}`, `vercel.json`, `.github/workflows/backup.yml`, `prisma.config.ts`, `src/lib/{db-url,db,env}.ts`, `src/instrumentation.ts`, `src/lib/auth/dev-login-guard.ts`, `src/modules/{health/check-health,cron/purge,ia/config,mcp/config}.ts`, `src/app/api/{health,cron/purge}/route.ts`, `src/proxy.ts`.
Testes: 32 unitários e 3 de integração da TASK-064. Railway (`railway.json`, `preDeployCommand`, `DATABASE_PUBLIC_URL`) está superado.

## Pendências
1. Usuário: conferir escopos Production e ausência das três variáveis proibidas; criar os dois secrets do GitHub e rodar `backup.yml` manualmente; decidir previews (recomendado desligar) e ativar Deployment Protection; decidir plano do Prisma (Free exige o backup diário).
2. Confirmar `prisma migrate status` com a URL direta (drift: avisar, não aplicar). Definir `regions`. Ensaio de restore com data registrada. Validar `docker build` e medir cold start.
3. Primeiro deploy: `smoke-prod.sh` e `/api/auth/session` sem `sessionToken`.
4. SEC-018 fase 2, só >= 1 dia após a fase 1 no ar e com `sec018-phase2-check.ts --since <ISO>` = 0: mover `prisma/pending/20261027000000_sec018_drop_plain_session_token` para `prisma/migrations` (timestamp mais novo), remover `sessionToken` do model, `pnpm db:generate`.
5. Antes de `MCP_ENABLED=true`: ensaio de restore, revisão de segurança do SDD-024 §9, domínio, opções do MCP; após cadastrar o `client_id` do Claude, rodar `sec010-revalidate-mcp-clients.ts`.
