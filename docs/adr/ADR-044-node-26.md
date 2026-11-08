# ADR-044 — Runtime Node 26 (substitui o Node 22 de ADR-001/ADR-026)

**Status:** aceito · **Data:** 2026-11-08 · **Autor:** usuário (versão-alvo) / builder

## Contexto
Produção e dev rodavam Node 22 (ADR-001, ADR-026). O usuário decidiu migrar para Node 26 (LTS desde 2026-10-28), em vez do 24. ADR-001/ADR-026 ficam como histórico.

## Decisão
- Alvo: Node 26. `engines.node` `>=26 <27`, `.nvmrc` 26, `Dockerfile` `node:26-alpine`, `@types/node` ^26.
- Risco: o `fetch` global (Undici 8) negocia HTTP/2. Servidor que só fale HTTP/1.1 corretamente pode falhar. Desvio, se ocorrer em produção: variável `VERCEL_FETCH_DISABLE_H2=1` (Vercel), sem mudar código.
- Achado (grep em `src`, sem chamar APIs reais): nada depende de HTTP/1.1.
  - LLM: SDK `@anthropic-ai/sdk` usa o `fetch` global contra `api.anthropic.com` (aceita HTTP/2).
  - OAuth: Auth.js (Google) usa `fetch` global; o Google fala HTTP/2.
  - E-mail: `nodemailer` usa `net`/`tls` (SMTP), fora do `fetch`.
  - MCP: só entrada (handler recebe requisições); não há cliente MCP de saída.
  - `fetch(` em `src/lib/http.ts` e nos componentes: mesma origem, a partir do browser.
- Suítes (lint, typecheck, unit, int, E2E) rodaram em Node 26 (ver STATE).

## Consequências
- Quem usa nvm precisa de `nvm install 26`. Imagem Docker muda de base.
- Vercel Project Settings > Node.js Version = 26 é ação do usuário (AC3), e o smoke de produção após o deploy (AC5).
- Se o smoke acusar erro de rede externa (Anthropic, Google), tentar `VERCEL_FETCH_DISABLE_H2=1` antes de reverter para 24.
