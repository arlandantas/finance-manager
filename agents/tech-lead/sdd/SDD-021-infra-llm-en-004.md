# SDD-021: Infra de LLM — cliente único, teto de custo e registro de consumo (EN-004)

- **História**: [EN-004](../../product-owner/backlog/stories/EN-004-infra-llm-chave-do-app-e-teto-de-custo.md) · **Fluxo**: [FLUXO-016](../../product-owner/flows/FLUXO-016-privacidade-e-consentimento-ia.md) §1 (bloco "Consumo do mês"), §4
- **Rastreabilidade**: NEED-026 §4, NEED-027 (RN-027.7) · RF44, RF45 · RN15, RN16 · D-PO-57 · D-GES-27 (teto **configurável, valor pendente**) · **[ADR-028](../adrs/ADR-028-integracao-llm-cliente-unico-e-teto-de-custo.md)** (leitura obrigatória) · [ADR-029](../adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md) · ADR-008/026 (travas de ambiente)
- **Depende de**: SDD-000 (`withApi`, erros, relógio), SDD-003 (papéis), ADR-026 (variáveis em produção). A EN-005 (SDD-022) é pré-requisito do **primeiro envio**, não desta infra.
- **Status**: **Aprovado para Desenvolvimento** (R4-B) · **Autor**: Agente Tech Lead · **Executor**: Dev & QA (Sonnet; o contador atômico está especificado)
- **Estimativa**: **8** (confirma o PO) — §9.

---

## 1. Gaps técnicos e decisões
| Gap | Resolução |
| :-- | :-- |
| Onde mora | `src/modules/ia/{port,anthropic-adapter,fake-adapter,pricing,budget,budget-repo,config,errors,run}.ts`; `server-only`; só o *adapter* importa o SDK (`check:imports`). |
| Uso pelas histórias | Uma função de orquestração `runLlm(tx-free, ctx, { purpose, payload, buildPrompt, outputSchema, signal })` (§4.4): consentimento ➜ reserva ➜ chamada ➜ validação ➜ acerto do custo. As histórias **não** chamam a porta diretamente. |
| Teto sem valor definido | `LLM_MONTHLY_CAP_CENTS` obrigatório em produção para usar IA; ausente ⇒ `503 LLM_BUDGET_NOT_CONFIGURED` ("A IA ainda não está disponível"). Dev/test: 1000. Sobrescrita por família `families.aiMonthlyCapCents` (nulo = padrão). |
| Unidade | Micro-reais `BigInt`; teto em centavos × 10 000; exibição `ceil(micro ÷ 10 000)` centavos. |
| Mês | `monthKeyIn("America/Sao_Paulo", clock.now())` = `YYYY-MM`; "volta a liberar" = 1º dia do mês seguinte. |
| Atomicidade | Reserva sob `FOR UPDATE` em `llm_budget_months` (linha criada com `INSERT … ON CONFLICT DO NOTHING` antes). |
| Reserva órfã | `expiresAt = now + 10 min`; leitura do saldo trata reservas vencidas como **gastas** (conservador); limpeza preguiçosa na próxima reserva converte-as em `ABANDONED` com custo = reserva. |
| Concorrência entre finalidades | Mesmo contador por família (teto único); `purpose` só no registro. |
| Membro comum | Não vê teto nem consumo (`GET /ai/usage` ⇒ `403 FORBIDDEN` para não-ADMIN); a mensagem de bloqueio mostra só a data de liberação. |
| Cancelamento | `signal` da rota ➜ `AbortController`; abortado ⇒ `outcome = cancelled`, reserva liberada **pelo custo real informado** se houver, senão a reserva inteira é mantida como gasta (o provedor pode ter cobrado) — conservador. |

---

## 2. Contratos (TypeScript / Zod 4)
```typescript
// src/modules/ia/port.ts
export type LlmPurpose = "SPENDING_ANALYSIS" | "INVOICE_IMPORT";
export type LlmUsage = { inputTokens: number; outputTokens: number; model: string };
export interface LlmPort {
  generate<T>(req: {
    purpose: LlmPurpose;
    system: string;                    // prompt fixo da finalidade (versionado no código)
    input: string;                     // JSON do payload JÁ validado (ADR-029); vai num bloco de usuário
    outputSchema: z.ZodType<T>;        // validado AQUI (o adapter chama outputSchema.safeParse)
    maxOutputTokens: number;
    model: string; effort: "low" | "medium" | "high";
    signal: AbortSignal;
  }): Promise<{ data: T; usage: LlmUsage }>;    // erros: LlmError (abaixo)
}
export type LlmErrorCode = "UNAVAILABLE" | "TIMEOUT" | "RATE_LIMITED" | "INVALID_RESPONSE" | "TRUNCATED" | "REFUSED" | "CANCELLED" | "AUTH";
export class LlmError extends Error { constructor(readonly code: LlmErrorCode, readonly usage?: LlmUsage) { super(code); } }

// src/modules/ia/config.ts (lido uma vez no boot; Zod sobre process.env)
export const LlmEnvSchema = z.object({
  LLM_PROVIDER: z.enum(["fake", "anthropic"]).default("fake"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_FEATURES_ENABLED: z.enum(["true", "false"]).default("false"),
  LLM_MODEL_ANALYSIS: z.string().default("claude-haiku-5-5"),
  LLM_EFFORT_ANALYSIS: z.enum(["low", "medium", "high"]).default("low"),
  LLM_MAX_OUTPUT_TOKENS_ANALYSIS: z.coerce.number().int().min(256).max(8000).default(3000),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LLM_DEADLINE_MS: z.coerce.number().int().min(1000).max(180000).default(60000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
  LLM_USD_BRL_RATE: z.coerce.number().positive().default(6),
  LLM_MONTHLY_CAP_CENTS: z.coerce.number().int().min(0).optional(),   // PENDENTE (Q-U10)
  LLM_PRICES_JSON: z.string().optional(),                             // {"model":{"inUsdPerMTok":n,"outUsdPerMTok":n}}
}).superRefine(/* regras de boot abaixo */);
// Regras de boot (assertLlmConfig, chamada em instrumentation.register):
//  - test/homolog: LLM_PROVIDER=anthropic ⇒ throw
//  - anthropic sem ANTHROPIC_API_KEY ⇒ throw
//  - production + AI_FEATURES_ENABLED=true + LLM_PROVIDER=fake ⇒ throw
//  - modelo configurado sem preço (pricing.ts ∪ LLM_PRICES_JSON) ⇒ throw

// src/modules/ia/pricing.ts (PURO)
export const DEFAULT_PRICES = {                              // US$ por milhão de tokens (tabela de 2026-10; revisar ao trocar modelo)
  "claude-haiku-5-5":  { inUsdPerMTok: 0.10, outUsdPerMTok: 0.50 },
  "claude-sonnet-5-5": { inUsdPerMTok: 2.00, outUsdPerMTok: 10.00 },
} as const;
export function costMicroBrl(u: { inputTokens: number; outputTokens: number }, p: Price, usdBrl: number): bigint; // ceil
export function estimateInputTokens(systemChars: number, inputBytes: number): number;  // ceil((systemChars + inputBytes) / 3) + 50
export function microToCentsCeil(micro: bigint): number;

// DTOs
export type AiUsageDTO = {                                   // GET /api/v1/ai/usage (ADMIN)
  month: string;                                             // "2026-11"
  capInCents: number | null;                                 // null = não configurado (IA indisponível)
  usedInCents: number;                                       // gasto + reservas vencidas, ceil
  remainingInCents: number | null;
  resetsOn: string;                                          // "2026-12-01"
  byPurpose: { purpose: LlmPurpose; usedInCents: number; calls: number }[];
};
```

---

## 3. Contratos de API e erros (todas `auth: "family"`)
| Rota | Quem | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/ai/usage` | ADMIN | `200 AiUsageDTO` | `403 FORBIDDEN` "Só o Administrador pode ver o consumo de IA" |
| (consumidas pelas histórias via `runLlm`) | — | — | ver tabela abaixo |

| Código | HTTP | Mensagem ao usuário | Quando |
| :-- | :-: | :-- | :-- |
| `AI_DISABLED` | 409 | (da finalidade) "A análise por IA está desligada nesta família" | consentimento não efetivo (SDD-022) |
| `AI_UNAVAILABLE` | 503 | "A IA ainda não está disponível" | `AI_FEATURES_ENABLED=false` ou teto não configurado (`LLM_BUDGET_NOT_CONFIGURED` no log) |
| `LLM_BUDGET_EXCEEDED` | 422 | "O limite de uso de IA deste mês foi atingido. Volta a liberar em {dd/mm/aaaa}" (`details.resetsOn`) | gasto ≥ teto |
| `LLM_ESTIMATE_EXCEEDS_BUDGET` | 422 | "Esta solicitação passaria do limite de uso de IA deste mês. Volta a liberar em {dd/mm/aaaa}" | gasto + reservas + estimativa > teto |
| `LLM_UNAVAILABLE` | 503 | "Não foi possível usar a IA agora. Tente novamente em instantes" (a história pode trocar por texto próprio, ex. US-070 "Não foi possível analisar agora…") | UNAVAILABLE, TIMEOUT, RATE_LIMITED, AUTH |
| `LLM_INVALID_RESPONSE` | 502 | mesma mensagem neutra | INVALID_RESPONSE, TRUNCATED, REFUSED |
| `LLM_CANCELLED` | 499 (só log; o cliente já saiu) | — | abortado |

---

## 4. Regras e algoritmos
### 4.1 `AnthropicLlmAdapter.generate`
```text
client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.LLM_TIMEOUT_MS, maxRetries: env.LLM_MAX_RETRIES, logLevel: "off" })   // uma instância por processo
res = client.messages.create({
  model, max_tokens: maxOutputTokens,
  output_config: { effort, format: { type: "json_schema", schema: z.toJSONSchema(outputSchema) } },
  system,                                  // estável ⇒ elegível a cache automático do provedor; sem timestamp
  messages: [{ role: "user", content: input }],
  // SEM tools, SEM tool_choice, SEM thinking.display (padrão omitted)
}, { signal })
stop_reason: "end_turn" ⇒ segue; "max_tokens" ⇒ TRUNCATED; "refusal" ⇒ REFUSED; outro ⇒ INVALID_RESPONSE
texto = concatenação dos blocos type === "text"; JSON.parse (falha ⇒ INVALID_RESPONSE); outputSchema.safeParse (falha ⇒ INVALID_RESPONSE)
erros do SDK por classe (nunca por mensagem): APIConnectionTimeoutError ⇒ TIMEOUT; RateLimitError ⇒ RATE_LIMITED; AuthenticationError/PermissionDeniedError ⇒ AUTH;
  APIUserAbortError ⇒ CANCELLED; InternalServerError/APIConnectionError/outros APIError ⇒ UNAVAILABLE
usage = { inputTokens: res.usage.input_tokens (+ cache_*), outputTokens: res.usage.output_tokens, model: res.model }
```
Os nomes exatos de classes/campos do SDK valem **pela versão instalada** (conferir no `node_modules/@anthropic-ai/sdk`); o contrato é a tradução acima.

### 4.2 `FakeLlmAdapter`
`new FakeLlmAdapter({ scenario, fixtures })`: registra `calls[]` (`{ purpose, system, input }`), devolve `fixtures[purpose][scenario]` validado pelo **mesmo** `outputSchema` (fixture inválida de propósito ⇒ `INVALID_RESPONSE`), `usage` fixo (`inputTokens 3000, outputTokens 1500`), `timeout`/`unavailable` lançam o `LlmError` correspondente; respeita `signal`. Em E2E o cenário é trocado por `POST /api/dev/llm-scenario` (só com as travas do dev-login; 404 em produção).

### 4.3 Orçamento (`budget.ts` + `budget-repo.ts`)
```text
reserve(tx, familyId, purpose, estimateMicro, now):           -- transação curta, SEPARADA da chamada ao provedor
  month = monthKeyIn(SP, now)
  INSERT INTO llm_budget_months (familyId, month) VALUES (…) ON CONFLICT DO NOTHING
  SELECT * FROM llm_budget_months WHERE familyId AND month FOR UPDATE
  cap = family.aiMonthlyCapCents ?? env.LLM_MONTHLY_CAP_CENTS  (null ⇒ AI_UNAVAILABLE)
  expiradas = eventos RESERVED com expiresAt < now ⇒ UPDATE status = ABANDONED, costMicroBrl = reservedMicroBrl;
              spentMicro += Σ; reservedMicro -= Σ
  if spentMicro ≥ cap×10⁴ ⇒ LLM_BUDGET_EXCEEDED
  if spentMicro + reservedMicro + estimateMicro > cap×10⁴ ⇒ LLM_ESTIMATE_EXCEEDS_BUDGET
  INSERT llm_usage_events { status RESERVED, reservedMicroBrl: estimateMicro, expiresAt: now+10min, … }
  reservedMicro += estimateMicro;  COMMIT
settle(eventId, outcome, usage?):                              -- transação curta após a chamada
  FOR UPDATE na linha do mês; evento RESERVED (se já ABANDONED, só grava os tokens: o gasto já foi contado)
  real = usage ? costMicroBrl(usage) : (outcome ∈ {cancelled} ? reserved : 0)
  status = outcome === ok ? SETTLED : FAILED;  spentMicro += real;  reservedMicro -= reserved
```
`estimateMicro = costMicroBrl({ inputTokens: estimateInputTokens(...), outputTokens: maxOutputTokens })` — o máximo possível de saída, logo o real **nunca** passa da reserva (teste por propriedade). Falha do provedor **antes** de qualquer *token* (conexão, 5xx sem `usage`) ⇒ custo 0.

### 4.4 `runLlm` (orquestração única)
1. `assertAiAvailable()` (flag + teto configurado).
2. `assertConsentEffective(tx, familyId, purpose)` **e** `reserve(...)` na **mesma** transação curta (consentimento `FOR SHARE`, ADR-029 §1).
3. Fora de transação: `port.generate(...)` com `AbortSignal.any([request.signal, AbortSignal.timeout(LLM_DEADLINE_MS)])`.
4. `settle(...)`; log único da chamada (ADR-028 §6); mapear `LlmError` ➜ erro HTTP da tabela §3.
5. Devolve `{ data, usageEventId }` para a história persistir o resultado (a história grava a análise numa transação própria, referenciando `usageEventId`).

---

## 5. Dados e migração (`en004_llm_consumo`)
```prisma
enum LlmPurpose { SPENDING_ANALYSIS INVOICE_IMPORT }
enum LlmUsageStatus { RESERVED SETTLED FAILED ABANDONED }
model LlmBudgetMonth {
  familyId        String  @db.Uuid
  month           String  // "YYYY-MM" em America/Sao_Paulo
  spentMicroBrl   BigInt  @default(0)
  reservedMicroBrl BigInt @default(0)
  updatedAt       DateTime @updatedAt @db.Timestamptz(3)
  family Family @relation(fields: [familyId], references: [id])
  @@id([familyId, month])
  @@map("llm_budget_months")
}
model LlmUsageEvent {
  id               String         @id @default(uuid()) @db.Uuid
  familyId         String         @db.Uuid
  month            String
  purpose          LlmPurpose
  memberId         String         @db.Uuid          // quem pediu (não vai ao provedor)
  model            String
  status           LlmUsageStatus
  outcome          String?        // ok|budget|timeout|unavailable|invalid|refused|cancelled|auth
  reservedMicroBrl BigInt
  costMicroBrl     BigInt?
  inputTokens      Int?
  outputTokens     Int?
  latencyMs        Int?
  attempts         Int?
  expiresAt        DateTime       @db.Timestamptz(3)
  createdAt        DateTime       @default(now()) @db.Timestamptz(3)
  settledAt        DateTime?      @db.Timestamptz(3)
  @@index([familyId, month, status])
  @@map("llm_usage_events")
}
// Family ganha: aiMonthlyCapCents Int?   (sobrescrita do teto; só por script `pnpm ai:set-cap <familyId> <cents>`)
```
```sql
ALTER TABLE llm_budget_months ADD CONSTRAINT llm_budget_nonneg_chk CHECK ("spentMicroBrl" >= 0 AND "reservedMicroBrl" >= 0);
ALTER TABLE llm_usage_events ADD CONSTRAINT llm_usage_settled_chk CHECK ((status = 'RESERVED' AND "settledAt" IS NULL) OR (status <> 'RESERVED' AND "settledAt" IS NOT NULL));  -- ABANDONED recebe settledAt na conversão
ALTER TABLE families ADD CONSTRAINT families_ai_cap_chk CHECK ("aiMonthlyCapCents" IS NULL OR "aiMonthlyCapCents" >= 0);
```
Nenhuma coluna de conteúdo existe nessas tabelas (teste de esquema: lista de colunas fixada). Expurgo de eventos > 24 meses: *script* `pnpm ai:purge-usage` (manual na R4; job pg-boss depois).

---

## 6. Interface
- **Configurações ▸ IA e privacidade ▸ "Consumo do mês"** (ADMIN): "R$ 2,40 de R$ 10,00 usados neste mês" (`<Money>`; respeita "ocultar valores"), barra de progresso com texto, "Volta a zerar em 01/12/2026". `capInCents = null` ⇒ "A IA ainda não está disponível neste app". Membro comum: bloco ausente (não só oculto).
- Estados: skeleton; erro "Não foi possível carregar o consumo" + "Tentar de novo".
- Cache `["ai-usage"]`, invalidado após qualquer uso de IA.
- Nenhuma tela mostra a chave (não há endpoint que a leia; teste de varredura de DTOs por `apiKey|ANTHROPIC`).

---

## 7. Segurança
`server-only` + `check:imports` (SDK só no *adapter*; `ia/` não importável por `src/app/**/*.tsx` client); teste de *bundle*: `next build` e busca por `ANTHROPIC` / `sk-ant` em `.next/static` ⇒ zero ocorrências. `redact` do pino (ADR-028 §6). Rota `dev/llm-scenario` com as 3 travas do ADR-008/026.

---

## 8. Testes obrigatórios
| Cenário BDD / garantia | Testes |
| :-- | :-- |
| Chamada dentro do teto é registrada sem conteúdo | **I**: gasto 2,00 + uso 0,40 (fake com `usage` calibrado) ⇒ `AiUsageDTO.usedInCents = 240`; `llm_usage_events` sem nenhuma coluna/valor contendo *strings* do payload (varredura de todas as colunas texto). |
| Teto atingido bloqueia | **I**: `spent = cap` ⇒ 422 `LLM_BUDGET_EXCEEDED`, `details.resetsOn = 2026-12-01`, `fake.calls.length = 0`. |
| Estimativa maior que o saldo | **I**: gasto 9,80, estimativa 0,50 ⇒ 422 `LLM_ESTIMATE_EXCEEDS_BUDGET`, zero chamadas. |
| Falha do provedor vira mensagem neutra | **I**: cenários `unavailable`, `timeout`, `rate_limited`, `invalid_json`, `schema_violation`, `truncated`, `refusal` ⇒ código/HTTP da tabela §3, mensagem neutra, **nenhuma** escrita de domínio, reserva liberada (`reservedMicroBrl` volta ao anterior). |
| Admin vê o consumo / membro não | **I**: ADMIN 200; MEMBER 403. **E**: texto "R$ 2,40 de R$ 10,00 usados neste mês"; membro sem o bloco. **I**: nenhum DTO contém a chave. |
| (infra) Concorrência | **I**: 10 `runLlm` simultâneos (`Promise.all`) com saldo para 3 ⇒ exatamente 3 chamam o provedor e 7 recebem `LLM_ESTIMATE_EXCEEDS_BUDGET`; `spent ≤ cap` sempre. |
| (infra) Reserva órfã | **U/I**: relógio +11 min ⇒ evento vira `ABANDONED` contado como gasto. |
| (infra) Real ≤ reserva | **U** propriedade (≥ 1000): para `outputTokens ≤ max` e entrada real ≤ estimada ⇒ `cost ≤ reserved`; teste que mede os *tokens* fixos do prompt (o `system` de cada finalidade) e falha se `estimateInputTokens` subestimar o fixture. |
| (infra) Mês em SP | **U**: `2026-11-30T23:30-03:00` ⇒ `2026-11`; `2026-12-01T02:30Z` ⇒ `2026-11` (ainda 30/11 em SP). |
| (infra) Boot | **U**: matriz de env (§2 regras de boot), modelo sem preço ⇒ throw. |
| (infra) Logs | **I**: logger capturado em todas as saídas ⇒ sem payload, sem resultado, sem `sk-ant`. |
| (infra) Sem rede | **U**: `vitest.setup` falha se `LLM_PROVIDER=anthropic`; `fetch` global para `api.anthropic.com` ⇒ erro imediato nos testes. |
| (infra) Contrato do adapter | **U**: `AnthropicLlmAdapter` com `fetch` injetado (*mock* de HTTP local, sem rede) para: sucesso, `max_tokens`, `refusal`, 429, 500, 401, timeout ⇒ tradução §4.1; corpo enviado **sem** `tools`. |
| (manual) Ouro | `pnpm ai:golden` fora do CI (ADR-028 §7). |

---

## 9. Estimativa e ordem de *commits*
**8** (PO: 8): porta + fake + config/boot (2); adapter + tradução de erros + testes de contrato (2); orçamento com reserva/acerto + migração + concorrência (3); `GET /ai/usage` + bloco de Consumo (1).
*Commits*: (1) `ia/config` + `pricing` + boot + `check:imports`; (2) porta + `FakeLlmAdapter`; (3) migração + `budget*` + testes de concorrência; (4) `AnthropicLlmAdapter` (dependência nova) + contrato; (5) `runLlm` + logs; (6) API/UI de consumo.
**Bloqueio para produção (não para o desenvolvimento)**: valor do teto (Q-U10) e conta/chave Anthropic (pendência externa).
