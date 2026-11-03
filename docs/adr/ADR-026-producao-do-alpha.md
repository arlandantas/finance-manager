# ADR-026 — Produção do alpha (v0): PaaS único, Postgres gerenciado e travas automáticas

**Status:** substituído por ADR-031 na escolha de provedor (Railway não é usado); travas e smoke seguem vigentes, adaptados · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
A v0 alpha vai a produção para uma família (2–4 usuários) com dados reais: simples, barato, reversível, sem login de teste e com backup restaurável. Substituiu o ADR-005.

## Decisão
1. Imagem `Dockerfile` multi-stage (Node 22 alpine, `output: "standalone"`), usuário não root, **`ENV APP_DEPLOY_ENV=production` gravado na imagem** (provedor original, Railway, trocado pelo ADR-031).
2. Migração no release (`prisma migrate deploy`); falha ⇒ deploy não sobe. Healthcheck em `/api/health`. Segredos só no provedor; `.dockerignore` exclui `.env*`.
3. **Trava automática contra login de teste:** com `APP_DEPLOY_ENV=production`, a **presença** (qualquer valor) de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE`: (a) `assertSafeAuthConfig` lança no `register()` do `instrumentation.ts`; (b) `isDevLoginEnabled`/`isDevToolingEnabled`/`isHomologModeActive` retornam `false`; (c) `checkHealth` responde **503 `unsafe_config`**.
4. **Smoke pós-deploy** (`scripts/smoke-prod.sh <url>`): `/api/health` 200; `POST /api/dev/login` 404; `/login` sem "Entrar como (teste)"; `GET /api/auth/session` sem `sessionToken` e `userId`.
5. **`/api/auth/session` não pode vazar o token:** com sessão em banco, o callback `session` recebe a linha do adaptador; deve retornar apenas `{ expires, user: { id, name, email, image } }`, com teste de integração.
6. **Backup:** `pg_dump -Fc` semanal fora do provedor, criptografado (`gpg --symmetric`), retenção de 35 dias; **ensaio de restore obrigatório** antes do go-live.
7. Migrações R3-A (EN-002, ADR-021) sobem junto; janela de reversão ≥ 7 dias começa no primeiro deploy.

## Consequências
- Login de teste fica impossível em produção por três barreiras (imagem, boot, healthcheck).
- App Google em modo "Testing" limita a usuários cadastrados (desejado no alpha).
