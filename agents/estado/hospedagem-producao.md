# Estado vigente: Hospedagem e produção (Vercel + Prisma Postgres)

Atualizado: 2026-10-31 (consolida ADR-031 e EN-007). Fonte de verdade: código e `vercel.json` (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit. Passo a passo do painel: [checklist-vercel-producao.md](../manager/checklist-vercel-producao.md). Segurança e achados: [seguranca.md](seguranca.md).

## a) Resumo para o usuário
- Produção: Vercel, `https://verbus-finance.vercel.app` (domínio fixo), banco Prisma Postgres plano Free (sem snapshot automático). Dev segue em Docker (`tech-lead/architecture/ambiente-local.md`).
- O código da EN-007 (TASK-064) está no repositório e aguarda validação do Gestor. O painel da Vercel, do Prisma e do GitHub é do usuário.
- Não verificado por nós: produção real, restore, cold start, `docker build`. Ações do usuário: §d.

## b) Regras vigentes (código)
| Tema | Regra | Fonte |
| :-- | :-- | :-- |
| Build | `vercel-build` roda `prisma migrate deploy` SÓ com `VERCEL_ENV=production`, depois `next build`. Migração falha ⇒ build falha ⇒ a versão anterior segue no ar | `scripts/vercel-build.mjs` |
| Migrações | Compatíveis com a versão anterior (expandir antes de contrair). Rollback da Vercel reverte o código, não o banco | ADR-031 §3, §5 |
| URLs do banco (app) | `DATABASE_URL` ou `POSTGRES_URL`; host `db.prisma.io` vira `pooled.db.prisma.io`. `prisma+postgres://` é ignorada | `src/lib/db-url.ts`, `src/lib/db.ts` |
| URLs do banco (CLI/backup) | `DIRECT_URL` → `DATABASE_URL_UNPOOLED` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` com host `pooled.` revertido a `db.prisma.io` | `src/lib/db-url.ts`, `prisma.config.ts` |
| Pool | `DB_POOL_MAX` padrão 3 (1..20). Na Vercel: `idleTimeoutMillis` 5 s e `attachDatabasePool` | `src/lib/env.ts`, `src/lib/db.ts` |
| Ambiente de produção | `isProdDeploy` = `APP_DEPLOY_ENV=production` OU `VERCEL_ENV` ∈ {production, preview}. Preview conta como produção nas travas | `src/lib/auth/dev-login-guard.ts` |
| Trava de boot | `register()` falha na subida se `AUTH_DEV_LOGIN` estiver ativo em produção sem homologação | `src/instrumentation.ts`, `dev-login-guard.ts` |
| Trava de presença | `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` presentes (qualquer valor) em prod/preview ⇒ `/api/health` = `unsafe_config` e login de teste desligado | `dev-login-guard.ts`, `check-health.ts` |
| Health público | `/api/health`: só `status` (`ok`/`degraded`) e `timestamp`. `200` se `ok`, senão `503`. `unsafe_config` aparece como `degraded` | `src/app/api/health/route.ts`, `check-health.ts` |
| Health detalhado | `checks.database` e `unsafe_config` só com `Authorization: Bearer <CRON_SECRET>` | `route.ts` |
| Cron de expurgo | `vercel.json`: `0 7 * * *` (04:00 BRT; Hobby ±59 min). `GET /api/cron/purge` exige `Bearer CRON_SECRET` (senão 401). Idempotente, sem retry; limpa sessões, convites, idempotência, IA e MCP | `vercel.json`, `src/app/api/cron/purge/route.ts`, `src/modules/cron/purge.ts` |
| Proxy | O matcher exclui `api/` (cron e health não passam pelo proxy) | `src/proxy.ts` |
| Backup | GitHub Actions `backup-postgres`, diário 06:00 UTC (03:00 BRT): `pg_dump -Fc` pela URL DIRETA, cifrado com gpg AES256, artefato com 35 dias. Manual: `scripts/backup.sh` | `.github/workflows/backup.yml`, `scripts/backup.sh` |
| Smoke pós-deploy | `scripts/smoke-prod.sh <url>`: health 200; `POST /api/dev/login` 404; `/login` sem login de teste; `/api/auth/session` sem `sessionToken` nem `userId` | `scripts/smoke-prod.sh` |
| MCP em produção | `MCP_ENABLED=false` por padrão; nunca liga em preview; produção exige `APP_URL` https | `src/modules/mcp/config.ts` |
| Domínio | `APP_URL` e `AUTH_URL` = `https://verbus-finance.vercel.app`. Não usar URLs `*-<hash>.vercel.app` em login/OAuth | ADR-031 §10 |
| Homologação | Só local (ADR-024). Nunca `APP_HOMOLOG_MODE` em produção | ADR-024, seguranca.md |

## c) Variáveis e segredos
Escopo **Production** para tudo. Segredo = **S**. Nenhuma variável sensível em Preview.

| Variável | S | Estado |
| :-- | :-: | :-- |
| `DATABASE_URL` | S | Obrigatória. Pooled ou direta (o app deriva a pooled) |
| `DIRECT_URL` | S | Opcional. Se ausente, o CLI e o backup derivam a direta de `DATABASE_URL` |
| `DB_POOL_MAX` | | Opcional, padrão 3 |
| `APP_DEPLOY_ENV` | | Recomendada `production`. `VERCEL_ENV` já cobre as travas |
| `APP_URL`, `AUTH_URL` | | `https://verbus-finance.vercel.app` |
| `AUTH_TRUST_HOST` | | `true` |
| `AUTH_SECRET` | S | Valor novo e forte |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | S (secret) | Google OAuth; redirect `/api/auth/callback/google` |
| `CRON_SECRET` | S | Mínimo 32 caracteres. Exigido por cron e pelo health detalhado |
| `APP_TIMEZONE` | | `America/Sao_Paulo` |
| `ALLOWED_SIGNUP_EMAILS` | | Vazia = cadastro aberto |
| `PRIVACY_CONTACT_EMAIL` | | Contato da página de privacidade |
| `AI_FEATURES_ENABLED`, `LLM_PROVIDER`, `ANTHROPIC_API_KEY` | S (chave) | IA (SDD-021). Chave de produção |
| `LLM_GLOBAL_MONTHLY_CAP_CENTS`, `OPS_ALERT_EMAIL` | | Obrigatórias com IA ligada em produção (teto global; SEC-013) |
| `MCP_ENABLED` | | `false` até o §e |
| `MCP_CIMD_ALLOWED_CLIENT_IDS` | | Vazia = nenhum cliente CIMD aceito |
| `SMTP_*`, `MAIL_FROM` | | Opcionais |
| GitHub secret `DATABASE_DIRECT_URL` | S | URL direta, para o `backup.yml` |
| GitHub secret `BACKUP_PASSPHRASE` | S | Sem ela o backup não abre; guardar fora do GitHub também |

**Nunca em produção:** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE`.

## d) Pendências (usuário e time)
| # | Item | Dono |
| :-: | :-- | :-- |
| 1 | Conferir escopos Production (segredos fora de Preview) e a ausência das três variáveis proibidas | Usuário |
| 2 | Confirmar `prisma migrate status` com a URL direta (drift = avisar o Gestor, não aplicar) | Usuário + Dev |
| 3 | Definir `regions` em `vercel.json` (hoje ausente) igual à região do banco (ex.: `us-east-1` ⇒ `iad1`). Região ainda desconhecida | Usuário (região) + Dev |
| 4 | Criar os dois secrets do GitHub e rodar o `backup.yml` manualmente | Usuário |
| 5 | Decidir previews (TL-44: desligar) e ativar Deployment Protection | Usuário |
| 6 | Decidir plano do Prisma (TL-46): Free exige backup diário (já configurado) | Usuário |
| 7 | Ensaio de restore (§f) e registro da data | Usuário + Dev |
| 8 | Validar `docker build` (TASK-055) e medir cold start (ADR-031 §2) | Dev |
| 9 | Primeiro deploy: `smoke-prod.sh` e `/api/auth/session` sem `sessionToken` | Usuário |
| 10 | SEC-018 fase 1 ir ao ar: avisar o Gestor. Fase 2 só ≥ 1 dia depois, com `sec018-phase2-check.ts --since <ISO>` = 0: mover `prisma/pending/20261027000000_sec018_drop_plain_session_token` para `prisma/migrations` (timestamp mais novo), remover `sessionToken` do model, `pnpm db:generate` | Usuário ➔ Gestor |
| 11 | Antes de `MCP_ENABLED=true`: ensaio de restore, SDD-024 §9 com `/security-review`, domínio, opções do MCP (TL-42, TL-47). Depois de cadastrar o `client_id` do Claude, rodar `sec010-revalidate-mcp-clients.ts` | Gestor |

**Divergências docs x código (código vence):**
1. Checklist (§1.7) diz que o `backup.yml` aponta para `DATABASE_PUBLIC_URL` (Railway). O atual usa `DATABASE_DIRECT_URL`.
2. Checklist (§2) manda criar `DIRECT_URL` "se não existir". Ela é opcional (código deriva).
3. Checklist (§3) cita `MCP_CIMD_ALLOWED_HOSTS`. É ignorada pelo código (SEC-010); só `MCP_CIMD_ALLOWED_CLIENT_IDS` vale.
4. Checklist (blocos 5 e 6 e §7.1) trata a EN-007 como pendente. O código existe; falta só o painel.
5. Checklist (§9.2) confirma o nome do teto de IA no SDD-028: é `LLM_GLOBAL_MONTHLY_CAP_CENTS`.
6. Railway (`railway.json`, `preDeployCommand`, `DATABASE_PUBLIC_URL`) está superado por ADR-031. ADR-005 e ADR-026 na parte de hospedagem também.

## e) Riscos em aberto
ADR-031 §12: código tratado para os riscos 1, 2, 4, 7 e 8. Abertos até o painel e o ensaio: 3 (backup sem restore testado), 5 (escopos e previews) e 6 (`regions`). Segurança de produção (SEC-005, HSTS, SEC-036): [seguranca.md](seguranca.md) §d.

## f) Mapa de fontes
Código: `scripts/{vercel-build.mjs,backup.sh,smoke-prod.sh}`, `vercel.json`, `.github/workflows/backup.yml`, `prisma.config.ts`, `src/lib/{db-url,db,env}.ts`, `src/instrumentation.ts`, `src/lib/auth/dev-login-guard.ts`, `src/modules/{health/check-health,cron/purge,ia/config,mcp/config}.ts`, `src/app/api/{health,cron/purge}/route.ts`, `src/proxy.ts`.
Testes: unidade 32 e integração 3 da TASK-064.
Docs: [ADR-031](../tech-lead/adrs/ADR-031-producao-vercel-prisma-postgres.md), [producao.md](../tech-lead/architecture/producao.md), [EN-007](../product-owner/backlog/stories/EN-007-hospedagem-vercel-prisma-postgres.md), [tasks-board.md](../developer/tasks/tasks-board.md) (TASK-055, TASK-064), [checklist](../manager/checklist-vercel-producao.md).
