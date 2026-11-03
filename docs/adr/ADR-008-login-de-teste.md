# ADR-008 — Login de teste (dev-login) com sessão em banco

**Status:** aceito (complementa ADR-002; emendado pelo ADR-024) · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
O login Google exige credenciais externas; o time precisa de login local e E2E determinístico. Auth.js v5 não suporta `Credentials` com sessão em banco, e o ADR-002 fixa sessão em banco (D-GES-11).

## Decisão
1. **Sem provider Credentials.** Route Handler próprio `POST /api/dev/login`: upsert do `User` (e-mail em minúsculas, `emailVerified = now()`), cria `Session` (token de 32 bytes) e seta o cookie com mesmo nome e atributos do Auth.js (`authjs.session-token`). O resto do sistema usa o mesmo caminho de sessão.
2. Ativo só se `AUTH_DEV_LOGIN === "true"` **e** `NODE_ENV !== "production"`.
3. Três camadas: (a) handler responde 404 vazio quando desativado; (b) `instrumentation.ts` aborta a inicialização se produção + flag; (c) UI e módulo só entram no bundle com a flag ativa.
4. Aceita apenas `Host` `localhost`/`127.0.0.1`/`[::1]`/`*.localhost` (senão 403).
5. E2E usa `loginAs(page, {email, name})`; o caminho real do Google é coberto por testes de integração do callback `signIn` com perfis simulados.
6. Provider Google só é registrado com `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` preenchidos.

## Consequências
- Sem senhas nem segredo externo; E2E rápido. Risco de vazar para produção mitigado por três camadas e teste automatizado.
- ADR-024: com `APP_HOMOLOG_MODE=true` + `AUTH_DEV_LOGIN=true` o build de produção local sobe com aviso no log; sem `APP_HOMOLOG_MODE`, a camada (b) continua recusando.
