# Produção: situação e roteiro

## 0. Situação atual (verificável no repositório; o resto fica a confirmar)
- Em produção na Vercel: https://verbus-finance.vercel.app/ (informado pelo usuário; domínio também em `AUTH_URL`/smoke). Banco: Prisma Postgres provisionado dentro da Vercel (ADR-031).
- Runtime: alvo Node 26 no repositório (`engines` `>=26 <27`, `.nvmrc` 26, `Dockerfile` `node:26-alpine`; ADR-044, US-102). Pendente do usuário: AC3 (Vercel Project Settings > Node.js Version = 26) e AC5 (`scripts/smoke-prod.sh` com `SMOKE OK` após o deploy). Se houver erro de `fetch` externo, `VERCEL_FETCH_DISABLE_H2=1`.
- Migrações: `vercel-build` (`scripts/vercel-build.mjs`) roda `prisma generate`, `prisma migrate deploy` só com `VERCEL_ENV=production` e `next build`. O CLI usa a URL direta (`prisma.config.ts` + `src/lib/db-url.ts`); o app usa a pooled.
- Cron: `vercel.json` agenda `/api/cron/purge` (`0 7 * * *`), autenticado por `CRON_SECRET`. Backup: `.github/workflows/backup.yml` (manual).
- A confirmar com o usuário: versão de Node em Vercel Project Settings; variáveis realmente definidas (só nomes, seção 1); migrações já aplicadas em produção; região do banco e `regions`; backup/restore ensaiado; `scripts/smoke-prod.sh` rodado; previews desligados.


## 0.1 Checklist do usuário: subir a US-102 (Node 26) para produção
Marque na ordem; nada disto o agente faz (push, deploy e Vercel são seus).
1. [ ] Vercel > Project > Settings > Build and Deployment > Node.js Version = `26.x`. O `engines` (`>=26 <27`) já manda no build; a configuração deixa o painel coerente.
2. [ ] (Opcional, recomendado) Testar antes num preview: `git push` de uma branch, abrir o preview e fazer login e uma tela com dados. Previews não levam segredos (seção 1); sem login possível, teste direto em produção com o rollback à mão.
3. [ ] Conferir o backup recente (seção 2) antes do deploy; o `engines` novo não muda o banco, mas é o ponto de retorno.
4. [ ] `git push` na `main` (há commits locais não enviados) ou `vercel --prod`; acompanhar o build: `prisma generate`, `migrate deploy` e `next build` em Node 26.
5. [ ] `scripts/smoke-prod.sh https://verbus-finance.vercel.app` deve imprimir `SMOKE OK`.
6. [ ] `/api/health` com `Authorization: Bearer $CRON_SECRET`: `database` ok e sem `unsafe_config`; logs da Vercel sem erro de runtime.
7. [ ] Login Google real; se a IA estiver ligada, uma chamada (o `fetch` agora usa HTTP/2 por padrão). Erro de rede externo: definir `VERCEL_FETCH_DISABLE_H2=1` em Production e refazer o deploy.
8. [ ] Algo errado: Deployments > Instant Rollback (o banco não muda; ver seção 5) e avisar o agente.
9. [ ] Ao concluir, dizer ao agente: ele fecha AC3 e AC5 da US-102 no STATE.
Depois, os itens "a confirmar" da seção 0 e, em produção, `pnpm migrate:split` (seção 3).

Vercel + Prisma Postgres (ADR-031, spec 11, ADR-041). Roteiro do 1º deploy (passos 1 a 6 abaixo, ainda valem para conferência). Tudo aqui é feito pelo usuário; nenhum segredo entra no repositório. Rode `pnpm check:docs && pnpm lint && pnpm typecheck && pnpm test` e `pnpm test:int` antes.

## 1. Variáveis (Vercel > Settings > Environment Variables, escopo só Production)
- Banco (integração Prisma da Vercel): `DATABASE_URL`; opcional `DIRECT_URL` (senão o CLI deriva a direta), `DB_POOL_MAX`.
- Ambiente: `APP_DEPLOY_ENV=production`, `APP_URL` e `AUTH_URL=https://verbus-finance.vercel.app`, `APP_TIMEZONE=America/Sao_Paulo`.
- Auth: `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (redirect autorizado `https://verbus-finance.vercel.app/api/auth/callback/google`).
- `CRON_SECRET` (>= 32 caracteres; a Vercel o envia como Bearer ao cron).
- Cadastro/LGPD: `ALLOWED_SIGNUP_EMAILS` (lista; vazia = aberto), `PRIVACY_CONTACT_EMAIL`.
- Opcionais: `MCP_ENABLED=false` (padrão), IA só depois (`AI_FEATURES_ENABLED`, `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LLM_GLOBAL_MONTHLY_CAP_CENTS=5000`, `OPS_ALERT_EMAIL`).
- NUNCA: `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` (health vira 503 `unsafe_config`).
- Preview: sem variáveis sensíveis; desligar previews ou ligar Deployment Protection.
- `vercel.json`: falta `regions` (igual à região do banco, ex.: `us-east-1` => `["iad1"]`). Decisão sua; só depois de ver a região no painel do Prisma.

## 2. Backup (antes de migrar)
1. GitHub > Settings > Secrets > Actions: `DATABASE_DIRECT_URL` (URL direta `db.prisma.io`, não a pooled) e `BACKUP_PASSPHRASE` (guarde também fora do GitHub).
2. Actions > backup-postgres > Run workflow; baixe o artefato e ensaie `gpg -d ... | pg_restore` num Postgres local. Registre a data.

## 3. Migrações (expand antes do código)
- `vercel-build` roda `prisma migrate deploy` só em `VERCEL_ENV=production`; falhou => build falha, versão anterior segue no ar.
- Pendentes em produção: `20261029*` até `20261108000200` (liste `prisma/migrations` e use as commitadas na versão que for ao ar) (tags, cartão pagador, membro sem conta, cores, previstas, assinaturas, transferências previstas, modo custom, split padrão, motor STORED). Todas expandem; o código antigo continua rodando.
- Antes: com `DIRECT_URL` de produção no shell, `pnpm exec prisma migrate status` (drift: avisar, nunca aplicar).
- Deploy de produção (merge/push em `main`, ou `vercel --prod`).
- A migração `20261108000200` só vira STORED as famílias LEGACY sem despesa comum. Para a família existente, com `DATABASE_URL` de produção: `pnpm migrate:split --dry-run` => se limpo, `pnpm migrate:split` => `pnpm migrate:split --verify` (deve sair sem problemas). Falha de gate (1 centavo) para a família e sai com código 1: pare e escale.
- Só depois de `--verify` limpo: história do CHECK `isSharedExpense=(splitMode<>NONE)` (ADR-041). Não antes.

## 4. Smoke e conferências
- `scripts/smoke-prod.sh https://verbus-finance.vercel.app` (health 200, login de teste 404, `/login` limpo, sessão sem `sessionToken`/`userId`, cron sem token 401). Deve imprimir `SMOKE OK`.
- `/api/health` com `Authorization: Bearer $CRON_SECRET` deve mostrar `database` ok e sem `unsafe_config`.
- Login Google real com e-mail da lista; criar/ver família; conferir o acerto da família migrada.

## 5. Rollback
- Código: Vercel > Deployments > Instant Rollback. Não reverte banco; as migrações são compatíveis com a versão anterior.
- Dados: restaurar o backup do passo 2 (`pg_restore`) só com decisão sua; é irreversível para o que veio depois.
- Motor de rateio: `pnpm migrate:split --engine LEGACY --family <id>` (só sem CUSTOM/parcela dividida).

## 6. Antes de divulgar
- SMTP real para convites (EN-006): `SMTP_HOST`, `SMTP_PORT` (465 = TLS implícito; 587 = STARTTLS), `SMTP_USER`, `SMTP_PASSWORD` (segredo, só na Vercel), `SMTP_SECURE=true` (opcional, força TLS implícito em outra porta), `MAIL_FROM` (remetente). Em produção, sem host real, usuário ou senha o envio falha citando só os nomes das variáveis; a senha nunca vai a log ou erro.
- No DNS do domínio do remetente: SPF, DKIM (do provedor) e DMARC (`p=none` e depois `quarantine`).
- `/privacidade` (US-082) com revisão jurídica e `PRIVACY_CONTACT_EMAIL` real; `ALLOWED_SIGNUP_EMAILS` preenchida.
- MCP/IA só ligam com restore testado, domínio definitivo e revisão (ver `docs/rules/seguranca-lgpd.md`).
