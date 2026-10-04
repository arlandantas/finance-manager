# SDD-002: Divisão Familiar e Acerto de Contas (US-008, US-009, US-011)

- **Histórias**: [US-008](../../product-owner/backlog/stories/US-008-regra-de-divisao-familiar.md) · [US-009](../../product-owner/backlog/stories/US-009-painel-de-acerto-de-contas.md) · [US-011](../../product-owner/backlog/stories/US-011-registrar-acerto-de-contas.md)
- **Fluxo**: [FLUXO-003](../../product-owner/flows/FLUXO-003-acerto-de-contas.md)
- **Rastreabilidade**: NEED-007 · RN-007.1..3 · ADR-006, ADR-007, ADR-009, ADR-010, **ADR-011** · D-GES-08, D-PO-03 · Q-08 (respondida: **sim**, vigência por data)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md) (`apportion`, `period`), [SDD-004](SDD-004-contas-e-ledger.md) (`createTransferGroup`), [SDD-001](SDD-001-transacoes.md) (despesas comuns), [SDD-003](SDD-003-auth-familia-convite.md) (membros) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap / Pedido do PO | Resolução |
| :-- | :-- |
| **Q-08 / D-GES-08** — vigência da regra | `SplitRuleVersion` *append-only* com `effectiveFrom`; **cada despesa usa a regra vigente em seu `occurredOn`** (ADR-011). Nova regra: padrão hoje; admite data **>= início do período corrente**. Períodos encerrados nunca mudam. |
| Maior resto e desempate | Algoritmo do SDD-000 §4. Desempate: maior resto, depois **menor ordinal** (ordem canônica = `joinedAt` asc, `id` asc). Cota por **grupo de regra** (não por despesa). |
| Algoritmo de sugestão N > 2 | Guloso determinístico (§4.4), no máximo N−1 transferências. |
| Exclusão de acertos/transferências dos totais | A base do rateio é **só** `kind = EXPENSE AND isSharedExpense AND deletedAt IS NULL`. Acertos entram **apenas** como ajuste de saldo líquido (§4.3), nunca como despesa. Teste de regressão obrigatório. |
| Novo membro com regra proporcional | Regra fica `stale`; cálculo segue com peso 0 para o novo membro; UI avisa e Admin redefine (§4.5). |
| Participantes da regra `EQUAL` | Membros com `joinedAt <= fim do período` (fallback: todos, se nenhum). |
| Concorrência ao registrar acerto | `pg_advisory_xact_lock` por `(família, período)` + recálculo dentro da transação + `Idempotency-Key`. |
| Quem registra | Membro envolvido (devedor/credor) **ou** Administrador. |
| Acerto maior que o devido / par não devido | Rejeitado (`SETTLEMENT_EXCEEDS_DUE` / `SETTLEMENT_NOT_DUE`). |
| Acerto e edição posterior | Se despesas mudam depois do acerto, o saldo líquido é recalculado: pode gerar nova dívida **ou inverter o sentido** (documentado e testado). |
| D-PO-03 | Período por `periodOf(date, cutDay)` (ADR-010); `period` da API é a chave `YYYY-MM`. |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/split/schemas.ts
const bpsSchema = z.number({ error: "Informe um percentual entre 0% e 100%" })
  .int("Informe um percentual entre 0% e 100%")
  .min(0, "Informe um percentual entre 0% e 100%").max(10000, "Informe um percentual entre 0% e 100%");

export const SplitRuleInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EQUAL"), effectiveFrom: dateISOSchema.optional() }).strict(),
  z.object({
    kind: z.literal("PROPORTIONAL"),
    shares: z.array(z.object({ memberId: uuidSchema, bps: bpsSchema }).strict()).min(1),
    effectiveFrom: dateISOSchema.optional(),
  }).strict()
    .refine((v) => v.shares.reduce((s, x) => s + x.bps, 0) === 10000, { path: ["shares"], message: "Os percentuais precisam somar 100%" })
    .refine((v) => new Set(v.shares.map((s) => s.memberId)).size === v.shares.length, { path: ["shares"], message: "Membro repetido" }),
]);
export type SplitRuleInput = z.infer<typeof SplitRuleInputSchema>;

export const SettlementPeriodQuerySchema = z.object({ period: periodKeySchema.optional() });   // padrão: período corrente

export const CreateSettlementSchema = z.object({
  period: periodKeySchema,
  fromMemberId: uuidSchema,                // devedor
  toMemberId: uuidSchema,                  // credor
  amountInCents: amountInCentsSchema,
  fromAccountId: uuidSchema,               // conta de origem
  toAccountId: uuidSchema,                 // conta de destino
  occurredOn: dateISOSchema.optional(),    // padrão: hoje
}).strict()
  .refine((v) => v.fromMemberId !== v.toMemberId, { path: ["toMemberId"], message: "Escolha membros diferentes" })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Escolha contas diferentes" });

// ── DTOs ──
export type RuleVersionDTO = {
  id: string; kind: "EQUAL" | "PROPORTIONAL"; effectiveFrom: string;
  shares: Array<{ memberId: string; bps: number }>;     // EQUAL: partes iguais derivadas (apportion) dos membros atuais
  createdAt: string; createdBy: MemberRef | null;
};
export type SplitRuleDTO = {
  current: RuleVersionDTO;                 // vigente hoje
  upcoming: RuleVersionDTO[];              // effectiveFrom > hoje
  members: MemberRef[];                    // ordem canônica
  stale: boolean;                          // PROPORTIONAL que não cobre todos os membros atuais
  canEdit: boolean;                        // ADMIN
};

export type SettlementStatus = "NEEDS_MORE_MEMBERS" | "EMPTY" | "BALANCED" | "PENDING" | "SETTLED";
export type SettlementMemberRow = {
  member: MemberRef;
  paidInCents: number;                     // soma das despesas comuns em que é payer (RN-007.1)
  quotaInCents: number;                    // cota devida (maior resto, por grupo de regra)
  differenceInCents: number;               // paid − quota  (+ a receber / − deve), SEM acertos
  settledAdjustmentInCents: number;        // + quando pagou acertos; − quando recebeu
  balanceInCents: number;                  // difference + adjustment (remanescente)
};
export type SettlementSuggestion = { from: MemberRef; to: MemberRef; amountInCents: number };
export type SettlementEntryDTO = {
  groupId: string; from: MemberRef; to: MemberRef; amountInCents: number; occurredOn: string;
  fromAccount: { id: string; name: string }; toAccount: { id: string; name: string };
  author: MemberRef; createdAt: string; version: number; label: string;   // "Acerto de contas - Outubro"
};
export type SettlementDTO = {
  period: { key: string; start: string; end: string; isCurrent: boolean };
  status: SettlementStatus;
  totalSharedInCents: number;
  rule: { kind: "EQUAL" | "PROPORTIONAL"; stale: boolean; canEdit: boolean };
  members: SettlementMemberRow[];
  suggestions: SettlementSuggestion[];     // vazio se BALANCED/SETTLED/EMPTY
  settlements: SettlementEntryDTO[];       // acertos ativos do período (mais recente primeiro)
};
export type SharedExpenseItemDTO = {
  id: string; description: string; amountInCents: number; occurredOn: string;
  payer: MemberRef; category: { id: string; name: string; icon: string };
};
```

---

## 3. Contratos de API

Todas `auth: "family"`; mutações com `Idempotency-Key`.

| Rota | Papel | Corpo/params | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `GET /api/v1/split-rule` | todos | — | `200 SplitRuleDTO` | — |
| `PUT /api/v1/split-rule` | **ADMIN** | `SplitRuleInputSchema` | `201 { rule: SplitRuleDTO }` | 400 ("Os percentuais precisam somar 100%", "Informe um percentual entre 0% e 100%") · 403 · 422 `SHARES_MEMBER_MISMATCH` ("Informe o percentual de todos os membros") · 422 `EFFECTIVE_FROM_IN_PAST` ("A regra só pode valer a partir do período atual") |
| `GET /api/v1/settlement?period=YYYY-MM` | todos | `period` opcional | `200 SettlementDTO` | 400 período inválido |
| `GET /api/v1/settlement/expenses?period=YYYY-MM` | todos | idem | `200 { items: SharedExpenseItemDTO[]; totalInCents: number }` (data desc, criação desc) | 400 |
| `POST /api/v1/settlements` | envolvido ou ADMIN | `CreateSettlementSchema` | `201 { transfer: TransferDTO; settlement: SettlementDTO }` | 400 · 403 `FORBIDDEN` ("Somente os envolvidos ou um Administrador podem registrar o acerto") · 404 (conta de outra família) · 422 `SETTLEMENT_NOT_DUE` ("Não há valor a acertar entre estes membros") · 422 `SETTLEMENT_EXCEEDS_DUE` (**"O valor não pode ser maior que o devido (R$ 400,00)"**, `details: { dueInCents }`) · 422 `FUTURE_DATE_NOT_ALLOWED` · 422 `INVALID_REFERENCE` (membro/conta) |

O **desfazer acerto** é `POST /api/v1/transfers/:groupId/undo` (SDD-004 §4.4).

---

## 4. Algoritmos (puros, em `src/modules/split`)

Todos recebem dados já carregados; **sem I/O**, sem `Date.now()`. Valores em centavos inteiros (`number` seguro; `BigInt` apenas dentro de `apportion`).

### 4.1 Tipos de entrada
```typescript
type MemberInput  = { id: string; ordinal: number; joinedOn: DateISO };
type ExpenseInput = { id: string; amountInCents: number; payerMemberId: string; occurredOn: DateISO };   // só comuns, ativas
type RuleInput    = { id: string; kind: "EQUAL" | "PROPORTIONAL"; effectiveFrom: DateISO; createdAt: string; shares: Array<{ memberId: string; bps: number }> };
type SettledInput = { fromMemberId: string; toMemberId: string; amountInCents: number };                 // acertos ativos do período
function computeSettlement(i: { period: Period; members: MemberInput[]; expenses: ExpenseInput[]; rules: RuleInput[]; settlements: SettledInput[] }): SettlementResult;
```
`ordinal` é atribuído pelo chamador: posição na ordenação `(joinedAt asc, id asc)`; a função **não depende da ordem dos arrays** de entrada (ordena internamente por `ordinal`/`id`).

### 4.2 Regra vigente numa data
`ruleAt(rules, date)`: entre as regras com `effectiveFrom <= date`, a de maior `effectiveFrom`; empate → `createdAt` mais recente. Sempre existe (a versão inicial vale desde `1970-01-01`).

### 4.3 Cotas e saldos
1. Agrupar `expenses` por `ruleAt(rules, occurredOn).id`.
2. Para cada grupo `g` com `total_g = Σ amount`:
   - **EQUAL:** participantes = membros com `joinedOn <= period.end` (se vazio, todos); pesos 1 cada.
   - **PROPORTIONAL:** pesos = `bps` dos membros presentes na regra **e** em `members` (peso 0 = cota 0; membro novo sem `bps` = 0).
   - `parts_g = apportion(total_g, pesos com ordinal)`.
3. `quota_m = Σ_g parts_g[m]`; `paid_m = Σ amount` das despesas em que `payerMemberId = m`; `totalShared = Σ amount`.
4. `difference_m = paid_m − quota_m`.
5. Acertos: para cada `{from, to, amount}`: `adj_from += amount`, `adj_to −= amount`.
6. `balance_m = difference_m + adj_m`.
**Invariantes** (testadas por propriedade): `Σ quota = totalShared`; `Σ difference = 0`; `Σ balance = 0`.

### 4.4 Sugestão de acerto (N ≥ 2)
```text
devedores  = membros com balance < 0   (valor = −balance)
credores   = membros com balance > 0
enquanto houver devedor e credor:
    d = devedor de MAIOR valor   (empate: menor ordinal)
    c = credor  de MAIOR valor   (empate: menor ordinal)
    x = min(d.valor, c.valor)
    emitir (de d para c, x);  d.valor −= x;  c.valor −= x;  remover quem zerou
```
Propriedades: ≤ N−1 sugestões; todo valor > 0; aplicar todas zera todos os `balance`; determinístico e independente da ordem da entrada. Para N = 2 há no máximo 1 sugestão. Não busca o mínimo global (NP-difícil); registrado no ADR-011.

### 4.5 Status e regra desatualizada
- `members.length < 2` → `NEEDS_MORE_MEMBERS`.
- sem despesas comuns **e** sem acertos → `EMPTY`.
- há sugestões → `PENDING`.
- sem sugestões e ≥ 1 acerto ativo → `SETTLED`; senão → `BALANCED`.
- `stale` = regra vigente **hoje** é `PROPORTIONAL` e `{memberId das shares} ≠ {membros atuais}`.
- `isSettledPeriod(key)` = existe `TransferGroup(kind=SETTLEMENT, settlementPeriod=key, deletedAt IS NULL)` (usado pela confirmação de edição no SDD-001).

### 4.6 Maior resto (referência normativa — `apportion` do SDD-000 §4)
Vetores de teste:
| # | Entrada | Saída esperada |
| :-- | :-- | :-- |
| A1 | `total=10001`, pesos `[5000,5000]`, ordinais `[0,1]` | `[5001, 5000]` |
| A2 | `total=100`, pesos `[1,1,1]` | `[34, 33, 33]` |
| A3 | `total=100001`, pesos `[3334,3333,3333]` | `[33341, 33330, 33330]` |
| A4 | `total=0`, pesos quaisquer | todos `0` |
| A5 | `total=1`, pesos `[1,1]`, ordinais `[1,0]` | quem tem ordinal 0 recebe `1` |
| A6 | `total=100`, pesos `[6000,4000]` | `[60, 40]` |
| A7 | pesos `[0,10000]`, `total=7` | `[0, 7]` |

### 4.7 Vetores de `computeSettlement` (todos os valores em centavos)
| # | Cenário | Resultado esperado |
| :-- | :-- | :-- |
| S1 (NEED-007 / US-009) | `EQUAL`; M pagou 200000 e 40000; L pagou 120000 e 40000 | total 400000; quotas M=200000, L=200000; diff M=+40000, L=−40000; sugestão **L→M 40000**; `PENDING` |
| S2 | `PROPORTIONAL` 6000/4000; M pagou 100000 | quotas 60000/40000; **L→M 40000** |
| S3 | `EQUAL`; M pagou 10001 | quotas **M=5001, L=5000** (Σ=10001); L→M 5000 |
| S4 | `EQUAL` 3 membros; M pagou 90000 | quotas 30000×3; diffs M=+60000, L=−30000, X=−30000; sugestões **L→M 30000, X→M 30000** (empate: ordinal) |
| S5 | ambos pagaram 50000 (EQUAL) | `BALANCED`, sem sugestões |
| S6 | sem despesas | `EMPTY` |
| S7 | 1 membro | `NEEDS_MORE_MEMBERS` |
| S8 (vigência) | regras: `EQUAL` desde sempre e `PROPORTIONAL 7000/3000` desde `2026-10-15`; M pagou 50000 em 10-10 e 100000 em 10-20 | grupo1: 25000/25000; grupo2: 70000/30000; quotas M=95000, L=55000; diff M=+55000, L=−55000; **L→M 55000** |
| S9 (parcial) | S1 + acerto L→M 15000 | balances M=+25000, L=−25000; sugestão **L→M 25000**; `PENDING`; `settledAdjustment` L=+15000, M=−15000 |
| S10 (quitado) | S1 + acerto L→M 40000 | balances 0; `SETTLED`; sem sugestões |
| S11 (nova despesa pós-acerto) | S10 + despesa comum M 20000 | quotas +10000 cada; **L→M 10000** |
| S12 (inversão) | S10 e depois a despesa comum de 40000 da Mariana é excluída (M pagou 200000; L pagou 160000; acerto L→M 40000 permanece) | total 360000; quotas 180000 cada; diff M=+20000, L=−20000; adj M=−40000, L=+40000; balances M=−20000, L=+20000; sugestão **M→L 20000** |
| S13 (stale) | `PROPORTIONAL` 6000/4000 com membro X novo (sem bps); X pagou 0 | quota X = 0; `stale=true` no DTO |

---

## 5. Dados e consultas

### 5.1 Despesas comuns do período
```sql
SELECT id, "amountInCents", "payerMemberId", "occurredOn", description, "categoryId"
FROM transactions
WHERE "familyId" = $1 AND kind = 'EXPENSE' AND "isSharedExpense" = true AND "deletedAt" IS NULL
  AND "occurredOn" BETWEEN $start AND $end
```
(Índices `(familyId, kind, occurredOn)` e `(familyId, payerMemberId, occurredOn)` do modelo.) **Nunca** incluir `TRANSFER_*`, `OPENING` ou `INCOME`.

### 5.2 Acertos ativos do período
`TransferGroup` com `kind='SETTLEMENT' AND settlementPeriod=$key AND deletedAt IS NULL`, mais as pernas para valor e contas (perna `TRANSFER_OUT` = conta de origem; `TRANSFER_IN` = destino).

### 5.3 Membros e regras
Membros ordenados `(joinedAt, id)` → `ordinal = índice`. Regras da família com `shares` (todas as versões; o conjunto é pequeno).

### 5.4 `registerSettlement` (transação, ordem exata)
1. Validar membros e contas **da família** (`INVALID_REFERENCE`/404); `occurredOn <= hoje`.
2. Autorização: `ctx.memberId ∈ {fromMemberId, toMemberId}` ou `role = ADMIN`, senão `403`.
3. `SELECT pg_advisory_xact_lock(hashtextextended($familyId || ':' || $period, 0))`.
4. Recalcular `computeSettlement` (com os acertos já gravados) **dentro da transação**.
5. Achar a sugestão `(from,to)`; ausente → `422 SETTLEMENT_NOT_DUE`; `amount > sugestão.amount` → `422 SETTLEMENT_EXCEEDS_DUE` (`dueInCents`).
6. `createTransferGroup({ kind: "SETTLEMENT", fromAccountId, toAccountId, amountInCents, occurredOn, description: "Acerto de contas - {Mês}", settlement: { period, fromMemberId, toMemberId } })`.
7. Recalcular e devolver `{ transfer, settlement }`.
Rótulo `{Mês}`: nome do mês do **período** em pt-BR com inicial maiúscula (`Outubro`); com ano quando diferente do corrente (`Outubro de 2025`).

### 5.5 `putSplitRule` (transação)
Validar `shares` cobrindo **exatamente** os membros atuais (`SHARES_MEMBER_MISMATCH`); `effectiveFrom ??= hoje` e `>= periodOf(hoje).start` (`EFFECTIVE_FROM_IN_PAST`); `INSERT SplitRuleVersion` + `SplitShare`s (EQUAL: sem shares). Nunca atualizar/excluir versões antigas.

---

## 6. Interface

### 6.1 Painel `/acerto?period=YYYY-MM` (FLUXO-003)
- Seletor de mês (anterior/próximo; **o período vem da URL**).
- **Frase-herói**: `PENDING` → "**{De} deve R$ X para {Para}**" (com mais de uma sugestão: primeira frase + lista das demais); `BALANCED`/`SETTLED` → **"Tudo certo neste mês"**; `EMPTY` → **"Nenhuma despesa comum neste mês. Marque despesas como Dividir com a família para vê-las aqui."**; `NEEDS_MORE_MEMBERS` → "O acerto exige pelo menos dois membros" + ação **Convidar membro** (`/familia`).
- Cartões por membro: *Pagou*, *Cota devida*, *Diferença* (`+R$ …` a receber, `-R$ …` deve) e, quando há acertos, *Saldo restante*.
- Botão **Registrar acerto** (oculto sem sugestão). Rodapé: "Despesas pessoais não entram na divisão".
- Lista expansível **"Ver despesas comuns do período"** (`GET /settlement/expenses`; soma = total comum).
- **Histórico de acertos**: "{De} transferiu R$ X para {Para} em dd/MM" + contas + ação **Desfazer acerto** (diálogo; chama `undo`). Faixa "saldo remanescente" em acerto parcial.
- Aviso **"Regra de divisão desatualizada"** quando `rule.stale` (Admin vê link para a regra).
- Estados: skeleton, vazio/único membro/equilibrado/pendente/quitado (acima), erro de leitura.

### 6.2 Drawer *Registrar acerto*
Valor pré-preenchido com a sugestão (editável; máx. = devido; mensagem do servidor se exceder), conta de origem (padrão: 1ª conta cujo titular é o devedor, senão a 1ª da família) e de destino (idem para o credor), data em *Mais detalhes*; **confirmação** antes de enviar (resumo "Itaú Lucas → Nubank Mariana, R$ 400,00"). `Idempotency-Key` ao abrir. Sucesso → toast, invalidar `["settlement"]`, `["accounts"]`, `["transactions"]`, `["home"]`.

### 6.3 Regra de divisão (`/acerto/regra`, drawer pela engrenagem)
Duas opções: **"Dividir igualmente (50% / 50%)"** (rótulo com os percentuais reais derivados de `apportion`, ex. `33,34% / 33,33% / 33,33%`) e **"Proporcional"** com um campo de percentual por membro e **soma ao vivo "Total: 100%"**. Entrada de percentual com até 2 casas → `parsePercentToBps("33,33") = 3333` (inteiros, sem `float`). Admin edita; Membro vê **somente leitura**. Aviso "A mudança vale a partir de agora" e campo *Vigência* em *Mais detalhes*. Banner para Admin quando `stale`: "Um novo membro entrou. Redefina os percentuais."
Chaves: `["split-rule"]`, `["settlement", period]`.

---

## 7. Segurança e isolamento
`makeRepos` impõe `familyId`; membros/contas de outra família → `INVALID_REFERENCE`/`404`; `PUT /split-rule` só ADMIN; `POST /settlements` só envolvidos ou ADMIN; lock por família+período evita acerto duplo concorrente.

---

## 8. Testes obrigatórios (BDD → teste)

### Unidade (domínio puro, 100% de ramos) e propriedade
- `apportion`: vetores A1..A7; **propriedade** (≥ 1000 casos aleatórios com semente fixa): `Σ saída = total`; cada parte ∈ {⌊exato⌋, ⌈exato⌉}; mesma entrada em ordem embaralhada → mesma saída; `weights` todos 0 → `RangeError`.
- `computeSettlement`: vetores S1..S13; **propriedades**: `Σ quota = totalShared`, `Σ difference = 0`, `Σ balance = 0`; aplicar as sugestões leva todos os saldos a 0; `#sugestões ≤ N−1`; todo valor > 0; resultado **idêntico** ao permutar `members`, `expenses`, `rules`.
- `ruleAt`: troca de regra no meio do mês; mesmas `effectiveFrom` (desempate por `createdAt`); data anterior a qualquer regra não ocorre (regra de 1970).
- `parsePercentToBps`: `"60"→6000`, `"33,33"→3333`, `"100"→10000`, `"110"→erro`, `"-10"→erro`, `"abc"→erro`.

### US-008
| Cenário BDD | Testes |
| :-- | :-- |
| Padrão igualitário | **I**: família nova → `current.kind=EQUAL`, `effectiveFrom=1970-01-01`. **E**: "Dividir igualmente (50% / 50%)" selecionado. |
| Definir divisão proporcional | **I**: `PUT` 6000/4000 → 201; nova versão; painel usa 60/40 (vetor S2). **E**: salvar e ver o painel. |
| Percentuais não somam 100% | **U**: schema (6000+3000) → "Os percentuais precisam somar 100%". **I**: 400 e **regra anterior mantida** (`current` inalterada). **E**: mensagem e soma ao vivo. |
| Percentual inválido | **U**: `-1000` e `11000` → "Informe um percentual entre 0% e 100%". **E**: `-10%`/`110%`. |
| Membro sem permissão | **I**: matriz de permissão (`PUT` como MEMBER → 403; `GET` → 200 com `canEdit=false`). **E**: modo somente leitura. |
| Novo membro entra na família | **I**: regra PROPORTIONAL com 2 membros; terceiro aceita convite → `GET /split-rule.stale = true`; `settlement.rule.stale = true`; cálculo segue (S13). **E**: aviso "Regra de divisão desatualizada" e banner ao Admin. |
| (infra) Vigência | **I**: `PUT` com `effectiveFrom` = hoje não altera períodos anteriores (recalcular mês passado → idêntico); `effectiveFrom` antes do início do período corrente → 422; `effectiveFrom` futura aparece em `upcoming`. |
| (infra) Cobertura de membros | **I**: `shares` faltando um membro/membro de outra família → 422 `SHARES_MEMBER_MISMATCH`. |
| (infra) Append-only | **I**: nenhuma rota atualiza/exclui versões; duas `PUT` mantêm ambas as linhas. |
| (infra) Isolamento | **I**: regra e acerto da Família A invisíveis para a B. |

### US-009
| Cenário BDD | Testes |
| :-- | :-- |
| Cálculo igualitário com um devedor | **U**: S1. **I**: criar as 4 despesas via `POST /transactions` → `GET /settlement` devolve "L deve 40000 a M", quotas e diffs do vetor. **E**: "Lucas deve R$ 400,00 para Mariana" e os cartões. |
| Despesas pessoais não entram | **I**: despesa pessoal 50000 não altera `totalSharedInCents`. |
| Divisão proporcional | **U/I**: S2. **E**: cotas "R$ 600,00"/"R$ 400,00". |
| Centavo ímpar não se perde | **U/I**: S3 (`quota M=5001`, `L=5000`; Σ=10001). **E**: "R$ 50,01" e "R$ 50,00". |
| Mês equilibrado | **U/I**: S5 → `BALANCED`, `suggestions=[]`. **E**: "Tudo certo neste mês". |
| Mês sem despesas comuns | **U/I**: S6 → `EMPTY`. **E**: texto do estado vazio. |
| Família com um só membro | **U/I**: S7. **E**: mensagem e ação "Convidar membro". |
| Três membros | **U/I**: S4 (duas sugestões de 30000 para Mariana). **E**: duas linhas de sugestão. |
| Navegar entre meses | **I**: `period` anterior só considera despesas daquele período (despesa em 30/09 não entra em outubro; virada de mês no fuso SP). **E**: seletor muda a URL e os valores. |
| Ver as despesas que compõem o cálculo | **I**: `GET /settlement/expenses` → `totalInCents == totalSharedInCents`; exclui pessoais/receitas/transferências/excluídas. **E**: lista expansível. |
| (infra) Exclusões do rateio | **I (regressão obrigatória)**: transferência normal e acerto registrados **não** alteram `totalSharedInCents`, quotas nem o painel de outro mês. |
| (infra) Despesa excluída/editada | **I**: excluir/editar despesa comum muda o painel imediatamente (liga com US-013). |

### US-011
| Cenário BDD | Testes |
| :-- | :-- |
| Quitar integralmente | **I**: `POST /settlements` (L→M 40000, Itaú Lucas→Nubank Mariana) → saldos das contas ±40000, grupo `SETTLEMENT` com `settlementPeriod`, `from/to`, legs com `description="Acerto de contas - Outubro"`; painel `SETTLED`. **E**: "Tudo certo neste mês". |
| Acerto parcial | **I**: 15000 → painel S9 ("Lucas deve R$ 250,00 para Mariana"). |
| Valor acima do devido | **I**: 50000 → 422 `SETTLEMENT_EXCEEDS_DUE` com mensagem **"O valor não pode ser maior que o devido (R$ 400,00)"**, nada gravado. **E**: mensagem no drawer. |
| Acerto não distorce receitas e despesas | **I**: `ledgerTotals` (SDD-005) antes/depois idênticos; saldo consolidado das contas inalterado. |
| Histórico do acerto | **I**: `settlements[0]` traz `from/to`, valor, `occurredOn`, contas. **E**: "Lucas transferiu R$ 400,00 para Mariana em 04/10" (relógio fixo). |
| Nova despesa comum após o acerto | **I/U**: S11 → "Lucas deve R$ 100,00 para Mariana" (cenário do PO: +R$ 200,00 comum = +100,00 de cota). |
| Duplo clique não duplica | **I**: `Promise.all` com a mesma chave → 1 grupo e 2 pernas; **com chaves diferentes** (2 cliques de pessoas distintas) → o 2º recebe `SETTLEMENT_NOT_DUE` ou `…EXCEEDS_DUE` (lock + recálculo). |
| Origem igual ao destino | **U/I**: "Escolha contas diferentes". |
| (infra) Permissão | **I**: membro não envolvido e não-ADMIN → 403; envolvido (devedor ou credor) → 201; ADMIN não envolvido → 201. |
| (infra) Par não devido | **I**: `from/to` invertidos (credor→devedor) → 422 `SETTLEMENT_NOT_DUE`. |
| (infra) Desfazer acerto | **I**: `undo` (SDD-004) → painel volta ao devido (liga com US-013). |
| (infra) Inversão de sentido | **I**: S12 → após excluir a despesa, painel sugere M→L 20000. |
| (infra) Atomicidade | **I**: falha injetada na perna de crédito → nenhum acerto/perna; painel igual. |

---

## 9. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-008 | 2 | **3** | Versionamento por vigência, validações, UI de percentuais (soma ao vivo), `stale` |
| US-009 | 5 | **8** | `computeSettlement` + sugestão N>2 + propriedades, painel com vários estados, lista de despesas |
| US-011 | 3 | **5** | Lock + recálculo transacional, reuso de `createTransferGroup`, permissões, histórico/desfazer |
Dependências: US-008 depende de membros (US-002/003); US-009 de US-005 e US-008; US-011 de US-009 e `createTransferGroup` (US-010). `computeSettlement` pode ser desenvolvido **antes** da UI, só com testes de unidade.

---

## Errata 2026-10-04 (R2)
Sem mudança de regra: compras no cartão (`EXPENSE` com `cardId`, `isSharedExpense`) **entram** no rateio pela data da compra, e `INVOICE_PAYMENT` **não entra** (a base continua `kind = 'EXPENSE' AND isSharedExpense AND deletedAt IS NULL`). Despesas geradas pela baixa de previsão entram pelo valor efetivo e data do pagamento. O crédito de uma compra no cartão vai para `payerMemberId` (Q-20, [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md)). Testes de regressão novos em [SDD-008 §8](SDD-008-cartoes-fatura.md) e [SDD-009 §7](SDD-009-despesas-previstas.md).
