# ADR-028 — Integração com LLM: cliente único, modelo por finalidade, teto de custo e provedor simulado

**Status:** aceito (complementado pelo ADR-029) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
A API da Anthropic é a primeira dependência externa paga com dado financeiro. Precisa de um único ponto de saída (auditar privacidade e custo), testes sem rede, teto de custo por família (D-GES-27; valor pendente) e nenhum vazamento de chave ou conteúdo em log.

## Decisão
1. **Porta `LlmPort`** em `src/modules/ia/` (`server-only`); **só** `anthropic-adapter.ts` importa `@anthropic-ai/sdk` (regra no `check:imports`). `generate({ purpose, system, input, outputSchema, signal })` devolve `data` já validado por Zod. Implementações: `AnthropicLlmAdapter` e `FakeLlmAdapter`. **Sem ferramentas** em nenhuma chamada.
2. **Modelo por finalidade, o menor capaz:** `ANALYSIS` usa `claude-haiku-5-5` (`LLM_MODEL_ANALYSIS`), escalando para Sonnet só se o teste de ouro manual falhar em ≥ 2 de 10 casos. Modelo sem preço em `ia/pricing.ts` ⇒ processo não sobe. Saída estruturada com JSON Schema do Zod **e** validação Zod no servidor; `stop_reason` ≠ `end_turn` ⇒ erro, nada é gravado.
3. **Chave:** `ANTHROPIC_API_KEY` só em variável de ambiente do servidor; nunca em cliente, DTO, log ou erro. `LLM_PROVIDER = fake | anthropic` (padrão `fake`); `anthropic` é recusado com `NODE_ENV=test` ou `APP_HOMOLOG_MODE`. Em produção, `AI_FEATURES_ENABLED` desligada ⇒ telas de IA "Indisponível" (falha fechada).
4. **Falhas:** timeout 30 s, 1 retentativa, prazo total 60 s, cancelável pelo `request.signal`. Tradução fixa: indisponível/timeout/5xx/429/401/403 ⇒ `503 LLM_UNAVAILABLE`; resposta inválida/truncada/recusada ⇒ `502 LLM_INVALID_RESPONSE`, sempre com mensagem neutra. Falha libera a reserva de custo e não grava nada.
5. **Teto de custo por família:** unidade interna micro-reais (`BigInt`), US$→R$ por `LLM_USD_BRL_RATE` fixa. Teto `LLM_MONTHLY_CAP_CENTS` (inicial R$ 5,00 por família/mês, D-GES-32; sobrescrita por `families.aiMonthlyCapCents`); **sem teto configurado em produção ⇒ IA bloqueada**. Mês civil em `America/Sao_Paulo`. **Reserva antes, acerto depois**, em `llm_budget_months` com `FOR UPDATE`; excedeu ⇒ `422 LLM_BUDGET_EXCEEDED` sem chamar o provedor; reserva órfã expira em 10 min e conta como gasta. Estimativa de entrada local (sem `count_tokens`). Máx. 3 análises por período e família; payload ≤ 32 KB.
6. **Observabilidade sem dados:** log por chamada só com metadados (modelo, outcome, latência, tokens, custo); **nunca** prompt, payload, resposta, erro bruto ou cabeçalhos (`redact` do pino; log do SDK desligado). Tabela `llm_usage_events` sem conteúdo. Teste de captura do logger.
7. **Testes:** `FakeLlmAdapter` por cenário (ok, JSON inválido, truncado, recusa, indisponível, timeout, limite). A suíte nunca depende de rede nem de chave. Teste de ouro manual fora do CI (`pnpm ai:golden`, ≤ US$ 0,10).

## Consequências
- Descartados: SDK direto nas rotas, Sonnet/Opus como padrão, contador sem reserva, retentativas agressivas, chave por família (via `CredentialResolver` se um dia necessário).
- Pendência externa: conta Anthropic, chave de produção e limite de gasto na console.
