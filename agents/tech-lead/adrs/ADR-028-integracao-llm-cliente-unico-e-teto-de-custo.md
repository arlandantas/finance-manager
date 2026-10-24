# ADR-028: Integração com LLM — cliente único da API Anthropic no servidor, modelo por finalidade, teto de custo por família e provedor simulado

## Status
Aceito (Tech Lead), 2026-10-24. Base do [SDD-021](../sdd/SDD-021-infra-llm-en-004.md) (EN-004) e usado pelo [SDD-023](../sdd/SDD-023-analise-de-gastos-evitaveis.md). Complementado pelo [ADR-029](ADR-029-privacidade-e-anonimizacao-para-llm.md) (o que pode ser enviado). Rastreabilidade: NEED-026 §4, NEED-027 (RN-027.5, 027.7) · EN-004 · D-PO-57 · **D-GES-27** (chave única do app; teto **configurável, valor pendente**), D-GES-28 (importação na R5), D-GES-29.

## Contexto
A R4 introduz a primeira dependência externa paga e com dado financeiro: a API da Anthropic. Precisamos de: um só ponto de saída (para auditar privacidade e custo), testes que **nunca** chamam a rede, custo previsível com teto por família cujo **valor ainda não foi definido pelo usuário**, falhas traduzidas em mensagens neutras e nenhum vazamento de chave ou conteúdo em log. A primeira (e por ora única) finalidade é a **análise de gastos** sobre agregados (US-070); a importação de fatura foi adiada (R5) e o MCP não usa a chave do app (D-PO-66).

## Decisão

### 1. Cliente único atrás de uma porta (`LlmPort`)
- Módulo `src/modules/ia/` com `import "server-only"`. **Só** `src/modules/ia/anthropic-adapter.ts` importa `@anthropic-ai/sdk` (regra nova no `check:imports` + teste); nenhuma rota, serviço de domínio ou componente fala com o SDK.
- `LlmPort.generate({ purpose, system, input, outputSchema, signal })` devolve `{ data, usage }` com `data` **já validado** pelo schema Zod de saída. Duas implementações: `AnthropicLlmAdapter` (SDK oficial `@anthropic-ai/sdk`, versão fixada no lockfile) e `FakeLlmAdapter` (determinístico, por cenário). A troca é por configuração, sem mudar histórias.
- **Sem ferramentas** em nenhuma chamada (campo `tools` ausente): a LLM só devolve dados; não grava, não consulta, não navega.

### 2. Modelo por finalidade, configurável por ambiente — o menor capaz
| Finalidade | Variável | Padrão | Critério |
| :-- | :-- | :-- | :-- |
| `ANALYSIS` (US-070) | `LLM_MODEL_ANALYSIS` | **`claude-haiku-5-5`**, `effort: low` | Tarefa curta de classificação/explicação sobre ~2–4 mil *tokens* de agregados; saída estruturada pequena. Haiku 5.5 é o menor modelo atual e custa ≈ 20× menos que o Sonnet 5.5. **Escalar para `claude-sonnet-5-5`** só se o teste "de ouro" manual (SDD-023 §8.4) mostrar classificação ruim em ≥ 2 de 10 casos de referência. |
| `INVOICE_EXTRACTION` (R5) | `LLM_MODEL_INVOICE` | — (não implementado) | Ver [parecer R5](../parecer-r5-importacao-local.md): provavelmente desnecessário. |
- IDs de modelo exatos (sem sufixo de data). Tabela de preços por modelo em código (`ia/pricing.ts`, US$/MTok de entrada e saída), sobrescrevível por `LLM_PRICES_JSON`; **modelo sem preço conhecido ⇒ o processo não sobe** (falha fechada, teste).
- Saída estruturada: `output_config.format` com JSON Schema gerado do Zod (`z.toJSONSchema`) **e** validação Zod do lado do servidor (a garantia é a nossa validação, não a do provedor). `stop_reason` ≠ `end_turn` (`max_tokens`, `refusal`, outros) ⇒ erro tratado; nada é gravado.

### 3. Chave e configuração
- `ANTHROPIC_API_KEY` **só** em variável de ambiente do servidor (Railway, ADR-026 §4). Nunca no cliente, em DTO, em log ou em mensagem de erro. Rotação = trocar a variável e reiniciar o serviço (sem deploy de código).
- `LLM_PROVIDER = fake | anthropic`. **Padrão `fake`** em dev, unidade, integração, E2E e homologação local. Com `NODE_ENV=test` ou `APP_HOMOLOG_MODE`, `anthropic` é **recusado** no boot (teste). Em produção (`APP_DEPLOY_ENV=production`) `fake` é recusado no boot **se** algum recurso de IA estiver habilitado por *feature flag* `AI_FEATURES_ENABLED=true`; sem a flag, as telas de IA mostram "Indisponível" e nenhuma chamada é possível (falha fechada).
- **Chave por família** (alternativa da Q-U08, descartada por D-GES-27): a porta recebe a credencial de um `CredentialResolver`; trocar para chave por família é implementar outro *resolver* + tela (+3 a 5 pts), sem tocar nas histórias. Não construir agora.

### 4. Falhas, tempo-limite e cancelamento
- SDK com `timeout: LLM_TIMEOUT_MS` (padrão **30 000 ms**, unidade **milissegundos** no SDK TS) e `maxRetries: LLM_MAX_RETRIES` (padrão **1**; o SDK só repete 408/409/429/5xx e falha de conexão). Prazo total por pedido `LLM_DEADLINE_MS` (padrão **60 000 ms**) via `AbortController`, combinado ao `request.signal` da rota: o usuário que cancela (fecha a tela/toca "Cancelar") aborta a chamada.
- Tradução fixa (o detalhe do provedor **nunca** chega ao usuário): indisponível/timeout/5xx/rede ⇒ `503 LLM_UNAVAILABLE` "Não foi possível usar a IA agora. Tente novamente em instantes"; 429 após retentativas ⇒ `503 LLM_UNAVAILABLE` (mesma mensagem; `Retry-After` interno só no log); resposta fora do schema, truncada ou recusada ⇒ `502 LLM_INVALID_RESPONSE` com a mesma mensagem neutra da história; 401/403 do provedor (chave inválida) ⇒ `503 LLM_UNAVAILABLE` + alerta de log `error` (é falha de operação, não do usuário).
- Toda falha **libera a reserva** de custo não consumida (SDD-021 §4.3) e não grava nada de domínio.

### 5. Teto de custo por família (valor **pendente**)
- Unidade interna: **micro-reais inteiros** (`BigInt`, 1 R$ = 1 000 000), para não perder frações de centavo de chamadas baratas; exibição em centavos **arredondando para cima**. Conversão US$→R$ por taxa **fixa e conservadora** `LLM_USD_BRL_RATE` (ex.: 6,00), revisada manualmente.
- Teto mensal: `LLM_MONTHLY_CAP_CENTS` (padrão do ambiente) e, opcionalmente, `families.aiMonthlyCapCents` (sobrescrita por família, só por *script* administrativo; sem UI). **Sem valor configurado em produção ⇒ IA bloqueada** (`LLM_BUDGET_NOT_CONFIGURED`), nunca "sem teto". Em dev/test, padrão R$ 10,00.
- Mês do contador = **mês civil em `America/Sao_Paulo`** (não o `cutDay`): "Volta a liberar em 01/12/2026".
- **Reserva antes, acerto depois** (atômico): antes de chamar, reserva-se o custo **máximo** estimado (entrada estimada localmente + `max_tokens` de saída × preço) numa linha `llm_budget_months (familyId, month)` travada `FOR UPDATE`; se `gasto + reservado + estimativa > teto` ⇒ `422 LLM_BUDGET_EXCEEDED` **sem chamar o provedor**. Depois, o custo real (`usage` do provedor) substitui a reserva. Duas chamadas simultâneas não ultrapassam o teto (a soma das reservas já conta). Reserva órfã (processo morreu) expira em 10 min e é **contada como gasta** (conservador).
- A estimativa de entrada é **local** (bytes do payload ÷ 3, arredondado para cima, + *tokens* fixos do prompt medidos em teste), não `count_tokens` — que seria um envio de dados extra ao provedor.
- Limites adicionais: ≤ `ANALYSIS_MAX_PER_PERIOD` (padrão 3) análises por período de referência e família; payload ≤ 32 KB.

### 6. Observabilidade sem dados
- Log (pino) por chamada: `requestId`, `familyId`, `purpose`, `model`, `outcome` (`ok|budget|timeout|unavailable|invalid|refused|cancelled`), `latencyMs`, `inputTokens`, `outputTokens`, `costMicroBrl`, `attempts`. **Nunca**: prompt, payload, resposta, texto de erro bruto do provedor, cabeçalhos. `redact` do pino cobre `*.apiKey`, `*.authorization`, `*.x-api-key`, `*.input`, `*.system`, `*.content`. Log do SDK desligado (`logLevel: "off"`).
- Tabela `llm_usage_events` (SDD-021 §5) é o registro de consumo: mesmos campos do log, sem conteúdo.
- Teste obrigatório: captura do logger durante chamadas (sucesso e cada falha) não contém nenhuma *string* do payload nem do resultado, nem a chave.

### 7. Provedor simulado e testes
- `FakeLlmAdapter` escolhe a resposta por **cenário** (`ok`, `invalid_json`, `schema_violation`, `numbers_in_text`, `member_name_in_text`, `unknown_ids`, `truncated`, `refusal`, `unavailable`, `timeout`, `rate_limited`), registra o `input` recebido (para os testes de privacidade) e devolve `usage` fixo. O cenário vem de configuração de teste; no E2E, de rota de desenvolvimento protegida pelas mesmas 3 camadas do dev-login (ADR-008, ADR-026 §5).
- **A suíte nunca depende de rede nem de chave**: teste que falha se `ANTHROPIC_API_KEY` estiver definida com `LLM_PROVIDER` ≠ `fake` sob `vitest`/Playwright.
- Teste "de ouro" **manual e fora do CI** (`pnpm ai:golden`), com chave de teste e orçamento ≤ US$ 0,10 por execução, para detectar mudança de formato do provedor e calibrar a escolha do modelo.

## Alternativas descartadas
- **Chamar o SDK direto das rotas**: espalha chave, custo e logs; impossível provar a privacidade.
- **Sonnet/Opus como padrão**: custo 20–40× maior sem ganho medido numa tarefa pequena sobre agregados (regra 6 do `AGENTS.md`: menor modelo capaz).
- **Contador de custo sem reserva** (somar só depois): duas chamadas simultâneas ultrapassam o teto.
- **`count_tokens` para estimar**: é uma chamada adicional com os mesmos dados.
- **Retentativas agressivas** (≥ 3): multiplica latência e custo; 1 basta para falhas transitórias.

## Consequências
- Nova dependência `@anthropic-ai/sdk` (instalada na EN-004). `pendencias-externas.md` do Gestor deve ganhar: conta Anthropic + chave de produção + limite de gasto na própria console da Anthropic (defesa em profundidade) e revisão dos termos de retenção (ver ADR-029).
- Variáveis novas documentadas em `architecture/producao.md` quando a EN-004 for implementada.
- A importação de fatura (R5) e quaisquer finalidades futuras usam a mesma porta, teto e registro.
