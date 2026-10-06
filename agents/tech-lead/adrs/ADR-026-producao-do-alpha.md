# ADR-026: Produção do alpha (v0) — PaaS único, Postgres gerenciado e travas automáticas

## Status
Aceito (Tech Lead), 2026-10-05. **Substitui o [ADR-005](ADR-005-hospedagem-producao-adiada.md)** (hospedagem adiada). Não altera o ADR-024: o modo de homologação continua só local e passa a ser **impossível** na imagem de produção.

## Contexto
A v0 alpha vai a produção para uma família (2–4 usuários), com dados reais. Prioridades: simples, barato, reversível, sem login de teste e com backup restaurável. A app já gera `output: "standalone"` e tem `/api/health` (200/503).

## Decisão
1. **Plataforma**: **Railway** (plano Hobby, ~US$ 5/mês de uso): um serviço web a partir do `Dockerfile` do repositório + **Postgres gerenciado** do próprio Railway na mesma rede privada; domínio `*.up.railway.app` com TLS (domínio próprio opcional). Alternativa equivalente se o usuário preferir: Render (web + Postgres pago, mesmos passos). Fly descartado (Postgres não gerenciado).
2. **Imagem**: `Dockerfile` multi-stage (Node 22 alpine, `pnpm install --frozen-lockfile`, `prisma generate`, `next build`), estágio final só com `.next/standalone`, `.next/static`, `public`, `prisma/` e o CLI do Prisma; usuário não root; `CMD ["node","server.js"]`; **`ENV APP_DEPLOY_ENV=production` gravado na imagem**.
3. **Migração no release**: *pre-deploy command* do Railway = `pnpm prisma migrate deploy` (falha ⇒ deploy não sobe; a versão anterior continua no ar). Healthcheck do Railway em `/api/health`.
4. **Segredos só no provedor** (variáveis do serviço): `DATABASE_URL` (referência ao Postgres), `AUTH_SECRET`, `AUTH_URL`/`APP_URL` (URL pública), `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `APP_TIMEZONE=America/Sao_Paulo`, SMTP se houver. Nada em `.env` versionado; `.dockerignore` exclui `.env*`.
5. **Trava automática contra login de teste** (camada nova, independente de variável esquecida): com `APP_DEPLOY_ENV=production`, a **presença** (qualquer valor) de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE`:
   - faz `assertSafeAuthConfig` lançar no `register()` do `instrumentation.ts` (o processo não sobe);
   - faz `isDevLoginEnabled`/`isDevToolingEnabled`/`isHomologModeActive` retornarem `false`;
   - faz `checkHealth` responder **503 `unsafe_config`** (o deploy falha no healthcheck mesmo se o boot fosse contornado).
   Testes obrigatórios: unidade (matriz de env), e o *smoke* pós-deploy `scripts/smoke-prod.sh <url>`: `/api/health` 200; `POST /api/dev/login` 404; `/login` sem "Entrar como (teste)"; `GET /api/auth/session` sem as chaves `sessionToken` e `userId`.
6. **`/api/auth/session` vaza o token (verificado)**: com `strategy: "database"`, o Auth.js 5 (`@auth/core` 0.41.3, `lib/actions/session.js`) chama `callbacks.session({ session: { ...session, user } })`, onde `session` é a linha do adaptador (`sessionToken`, `userId`, `expires`). O callback atual em `src/lib/auth/config.ts` faz `({ ...session, user: {...} })` e **devolve o `sessionToken` no JSON**. Correção (TASK do lote P): retornar apenas `{ expires: session.expires, user: { id: user.id, name: user.name, email: user.email, image: user.image } }`. Teste de integração do callback + o *smoke* acima. Severidade: média (o cookie já é `HttpOnly`, mas o token exposto a JS anula essa proteção em caso de XSS).
7. **Backup**: (a) backup do Postgres do Railway habilitado na UI (snapshots do volume); (b) **`pg_dump -Fc` semanal** por workflow agendado do GitHub Actions (`.github/workflows/backup.yml`, domingo 03:00 BRT), usando `DATABASE_PUBLIC_URL` como segredo do repositório, arquivo criptografado com `gpg --symmetric` (senha em segredo) e guardado como artefato com retenção de 35 dias; sem GitHub, o mesmo `scripts/backup.sh` roda manualmente. **Restore** (roteiro em `agents/tech-lead/architecture/producao.md`, a criar no lote P): baixar o artefato ⇒ `gpg -d` ⇒ `pg_restore --clean --if-exists --no-owner -d "$DATABASE_PUBLIC_URL"`; **ensaio de restore obrigatório** num Postgres local antes do go-live.
8. **EN-002 (ADR-021)**: as migrações R3-A sobem junto; a janela de reversão de ≥ 7 dias começa no primeiro deploy. US-042 continua bloqueada até lá.

## O que só o usuário faz (passos curtos)
1. Criar conta no **Railway** (login com GitHub) e um projeto; adicionar **Postgres** e um serviço a partir do repositório (ou `railway up`). Ativar backups do Postgres.
2. Gerar `AUTH_SECRET` (`openssl rand -base64 32`) e colar nas variáveis do serviço, com as demais do item 4 (o Dev entrega a lista exata).
3. **Google Cloud Console**: criar projeto ⇒ tela de consentimento "Externo", status **Testing**, adicionar os e-mails da família como *test users* ⇒ credencial **OAuth Client ID (Web)** com *redirect URI* `https://<url-publica>/api/auth/callback/google` e origem `https://<url-publica>` ⇒ copiar ID e segredo para o Railway.
4. (Opcional) SMTP para convites (ex.: Brevo/Resend, plano gratuito) ⇒ variáveis `SMTP_*`/`MAIL_FROM`.
5. (Se usar o backup do item 7b) criar no GitHub os segredos `DATABASE_PUBLIC_URL` e `BACKUP_PASSPHRASE`; guardar a senha fora do repositório.
6. Após o primeiro deploy: rodar o *smoke* com o Dev e fazer o 1º login Google.

## Consequências
- (+) Um provedor, um painel, custo baixo; deploy = push; migração atômica com o release.
- (+) Login de teste fica impossível em produção por três barreiras automáticas (imagem, boot, healthcheck).
- (−) Dependência do Railway; mitigada por Dockerfile portátil e `pg_dump` fora do provedor.
- (−) App do Google em "Testing" limita a usuários cadastrados (desejado no alpha).
