# Produção: situação e roteiro

## 0. Situação atual (verificável no repositório; o resto fica a confirmar)
- Em produção na Vercel: https://verbus-finance.vercel.app/ (informado pelo usuário; domínio também em `AUTH_URL`/smoke). Banco: Prisma Postgres provisionado dentro da Vercel (ADR-031).
- Runtime: Node 26 em produção desde 2026-11-08 (`engines` `>=26 <27`, `.nvmrc` 26, `Dockerfile` `node:26-alpine`; ADR-044, US-102). Deploy e `scripts/smoke-prod.sh` (`SMOKE OK`) confirmados pelo usuário. Se houver erro de `fetch` externo, `VERCEL_FETCH_DISABLE_H2=1`.
- Migrações: `vercel-build` (`scripts/vercel-build.mjs`) roda `prisma generate`, `prisma migrate deploy` só com `VERCEL_ENV=production` e `next build`. O CLI usa a URL direta (`prisma.config.ts` + `src/lib/db-url.ts`); o app usa a pooled.
- Cron: `vercel.json` agenda `/api/cron/purge` (`0 7 * * *`), autenticado por `CRON_SECRET`. Backup: `.github/workflows/backup.yml` (manual).
- A confirmar com o usuário: variáveis realmente definidas (só nomes, seção 1); migrações já aplicadas em produção; região do banco e `regions`; backup/restore ensaiado; `scripts/smoke-prod.sh` rodado; previews desligados.


## 0.1 Migração para Node 26: concluída em 2026-11-08
Push na `main`, deploy e smoke OK (confirmado pelo usuário). Resta só observar os logs e, ao ligar a IA (§7), conferir a primeira chamada externa (HTTP/2 do `fetch`).

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

## 7. Ligar a IA (Anthropic): roteiro do usuário
Nenhuma chave é criada pelo agente: conta, cobrança e chave são suas (nunca cole a chave em chat, commit ou doc). Spec 06a, ADR-028/042, EXT-12.
1. [ ] console.anthropic.com: criar/entrar na conta da organização e ativar cobrança (créditos pré-pagos; comece com pouco, ex.: US$ 10).
2. [ ] Settings > Limits: definir limite de gasto mensal baixo (ex.: US$ 10) como segunda trava, além dos tetos do app.
3. [ ] Settings > API keys > Create key, workspace dedicado, nome `finance-manager-prod`. Copie na hora (aparece uma vez) e guarde no gerenciador de senhas.
4. [ ] Vercel > Settings > Environment Variables, escopo SÓ Production (marque Sensitive na chave): `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`, `LLM_GLOBAL_MONTHLY_CAP_CENTS=5000`, `OPS_ALERT_EMAIL=<seu e-mail>`, `AI_FEATURES_ENABLED=true`. Opcionais: `LLM_MONTHLY_CAP_CENTS` (por família, padrão 500), `LLM_MODEL_ANALYSIS`/`LLM_MODEL_IMPORT` (padrão `claude-haiku-5-5`).
5. [ ] O alarme dos tetos (50/80/100%) vai por e-mail: sem SMTP real (§6) fica só no log. Configure o SMTP antes ou confie no log da Vercel.
6. [ ] Redeploy (variáveis só valem em novo deploy). Sem `OPS_ALERT_EMAIL` ou teto global o boot falha de propósito (spec 06a, regra 3): leia o erro do build.
7. [ ] No app (Administrador): Família > IA e privacidade, ligue a finalidade e confirme o texto vigente (consentimento por família). Rode uma análise pequena e confira o consumo (console Anthropic e uso no app).
8. [ ] Importação de PDF (opcional): `INVOICE_IMPORT_ENABLED=true`; o PDF envia a descrição do estabelecimento à Anthropic (ADR-042 §4): aceite explícito seu; valide com uma fatura real.
9. [ ] Algo errado: remova `AI_FEATURES_ENABLED` (ou ponha `false`), redeploy, e revogue a chave no console se houver suspeita de vazamento.
Pendência de desenvolvimento: `pnpm ai:golden` (D-GES-34, SDD-023 §8.4) ainda não existe em `package.json`; era pré-requisito de ligar a IA. Decida se liga assim mesmo ou se vira história.
