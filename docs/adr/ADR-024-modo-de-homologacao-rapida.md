# ADR-024 — Modo de homologação rápida (build de produção + login de teste)

**Status:** aceito (revisão 2, por conta e risco do usuário; emenda ADR-008) · **Data:** 2026-10-06 · **Autor:** usuário

## Contexto
Na máquina de teste, `next dev` compila sob demanda (`/login` ~2,2 s) e o build de produção responde em ~15 ms; porém o ADR-008 desliga o login de teste com `NODE_ENV=production`, e a homologação usa justamente "Entrar como (teste)". A revisão 1 exigia bind local, banco local, URLs http privadas e Google vazio; o usuário decidiu enfraquecer essas travas para o ambiente local descartável, sem dados reais.

## Decisão
1. O login de teste liga em build de produção com `NODE_ENV=production` + `APP_HOMOLOG_MODE=true` + `AUTH_DEV_LOGIN=true`. Nada mais é exigido (Google real pode coexistir).
2. **Sem recusa:** a subida registra um aviso no log (`MODO DE HOMOLOGAÇÃO ATIVO: login de teste habilitado`, via `assertSafeAuthConfig`/`instrumentation.ts`).
3. Guarda por Host de `/api/dev/login` e `/api/dev/clock`: localhost ou o host de `APP_URL`/`AUTH_URL`. `/api/dev/clock` não tem efeito em produção (`APP_NOW_OVERRIDE` ignorada).
4. **Inalterado (proteção da produção real):** `NODE_ENV=production` **sem** `APP_HOMOLOG_MODE` recusa subir com `AUTH_DEV_LOGIN=true`.
5. Conveniência: `pnpm homolog:build` / `pnpm homolog:start` (`scripts/homolog.mjs`; build em `.next-homolog/`, porta 3100, `http://127.0.0.1:<porta>`).

## Consequências
- **Regra de ouro:** `APP_HOMOLOG_MODE` e `AUTH_DEV_LOGIN` nunca entram em configuração de produção (variáveis, secrets, `.env` de deploy, imagem); a pipeline de produção deve falhar se existirem (ADR-005).
- Risco residual aceito: com as duas flags, qualquer servidor (mesmo exposto) aceita login sem senha para qualquer e-mail; a única barreira é a flag explícita.
- Cada mudança de código exige novo `pnpm homolog:build`; desenvolvimento segue com `pnpm dev`.
