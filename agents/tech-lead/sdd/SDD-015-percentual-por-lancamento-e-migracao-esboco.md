# SDD-015: Percentual por lançamento, migração do acerto e divisão por categoria (EN-002, US-043, US-044)

- **Histórias**: [EN-002](../../product-owner/backlog/stories/EN-002-percentual-gravado-por-lancamento.md) (002a + 002b) · [US-043](../../product-owner/backlog/stories/US-043-dividir-no-lancamento-tres-modos.md) · [US-044](../../product-owner/backlog/stories/US-044-lembrar-dividir-por-categoria-e-revisao-do-mes.md)
- **Fluxo**: [FLUXO-008](../../product-owner/flows/FLUXO-008-lancar-despesa-r21-r3.md)
- **Rastreabilidade**: NEED-018 (RN-018.1..5), NEED-007, NEED-019 · Q-F02, Q-F02b, Q-08/D-GES-08 · D-PO-16, D-PO-27, D-PO-34 · TL-07, TL-10, TL-11, TL-13, TL-18 · **[ADR-016](../adrs/ADR-016-percentual-gravado-por-lancamento.md)** (modelo e regra de centavos; **leia a errata do §5.3**) e **[ADR-021](../adrs/ADR-021-protocolo-de-migracao-e-corte-do-motor-do-acerto.md)** (protocolo: pesos exatos, trava de família, reversão, migração de contrato), [ADR-011](../adrs/ADR-011-regra-de-divisao-versionada.md) (emendado), [ADR-019](../adrs/ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md) (ex-membros)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md), [SDD-002](SDD-002-split-e-acerto.md) (motor e vetores S1..S13), [SDD-009](SDD-009-despesas-previstas.md) (baixa), [SDD-011](SDD-011-acerto-opcional-rotulo-e-previa.md) (`explainByRules`, `isSharedExpense`, `personal`), [SDD-012](SDD-012-manutencao-de-cadastros.md) (ex-membros, vetores S14..S16), [SDD-014](SDD-014-parcelamento-esboco.md) (competência, parcelas)
- **Status**: **Aprovado para Desenvolvimento** (R3) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Estimativa**: **EN-002 = 13 (002a = 5 modelo, motor `STORED` e gravação · 002b = 8 migração, *gate*, reversão e harness) · US-043 = 5 · US-044 = 3** (total 21; confirmadas)
- **Ordem (D-PO-34)**: EN-002a ➜ EN-002b ➜ **release com motor `STORED` e interface inalterada** ➜ *(janela de reversão)* ➜ US-042 (SDD-014) ➜ US-043 ➜ US-044. A EN-002 é **Must** (TL-07). O agrupamento em *releases* e o que a janela protege estão em §4.9 e em TL-11.
- **Nome do arquivo**: mantém o sufixo `-esboco` só para não quebrar links de outras pastas; o conteúdo é o SDD completo.

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta | Resolução |
| :-- | :-- |
| Modelo | **Opção B refinada** do ADR-016: `transactions.splitMode` + `splitRuleVersionId` + `transaction_splits(transactionId, familyId, memberId, bps, amountInCents)`. `bps` é a **intenção** (a UI mostra "58% / 42%"); `amountInCents` é o **valor exato debitado da cota** (o que o acerto soma). `isSharedExpense` permanece como espelho (`= splitMode <> 'NONE'`). |
| **Errata do ADR-016 §5.3** | O ADR afirmava que, ao distribuir as sobras, `R_m = Q[g][m] − Σ ⌊valor × bps ÷ 10000⌋` é **sempre ≥ 0**. **Não é verdade** quando o vetor do grupo não é exato em *basis points* (ex.: `EQUAL` com 3 membros ⇒ 3334/3333/3333; com total 316990 o piso por `bps` passa da cota em dezenas de centavos ⇒ `R_m` negativo). **Correção** (ADR-021 §1): a alocação do *backfill* usa os **pesos exatos** do motor `LEGACY` (`w_m`, `W = Σ w`): `base_{i,m} = ⌊a_i × w_m ÷ W⌋`; então `R_m ≥ 0` **sempre** (soma de pisos ≤ piso da soma ≤ cota) e o *gate* fecha. O `bps` gravado continua sendo `apportion(10000, pesos)` (intenção). Prova em §4.4. |
| Motor `LEGACY` × `STORED` | `computeSettlement` é **movido** (sem mudar uma linha de lógica) para `settlement-legacy.ts` como `computeSettlementLegacy`; `settlement.ts` exporta o despachante `computeSettlementFor(engine, input)`. `STORED` soma `transaction_splits.amountInCents`. A escolha é `Family.splitEngine` (ADR-016 §4). Os vetores **S1..S16 rodam nos dois motores** (§8). |
| Quem escreve rateio e quando | **Só famílias `STORED` gravam rateio**; famílias `LEGACY` continuam gravando só `isSharedExpense` (comportamento da R2.1). Assim o *backfill* recalcula **tudo** da família numa só passada (nenhuma linha de rateio "provisória" sobrevive ao *gate*), e a virada é uma coluna. (Reverte o esboço anterior, que mandava gravar também em `LEGACY`; ADR-021 §3.) |
| Concorrência migração × escrita | **Trava de família** (ADR-021 §2): toda escrita que muda despesa comum, rateio, regra ou acerto faz `SELECT "splitEngine" FROM families WHERE id = :f FOR SHARE` (`lockFamilySplit`) e decide **pelo motor lido depois da trava**; o *script* faz `FOR UPDATE` na mesma linha, no **início** de cada família, em `READ COMMITTED`. Nenhuma escrita comita no meio da migração da família. Famílias novas nascem `STORED` (`createFamily` grava `splitEngine = 'STORED'` e `data_migrations(state = 'DONE', report = { native: true })`). |
| `splitMode = RULE` em lançamento **novo** | O vetor é o do **motor `LEGACY` para o período do lançamento** (`legacyGroupWeights` com a regra em vigor em `occurredOn`, membros presentes no período, ex-membros pela R2.1): "Pela regra" continua significando o que o usuário já via; só os **centavos** passam a ser por lançamento (sobra ao pagador, RN-018.3). Para parcelas vale a **data da compra** (SDD-014 §4.2). Registrado em TL-18. |
| Despesas **excluídas** na migração | Também recebem rateio (senão `restore` as deixaria inválidas). Como não contam no acerto, usam a alocação **individual** de `splitAmount` com o vetor do grupo; ao serem restauradas entram no mundo `STORED` com os centavos por lançamento (documentado; TL-18). |
| Compatibilidade `isSharedExpense` × `split` | Criar/editar aceitam `split?` **ou** o booleano legado; informar **os dois** ⇒ `400`. `true` ≡ `{ mode: "RULE" }`; `false` ≡ `{ mode: "NONE" }`. No `PATCH`, o booleano só age quando **muda** a condição "dividida"; `true` sobre um lançamento já `CUSTOM` é *no-op*. |
| Janela de reversão e migração de contrato | O `CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'))` (sentido inverso) e a liberação do modo `CUSTOM` entram **juntos** na migração `us043_modo_custom`, depois da janela. Até lá a reversão completa (`--rollback --purge`) é possível; depois, só a virada de motor (ADR-021 §4). |
| Previsões | `planned_expenses` ganha `splitMode` e `splitShares jsonb` (só `CUSTOM`); a **baixa** resolve `RULE` na data do pagamento e copia `CUSTOM` como está (US-043). Sem tabela de rateio para previsões (não entram em somas). |
| Rótulo ponderado | **Sem nova função**: `explainByRules` (SDD-011 §4.1) já recebe o `SettlementResult` e deriva `weighted = apportion(1000, quotas)`; com o motor `STORED` passa o resultado `STORED`. As cotas são idênticas (*gate*) ⇒ o rótulo é idêntico; o *gate* compara a **string** do rótulo. `SplitExplanationDTO` ganha `customSplitCount` (US-043). |
| US-044 × parcelas | A lista de revisão **não** inclui parcelas "Só meu" (o rateio da compra parcelada é do **plano**, SDD-014; "Dividir" numa parcela avulsa não existe). Registrado em TL-13. |
| Migração em SQL ou em TypeScript | **TypeScript** (`scripts/migrate-split.ts` + `src/modules/split/migrate-family.ts`), porque usa `apportion` e o motor reais como oráculo (ADR-016 §5). O núcleo recebe o `tx` por parâmetro (sem importar `@/lib/db`; passa no `check:imports`). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/split/schemas.ts  (acréscimos; `bpsSchema`, `parsePercentToBps` do SDD-002)
export const SplitModeSchema = z.enum(["NONE", "RULE", "CUSTOM"]);
const shareInput = z.object({ memberId: uuidSchema, bps: bpsSchema }).strict();     // "Informe um percentual entre 0% e 100%"
export const SplitInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }).strict(),
  z.object({ mode: z.literal("RULE") }).strict(),                                    // vetor = regra vigente em occurredOn
  // US-043 acrescenta (não existe na 002a; um "CUSTOM" recebido antes ⇒ 400):
  z.object({ mode: z.literal("CUSTOM"), shares: z.array(shareInput).min(2, "Informe o percentual de todos os membros") }).strict()
    .refine((v) => v.shares.reduce((s, x) => s + x.bps, 0) === 10000, { path: ["shares"], message: "Os percentuais precisam somar 100%" })
    .refine((v) => new Set(v.shares.map((s) => s.memberId)).size === v.shares.length, { path: ["shares"], message: "Membro repetido" }),
]);
export type SplitInput = z.infer<typeof SplitInputSchema>;

// Create/Update de despesa (SDD-001/008 §2) e previsão (SDD-009 §2):
//   split?: SplitInputSchema            (substitui o booleano; padrão: { mode: "NONE" })
//   isSharedExpense?: boolean           (legado; mantido)
//   refine: `split` e `isSharedExpense` juntos ⇒ 400 path ["split"] "Informe a divisão ou \"Dividir com a família\", não os dois"
export function resolveSplitInput(v: { split?: SplitInput; isSharedExpense?: boolean }): SplitInput | undefined;   // legado ⇒ RULE/NONE; ausente ⇒ undefined

export type SplitShareDTO = { member: MemberRef & { removed: boolean }; bps: number; amountInCents: number };
export type SplitDTO = { mode: "NONE" | "RULE" | "CUSTOM"; ruleVersionId: string | null; shares: SplitShareDTO[] };   // TransactionDTO.split
// TransactionDTO: split: SplitDTO | null (null fora de EXPENSE); isSharedExpense = split.mode !== "NONE" (mantido)
// TransactionDefaults.split ganha: modes: Array<"NONE" | "RULE" | "CUSTOM">   (["NONE","RULE"] na 002a; + "CUSTOM" na US-043)
// SplitExplanationDTO (SDD-011 §2) ganha: customSplitCount: number

// src/modules/split/split-amount.ts  (PURO; 100% de ramos)
export type ShareInput = { memberId: string; bps: number; ordinal: number };
export function splitAmount(i: { amountInCents: number; shares: ShareInput[]; payerMemberId: string }): Record<string, number>;
//   base_m = ⌊amount × bps_m ÷ 10000⌋ (BigInt); sobra = amount − Σ base  (0 .. P−1, P = nº de shares com bps > 0)
//   pagador com bps > 0  ⇒ recebe TODA a sobra;
//   senão ⇒ 1 centavo para cada um dos `sobra` participantes de MAIOR resto (amount × bps_m mod 10000, desempate: menor ordinal)
export function resolveRuleShares(i: { rule: RuleInput; members: MemberInput[]; period: Period }): ShareInput[];   // usa legacyGroupWeights; bps = apportion(10000, pesos); só w > 0

// src/modules/split/settlement-legacy.ts  (PURO; congelado)
export function computeSettlementLegacy(i: SettlementInput): SettlementResult;            // o corpo atual de computeSettlement, INTACTO
export function legacyGroupWeights(i: { rule: RuleInput; members: MemberInput[]; period: Period }): Array<{ key: string; weight: number; ordinal: number }>;
//   extraída (refatoração pura) do passo 2 do motor: EQUAL ⇒ participantes (joinedOn <= period.end, removedOn pela R2.1; vazio ⇒ todos) com peso 1;
//   PROPORTIONAL ⇒ bps da regra por membro (ausente = 0); todos 0 ⇒ partes iguais. O motor LEGACY passa a CHAMAR esta função.

// src/modules/split/settlement.ts  (PURO)
export type StoredExpenseInput = ExpenseInput & { splits: Array<{ memberId: string; amountInCents: number }> };
export function computeSettlementStored(i: { period: Period; members: MemberInput[]; expenses: StoredExpenseInput[]; settlements: SettledInput[] }): SettlementResult;
export function computeSettlementFor(engine: "LEGACY" | "STORED", i: SettlementInput | StoredSettlementInput): SettlementResult;
//   STORED: paid_m como no LEGACY; quota_m = Σ_i amount_{i,m}; exige Σ_m amount_{i,m} = a_i (senão SplitInconsistentError); demais passos
//   (acertos, saldo, sugestões, status) compartilhados com o LEGACY por funções comuns (`finalize`).

// src/modules/split/backfill.ts  (PURO; ADR-021 §1)
export type BackfillRow = { expenseId: string; ruleVersionId: string; shares: Array<{ memberId: string; bps: number; amountInCents: number }> };
export function allocateBackfill(i: { period: Period; members: MemberInput[]; rules: RuleInput[];
  expenses: Array<ExpenseInput & { createdAt: string }> }): BackfillRow[];   // só despesas COMUNS ATIVAS do período; determinístico
export type PeriodSnapshot = {
  periodKey: string; status: SettlementStatus; totalSharedInCents: number;
  members: MemberBalance[]; suggestions: Suggestion[];
  weightedPermille: Array<{ memberId: string; permille: number }> | null; label: string; weightedLine: string | null;
};
export function snapshotOf(r: SettlementResult, explain: SplitExplanationDTO | null, order: string[]): PeriodSnapshot;
export function diffSnapshots(a: PeriodSnapshot, b: PeriodSnapshot): Array<{ field: string; expected: unknown; actual: unknown }>;   // [] = idêntico

// US-044
export const SettlementReviewQuerySchema = z.object({ period: periodKeySchema }).strict();
export const DismissReviewSchema = z.object({ period: periodKeySchema }).strict();
export type ReviewItemDTO = { transaction: TransactionDTO };                         // despesas "Só meu" do período
export type SettlementReviewDTO = { period: { key: string; start: string; end: string }; eligible: boolean; dismissed: boolean;
  count: number; totalInCents: number; items: ReviewItemDTO[] };
// SettlementDTO ganha: review: { eligible: boolean; dismissed: boolean; count: number }
// CategoryDTO ganha: defaultSplit: boolean ;  UpdateCategorySchema ganha: defaultSplit?: z.boolean()   ("Nada para alterar" passa a considerá-lo)
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

| Rota | Papel | Corpo/params | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `POST /api/v1/transactions` · `PATCH /transactions/:id` | todos | `split?` **ou** `isSharedExpense?` | como no SDD-001/008, com `TransactionDTO.split` | 400 (ambos os campos; somas; percentuais) · 422 `SHARES_MEMBER_MISMATCH` ("Informe o percentual de todos os membros") · 422 `SETTLEMENT_DISABLED` · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` (`split`, valor, data, pagador ou `isSharedExpense` tocados em mês acertado) |
| `POST/PATCH /api/v1/planned-expenses` | todos | `split?` | `PlannedExpenseDTO` ganha `split: { mode; shares?: Array<{ memberId; bps }> }` | idem |
| `POST /api/v1/planned-expenses/:id/pay` | todos | inalterado | a despesa gerada recebe o rateio **da previsão**: `RULE` resolvido em `paidOn`; `CUSTOM` copiado | — |
| `GET /api/v1/settlement/review?period=` (**US-044**) | todos | `SettlementReviewQuerySchema` | `200 SettlementReviewDTO` | 409 `SETTLEMENT_DISABLED` · 400 período |
| `POST /api/v1/settlement/review/dismiss` (**US-044**) | todos | `DismissReviewSchema` | `200 { dismissed: true }` (idempotente; reenvio com a mesma ou outra chave = `200`) | 409 `SETTLEMENT_DISABLED` · 422 `PERIOD_NOT_ENDED` ("O mês ainda está em andamento") |
| `PATCH /api/v1/categories/:id` (**US-044**) | todos | `UpdateCategorySchema` + `defaultSplit` | `200 { category }` ("Categoria atualizada") | 409 `VERSION_CONFLICT` · 422 `SETTLEMENT_DISABLED` (`defaultSplit: true` com acerto desligado) · 422 `DEFAULT_SPLIT_EXPENSE_ONLY` ("Só categorias de despesa podem dividir por padrão") |

**Não há rota HTTP para a migração**: ela é um *script* operacional (`pnpm migrate:split`, §4.6), nunca exposta.
A "ação Dividir" da revisão é o `PATCH /transactions/:id` com `{ version, split: { mode: "RULE" }, confirmSettledPeriod? }` (rateio pela regra vigente **na data do lançamento**, não na de hoje).
Rótulos de `changes` da revisão ganham `split → "Divisão"` (valores `{ mode, shares: [{ memberId, bps }] }`; `fromLabel/toLabel` legíveis).

---

## 4. Regras e algoritmos

### 4.1 `splitAmount` e vetores (RN-018.3)
Algoritmo em §2. **Vetores obrigatórios** (`tests/unit/split/split-amount.test.ts`):
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| V1 | 5 centavos, 50/50, pagador Lucas | Lucas **3**, Mariana **2** (cenário "Bala") |
| V2 | 9000, 40/40/20 | 3600 / 3600 / 1800 (cenário "Pizza") |
| V3 | 20000, Lucas 100% / Mariana 0%, pagadora Mariana | 20000 / 0 (cenário "Presente"; sem sobra) |
| V4 | 100, 3333/3333/3334, pagador = um dos 3333 | pagador **34**, os outros 33 e 33 |
| V5 | 101, 3333/3333/3334 (A,B,C), pagador **fora** do rateio | restos 6633 / 6633 / 6734 ⇒ C e A (ordinal) ganham 1: **A 34, B 33, C 34** |
| V6 | 100, 3334/3333/3333, pagador = o 2º | 33 / **34** / 33 |
| V7 | 1, 50/50, pagador Lucas | Lucas 1, Mariana 0 |
| V8 | 7, Mariana 100% / Lucas 0%, pagador Lucas (bps 0) | Mariana 7, Lucas 0 |
| V9 | 3 membros, 100, bps 5000/5000/0, pagador o de 0% | sobra 0 ⇒ 50/50/0 |
| V10 | 10001, 5000/5000, pagadora Mariana | Mariana **5001**, Lucas 5000 (base do exemplo "3 × R$ 100,01") |
| Propriedades (≥ 1000 casos, semente fixa) | `Σ = amount`; todo valor ≥ 0; parte ∈ [⌊exato⌋, ⌊exato⌋ + sobra]; pagador com bps > 0 recebe `⌊exato⌋ + sobra`; **a ordem de `shares` não altera o resultado**; determinismo |

### 4.2 Resolver o vetor "Pela regra" (lançamentos novos) — `resolveRuleShares`
`period = periodOf(refDate, cutDay)` (`refDate = occurredOn`; parcelas: data da compra), `rule = ruleAt(rules, occurredOn)`; `w = legacyGroupWeights({ rule, members, period })`; `bps = apportion(10000, w)` (para 50/50 e 60/40 é a identidade; para 3 membros iguais, 3334/3333/3333 por ordinal); só entram membros com `w > 0`. Gravação: `splitMode = RULE`, `splitRuleVersionId = rule.id`, linhas com `bps` e `splitAmount(amount, shares, payer)`.

### 4.3 Escrita (`createExpenseCore`, `updateTransaction`, baixa, parcelas) — **somente famílias `STORED`**
Em toda escrita que cria ou altera despesa comum: `engine = lockFamilySplit(tx, familyId)` (**primeira** trava da operação; depois vêm contas/faturas na ordem dos SDDs 008/012/014). `LEGACY` ⇒ comportamento da R2.1 (só `isSharedExpense`). `STORED`:
- **Criar**: `NONE` ⇒ nada; `RULE` ⇒ §4.2; `CUSTOM` (US-043) ⇒ valida `shares` (membros **ativos** da família, **todos** presentes, soma 10000, cada `bps` 0..10000; membros fora ⇒ `422 SHARES_MEMBER_MISMATCH`), grava `splitMode = CUSTOM`, `splitRuleVersionId = NULL`. Em seguida `INSERT transaction_splits` (a *constraint trigger* confere Σ no `COMMIT`).
- **Editar valor/pagador** de lançamento com rateio: **recalcula os centavos com os mesmos `bps`** (`DELETE` + `INSERT` das linhas na mesma transação que incrementa `version`); editar a **data** não troca o `bps` (ADR-016 §7).
- **Editar o modo**: `NONE → RULE|CUSTOM` cria linhas; `RULE|CUSTOM → NONE` apaga as linhas e zera `splitRuleVersionId`; `RULE ↔ CUSTOM` reescreve. Sem diferença de **intenção** (modo + vetor `bps`) ⇒ `200` sem mudar `version` nem gravar revisão.
- **Revisão** `UPDATE` com `changes: [{ field: "split", from, to }]` (valores `{ mode, shares: [{ memberId, bps }] }`); os **centavos** não entram no diff (derivados).
- **Mês acertado** (SDD-001 §4.2.5): a lista de campos que exigem `confirmSettledPeriod` passa a ser `amountInCents | occurredOn | payerMemberId | isSharedExpense | split`; o período considerado é `periodOf(competenceOn, cutDay)` antes e depois.
- **Excluir/restaurar**: o rateio **acompanha** o lançamento (linhas intactas; `deletedAt` do lançamento decide). Restaurar lançamento excluído **antes** da migração: já tem rateio (§4.5, passo 4).
- **Quem lê**: `loadSettlement` carrega `splitEngine` da família; `STORED` ⇒ lê as despesas comuns do período (predicado único) **e** as linhas de rateio por `transactionId = ANY(:ids)` (2ª consulta, sem `JOIN` que multiplique linhas) e executa `computeSettlementStored`. **Defesa**: despesa comum sem rateio, ou `Σ amount ≠ valor`, lança `SplitInconsistentError` (500 com `requestId` no *log*; **nunca** soma silenciosamente errada).
- **Baixa de previsão** herda o rateio da previsão (`RULE` na data do pagamento; `CUSTOM` copiado). A previsão **sem** `split` mantém a regra da US-030 (`isSharedExpense` herdado).

### 4.4 Backfill: alocação por pesos exatos (`allocateBackfill`; ADR-021 §1)
Entrada de **um período** (despesas comuns ativas cuja `periodOf(competenceOn, cutDay)` é o período; membros com `joinedOn`/`removedOn`; todas as regras). Para cada **grupo** `g = ruleAt(rules, occurredOn).id`:
1. `w = legacyGroupWeights({ rule_g, members, period })`; `W = Σ w`; `total_g = Σ a_i`; `Q = apportion(total_g, w)` (**exatamente** a cota que o `LEGACY` calcula); `bps = apportion(10000, w)`.
2. Para cada despesa `i` do grupo, ordenadas por `(occurredOn, createdAt, id)`: `base_{i,m} = ⌊a_i × w_m ÷ W⌋` (BigInt); `sobra_i = a_i − Σ_m base_{i,m}` (0 .. P−1).
3. `R_m = Q_m − Σ_i base_{i,m}`; **demanda por membro**.
4. Percorrer as despesas na mesma ordem e entregar as `sobra_i` unidades **um centavo por vez** ao membro de **maior `R_m` restante** (desempate: menor ordinal), **preferindo** quem ainda não recebeu centavo nesta despesa; se só restarem já contemplados, repete. Cada centavo decrementa o `R_m` do contemplado.
5. `amount_{i,m} = base_{i,m} + extras`; linha só para `w_m > 0`; `bps_m` do passo 1; `ruleVersionId = rule_g.id`.
**Prova (obrigatória no comentário do código e testada por propriedade):** (a) `Σ_i ⌊a_i w_m / W⌋ ≤ ⌊total_g w_m / W⌋ ≤ Q_m` ⇒ `R_m ≥ 0`; (b) `Σ_m R_m = total_g − Σ_i Σ_m base = Σ_i sobra_i`; (c) a cada passo, `Σ R restante = Σ sobra restante`, logo o algoritmo **nunca** fica sem destino e termina com todo `R_m = 0`; (d) portanto `Σ_i amount_{i,m} = Q_m` (a cota `LEGACY`) e `Σ_m amount_{i,m} = a_i`. Complexidade `O(E · P)` por período.
**Despesas excluídas** (fora do acerto): `bps` do grupo do seu período/regra e `splitAmount(a, shares, payer)` (alocação **individual**, §1). **Não** comuns: sem linhas, `splitMode = NONE`.

### 4.5 Migração por família (`migrateFamily(tx, familyId, opts)`) — **uma transação, `READ COMMITTED`, trava de família**
Passos (a numeração é a mesma do `report`):
1. `SELECT … FROM families WHERE id = :f FOR UPDATE`; `data_migrations (name='en002_split_stored', familyId)` com `state = 'DONE'` ⇒ **`SKIPPED`** (idempotente). Estado `ROLLED_BACK` ou ausente ⇒ continua. `splitEngine` já `STORED` sem `DONE` (família criada por código anterior à correção) ⇒ registra `DONE` sem tocar nos dados.
2. **Fotografar**: períodos = união de `periodOf(competenceOn, cutDay)` das despesas comuns ativas e dos `settlementPeriod` de acertos ativos. Para cada um: `computeSettlementLegacy` (**o mesmo carregador de produção**) + `explainByRules` + `formatSplitLabel` com `today` **fixo** (`opts.today`, uma vez por execução) ⇒ `PeriodSnapshot`; `INSERT split_migration_snapshots (familyId, periodKey, payload, takenAt)` (upsert).
3. **Preencher**: para cada período, `allocateBackfill`; `DELETE FROM transaction_splits WHERE transactionId = ANY(...)` (resíduo de tentativa anterior) e `INSERT`; `UPDATE transactions SET splitMode = 'RULE', splitRuleVersionId = :rule` nas comuns; `splitMode = 'NONE'` + sem linhas nas demais (inclui `DELETE` de rateio órfão). Despesas excluídas conforme §4.4.
4. **Comparar (*gate*)**: com o motor `STORED` (leitura real das linhas recém-gravadas, mesmo carregador de produção) refaz **todos** os períodos do passo 2 e executa `diffSnapshots(snapshot, atual)`. **Qualquer** diferença (cota, diferença, saldo, total, sugestões, status, rótulo, linha ponderada) ⇒ `throw GateError({ periodKey, field, expected, actual })` ⇒ *rollback* da família ⇒ o *script* sai com código ≠ 0.
5. **Virar**: `UPDATE families SET splitEngine = 'STORED'`; `INSERT data_migrations (… state 'DONE', finishedAt, report jsonb)`; `COMMIT` (as *constraint triggers* conferem Σ bps = 10000 e Σ valores = valor de **cada** lançamento comum).
`opts.dryRun` ⇒ após o passo 4, `throw DryRunRollback` (o *runner* trata como sucesso e imprime o relatório). `opts.failAfter = n` (**apenas** testes) lança depois de preencher `n` períodos (prova de atomicidade e retomada).
**Retomável e idempotente**: a transação é da família; falha ⇒ nada permanece (nem snapshot nem rateio); reaplicar refaz **tudo** da família (função pura dos dados). Família `DONE` nunca é reescrita.

### 4.6 *Script* operacional (`scripts/migrate-split.ts`; `pnpm migrate:split`)
`--dry-run` (ensaio: executa e **desfaz**; imprime relatório) · `--family <uuid>` · `--today YYYY-MM-DD` (testes; padrão: hoje no fuso da família) · `--verify` (integridade, §4.8) · `--engine LEGACY|STORED` (§4.7) · `--rollback [--purge]` (§4.7). Itera as famílias em ordem de `id`, **uma transação por família** (`timeout` generoso), **continua** após falha de uma família, imprime um resumo (`DONE`, `SKIPPED`, `FAILED` com o `GateError`) e **sai com código 1 se houver qualquer falha**. A etapa é **obrigatória** no *deploy* e a pipeline falha com o código ≠ 0.
**Ordem de *deploy*** (hospedagem ainda adiada, ADR-005; vale para o ambiente local e para a futura produção): (1) cópia do banco (`pg_dump`); (2) `prisma migrate deploy` (expansão, §5); (3) subir o código novo (todas as instâncias); (4) `pnpm migrate:split --dry-run` (ensaio sobre os dados reais); (5) `pnpm migrate:split`; (6) `pnpm migrate:split --verify`; (7) monitorar; (8) só depois da janela: `us043_modo_custom`.

### 4.7 Reversão (ADR-021 §4)
- `--engine LEGACY --family <id>`: volta o motor **sem tocar nos dados** (as linhas de rateio são aditivas e o `LEGACY` as ignora); marca `data_migrations.state = 'ROLLED_BACK'`. Sempre seguro **enquanto a família não tiver `CUSTOM` nem parcela dividida**. Novos lançamentos de famílias `LEGACY` não gravam rateio (§1); uma nova migração recalcula tudo.
- `--rollback --purge`: além da virada, `DELETE FROM transaction_splits` da família e `UPDATE transactions SET splitMode = 'NONE', splitRuleVersionId = NULL WHERE splitMode <> 'NONE'`. **Recusa** (`exit 2`, nada alterado) se existir `splitMode = 'CUSTOM'`, parcela com rateio (SDD-014) ou a migração de contrato (`tx_shared_mode_chk` presente). Teste obrigatório: aplicar, reverter e comparar o acerto de **todos** os meses com o *snapshot* original.

### 4.8 `--verify` (não compara números; checa integridade)
Todas as famílias `splitEngine = 'STORED'` têm `data_migrations.DONE` (as nativas, `native: true`); nenhuma despesa comum ativa **ou excluída** sem rateio; `Σ bps = 10000` e `Σ valores = valor` por lançamento (a *constraint trigger* já garante; a verificação confere dados antigos); nenhuma linha de rateio de lançamento `NONE`; nenhum rateio de não-despesa. Sai com código 1 se algo falhar. Roda no *deploy* e a pedido.

### 4.9 *Releases*, janela de reversão e o que muda no código por etapa (TL-11)
- **R3-A** (interface **inalterada**): US-040a/b + EN-002a/b. Para o usuário nada muda além do parcelamento "Só meu"; **os acertos de todos os meses são idênticos ao *snapshot*** (*gate*). Parcelas continuam "Só meu".
- **Janela de reversão**: do *deploy* da R3-A até a migração `us043_modo_custom`. Duração mínima: **7 dias** corridos **e** um `--verify` limpo **e** o fechamento de um mês com acerto conferido pelo Stakeholder (o que ocorrer por último).
- **R3-B**: US-042 (parcelado dividido), US-043 (`CUSTOM`), US-044, US-041… A US-042 grava rateio por parcela e **só funciona com `STORED`**; depois dela a reversão completa deixa de ser possível (§4.7). Se o Gestor quiser a US-042 **antes** do fim da janela, a reversão passa a ser "corrigir adiante" (TL-11).
- **Migração de contrato** `us043_modo_custom`: valida `tx_shared_mode_chk`, `planned_split_chk` e libera `CUSTOM` no schema Zod (mesmo *commit* da US-043).

### 4.10 US-043 — Dividir no lançamento
- **Seletor** (`SplitSelector`, `radiogroup`): "**Só meu**" (padrão; **não** lembra a escolha anterior) · "**Pela regra da família ({58% / 42%})**" (percentuais de `defaults.split.ruleShares` formatados por `formatBpsList(order)`) · "**De outro jeito**". Só aparece com `defaults.split.available` (acerto ligado e ≥ 2 membros ativos).
- "De outro jeito": mini-formulário com **um campo por membro ativo** (percentual com até 2 casas, `parsePercentToBps`; pré-preenchido com a regra), **soma ao vivo** "Total: 100%" e erro "Os percentuais precisam somar 100%" (o botão "Salvar Despesa" desabilita); `0%` e `100%` permitidos (reembolso); N > 2 vale (US-009b). Valores em centavos por membro aparecem em `<Money>` (percentuais ficam visíveis com valores ocultos).
- **Quatro toques** no "Só meu": nenhum campo novo obrigatório; os modos extras custam **um toque** a mais.
- **Edição**: o seletor aparece no formulário de edição; mês acertado ⇒ confirmação da US-013b (`isSettledPeriod` inalterado); mudar a regra da família **nunca** reescreve lançamentos (a leitura é do rateio gravado; teste).
- **Previsões e parcelas**: o mesmo seletor; a previsão grava `splitMode`/`splitShares`; a parcelada usa o mesmo vetor para todas as parcelas (SDD-014).
- Acerto desligado ⇒ o seletor **não** aparece e o servidor devolve `422 SETTLEMENT_DISABLED` para `split ≠ NONE`.

### 4.11 US-044 — Dividir por categoria e revisão do mês
- **`Category.defaultSplit`** (`NOT NULL DEFAULT false`): qualquer membro altera (D-PO-04) pelo `PATCH`; **arquivar preserva**; só categorias de despesa. Aparece em `CategoryDTO` e no formulário de edição **só** com o acerto ligado.
- **Cliente** (`useSplitDefaultFromCategory`): estado `{ mode, userPicked }` do formulário; ao escolher uma categoria com `defaultSplit`, se `!userPicked` ⇒ `mode = RULE`; qualquer escolha manual no seletor liga `userPicked` (a troca posterior de categoria **não** sobrescreve); categoria sem `defaultSplit` **não** desliga um `RULE` escolhido à mão.
- **Revisão** (`GET /settlement/review?period=`): `eligible = settlementEnabled ∧ period.end < hoje`; `items` = despesas `EXPENSE` **ativas**, `splitMode = NONE`, `competenceOn` no período, **sem** parcelas (TL-13), ordenadas `(occurredOn desc, createdAt desc, id desc)`; `count` e `totalInCents` (da mesma lista); `dismissed` = existe `settlement_review_dismissals(familyId, periodKey)`. `SettlementDTO.review` traz o resumo (o painel mostra "**N despesas Só meu neste mês. Revisar?**" quando `eligible ∧ !dismissed ∧ count > 0`; a tela "Registrar acerto" mostra a mesma faixa). **Nunca** bloqueia o acerto e **nunca** muda nada sozinha.
- **Dividir** a partir da revisão = `PATCH` `{ split: { mode: "RULE" } }` (regra da **data do lançamento**); mês acertado ⇒ a mesma confirmação da US-013b. Invalidar `["settlement", period]`, `["review", period]`, `["transactions"]`, `["home"]`, `["month-summary"]`.
- **Dispensar**: `POST /settlement/review/dismiss` (`INSERT … ON CONFLICT (familyId, periodKey) DO NOTHING`); mês em andamento ⇒ `422 PERIOD_NOT_ENDED`.

### 4.12 Invariantes (verificadas por teste)
1. Para toda família `STORED`: `Σ_m quota_m = totalShared`, `Σ difference = 0`, `Σ balance = 0` (as propriedades do SDD-002 valem nos dois motores).
2. Todo lançamento comum ativo tem `Σ bps = 10000` e `Σ amountInCents = valor` (banco **e** teste).
3. `isSharedExpense = (splitMode <> 'NONE')` em toda linha criada por código `STORED` (e, após a migração de contrato, no banco).
4. Mudar a regra (`PUT /split-rule`) **não** altera nenhuma linha de rateio nem o acerto de nenhum mês passado.
5. `explainByRules` com o resultado `STORED` ≡ com o resultado `LEGACY` para os dados migrados.
6. Nenhum caminho de escrita de despesa comum, rateio, regra ou acerto deixa de chamar `lockFamilySplit` (teste de **varredura estática**: lista de funções em `tests/unit/split/lock-coverage.test.ts`).

---

## 5. Dados e migrações (SQL cru; nunca editar migração aplicada)

**Ordem**: `en002_percentual_por_lancamento` (expansão; EN-002a) ➜ [*script* de migração, EN-002b] ➜ `us043_modo_custom` (contrato + `CUSTOM` + previsões; US-043) ➜ `us044_dividir_por_categoria` (US-044).

```prisma
enum SplitMode   { NONE RULE CUSTOM }
enum SplitEngine { LEGACY STORED }
model Family { /* … */  splitEngine SplitEngine @default(LEGACY)  /* famílias novas: o serviço grava STORED */ }
model Transaction { /* … */
  splitMode          SplitMode @default(NONE)
  splitRuleVersionId String?   @db.Uuid
  splitRule          SplitRuleVersion? @relation(fields: [splitRuleVersionId], references: [id])
  splits             TransactionSplit[]
}
model TransactionSplit {
  transactionId String @db.Uuid
  familyId      String @db.Uuid
  memberId      String @db.Uuid
  bps           Int
  amountInCents BigInt
  transaction Transaction @relation(fields: [familyId, transactionId], references: [familyId, id], onDelete: Cascade)
  member      Member      @relation(fields: [familyId, memberId], references: [familyId, id], onDelete: Restrict)
  @@id([transactionId, memberId])
  @@index([familyId, memberId])
  @@map("transaction_splits")
}
model SplitMigrationSnapshot { id String @id @default(uuid()) @db.Uuid; familyId String @db.Uuid; periodKey String; payload Json; takenAt DateTime @default(now()) @db.Timestamptz(3)
  @@unique([familyId, periodKey]) @@map("split_migration_snapshots") }
model DataMigration { id String @id @default(uuid()) @db.Uuid; name String; familyId String @db.Uuid; state String; finishedAt DateTime? @db.Timestamptz(3); report Json?
  @@unique([name, familyId]) @@map("data_migrations") }
```
`onDelete: Cascade` em `transaction_splits` é só do **Prisma/FK** (a tabela `transactions` proíbe `DELETE` por gatilho; o `Cascade` nunca dispara). O teste estrutural "nenhuma FK para `members` com `ON DELETE CASCADE`" (SDD-012 §4.4) continua valendo (a de `member` é `RESTRICT`).

```sql
-- en002_percentual_por_lancamento (EXPANSÃO: nada muda para o usuário; linhas existentes ficam NONE/LEGACY)
-- (Prisma cria enums, colunas, tabelas e FKs; abaixo, o que é SQL cru)
ALTER TABLE "transaction_splits" ADD CONSTRAINT transaction_splits_bps_chk CHECK ("bps" BETWEEN 0 AND 10000);
ALTER TABLE "transaction_splits" ADD CONSTRAINT transaction_splits_amount_chk CHECK ("amountInCents" >= 0);
-- só despesa pode ter divisão; e quem tem divisão é "comum" (sentido seguro em todas as fases)
ALTER TABLE "transactions" ADD CONSTRAINT tx_split_kind_chk CHECK ("splitMode" = 'NONE' OR (kind = 'EXPENSE' AND "isSharedExpense" = true));

CREATE FUNCTION tx_split_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t_id uuid; mode "SplitMode"; amt bigint; n int; sb bigint; sa bigint;
BEGIN
  IF TG_TABLE_NAME = 'transaction_splits' THEN t_id := COALESCE(NEW."transactionId", OLD."transactionId"); ELSE t_id := NEW."id"; END IF;
  SELECT "splitMode", "amountInCents" INTO mode, amt FROM "transactions" WHERE "id" = t_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COUNT(*), COALESCE(SUM("bps"), 0), COALESCE(SUM("amountInCents"), 0) INTO n, sb, sa FROM "transaction_splits" WHERE "transactionId" = t_id;
  IF mode = 'NONE' THEN
    IF n > 0 THEN RAISE EXCEPTION 'lançamento % sem divisão não pode ter rateio', t_id; END IF;
  ELSIF n = 0 OR sb <> 10000 OR sa <> amt THEN
    RAISE EXCEPTION 'rateio inválido no lançamento % (bps %, valor % de %)', t_id, sb, sa, amt;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transactions_split_integrity AFTER INSERT OR UPDATE OF "splitMode", "amountInCents" ON "transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tx_split_integrity();
CREATE CONSTRAINT TRIGGER transaction_splits_integrity AFTER INSERT OR UPDATE OR DELETE ON "transaction_splits"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tx_split_integrity();
```
```sql
-- us043_modo_custom (CONTRATO; só depois da janela e de `migrate:split --verify` limpo; FALHA se houver dado inconsistente = rede de segurança)
ALTER TABLE "transactions" ADD CONSTRAINT tx_shared_mode_chk CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'));
ALTER TABLE "planned_expenses" ADD COLUMN "splitMode" "SplitMode" NOT NULL DEFAULT 'NONE', ADD COLUMN "splitShares" JSONB;
UPDATE "planned_expenses" SET "splitMode" = 'RULE' WHERE "isSharedExpense" = true;          -- previstas "comuns" já usavam a regra
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_split_chk CHECK (
  ("isSharedExpense" = ("splitMode" <> 'NONE')) AND (("splitMode" = 'CUSTOM') = ("splitShares" IS NOT NULL)));
-- us044_dividir_por_categoria
ALTER TABLE "categories" ADD COLUMN "defaultSplit" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "settlement_review_dismissals" ("id" UUID PRIMARY KEY, "familyId" UUID NOT NULL REFERENCES "families"("id"),
  "periodKey" TEXT NOT NULL, "dismissedByMemberId" UUID NOT NULL, "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE "settlement_review_dismissals" ADD CONSTRAINT srd_member_fkey FOREIGN KEY ("familyId","dismissedByMemberId") REFERENCES "members"("familyId","id");
CREATE UNIQUE INDEX srd_family_period_uq ON "settlement_review_dismissals" ("familyId","periodKey");
```
Nenhuma migração faz `DELETE` em tabela do ledger. **Seed/fábricas**: `makeTransaction({ split })` (aceito desde a R2.1) passa a gravar o rateio **via serviço**; `makeFamily({ splitEngine })` (padrão `STORED`; `LEGACY` para os testes de migração); universo aleatório do harness em `tests/support/split-universe.ts`.

---

## 6. Interface
- **EN-002**: **nenhuma mudança visível** (nem de rótulo, nem de número). O Dev confirma por E2E "antes/depois" dos cenários homologados.
- **Formulário de despesa** (`transaction-drawer.tsx`, `edit-transaction-form.tsx`) e **previsão** (`planned-drawer.tsx`): `SplitSelector` (§4.10) no lugar do interruptor da R2.1 (R3-B). Rótulos com percentuais em texto; foco e `aria` do `radiogroup`; erro com `aria-invalid` e a mensagem do servidor/Zod.
- **Acerto** (`acerto-screen.tsx`): faixa "N despesas Só meu neste mês. Revisar?" (meses encerrados) com "Revisar" (drawer com a lista, `Money`, botão "Dividir" por item) e "Não perguntar de novo para este mês"; linha informativa da R2.1 ("N despesas Só meu neste mês (R$ X)") permanece em mês corrente.
- **Categorias**: interruptor "Dividir por padrão" na edição (oculto com acerto desligado).
- **Estados**: skeleton do drawer de revisão; vazio "Nenhuma despesa Só meu neste mês"; erro "Não foi possível carregar a revisão" + "Tentar de novo"; sem conexão (mensagem padrão; seleção preservada).
- **Cache**: chaves novas `["review", period]`; `PATCH`/`POST` de lançamento já invalidam `["transactions"]`, `["settlement"]`, `["home"]`, `["month-summary"]` (acrescentar `["review"]` em `invalidateFinancialCaches`). Mudar `defaultSplit` invalida `["categories"]`.

---

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); `splitEngine`, `splitMode` derivado, `bps` e centavos **nunca** vêm do cliente além de `split` (`.strict()` rejeita `splitEngine`, `splitRuleVersionId`, `amountInCents` de rateio); membros e regra de outra família ⇒ `INVALID_REFERENCE`/`SHARES_MEMBER_MISMATCH`; FKs compostas em `transaction_splits`; `dismiss` só da própria família. O *script* de migração **não** é rota HTTP e exige acesso ao banco (variáveis do ambiente); relatório e *logs* sem valores individuais (só contagens e `periodKey`); o *snapshot* contém valores e fica no banco (mesma proteção das demais tabelas).

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, I = integração (`db-test`), E = E2E

### 8.1 Regressão do acerto (**gate de release**; roda antes/depois de cada etapa)
- **S1..S16 nos dois motores** (`tests/unit/split/settlement-engines.test.ts`): cada vetor roda com `computeSettlementLegacy` e com `allocateBackfill` ➜ `computeSettlementStored`; **todos os campos idênticos**.
- **Dados homologados** (casos nomeados, integração, relógio fixo): **N1** outubro/2026 = 316990 comum, cota 158495, diferença 114995; **N2** setembro = 71700, cota 35850, diferença 26050; **N3** troca 50/50 ➜ 58/42 (40000 em 02/10, 100000 em 10/10) ⇒ **78000 / 62000** (rateio 02/10 = 5000/5000; 10/10 = 5800/4200, `splitRuleVersionId` de cada regra); **N4** acerto registrado de 50000 em outubro: saldo restante idêntico; **N5** despesa "Só meu" 8000 fora; **N6 (ímpares)**: três despesas de 10001 a 50/50 pagas por Mariana ⇒ cotas **15002 / 15001** (`LEGACY` e `STORED`), diferença idêntica e **centavos gravados** (5001/5000 · 5001/5000 · 5000/5001) somando 15002 e 15001; **N7**: regra alterada depois (70/30) não muda lançamentos antigos; **N8**: despesa excluída recebe rateio e não altera o acerto; **N9**: compra no cartão compartilhada; **N10**: ex-membro (S14) com rateio.
- **Harness aleatório** (`tests/integration/en002-harness.int.test.ts`; `tests/support/prng.ts` = `mulberry32(seed)`; `tests/support/split-universe.ts`): **≥ 200 famílias** (sementes 1..240 fixas no arquivo) com N = 2..4 membros; entrada de membro no meio do mês; membro removido; regras `EQUAL` e `PROPORTIONAL` com troca em dia aleatório e regra futura; despesas de 1 a 500000 centavos (maioria **ímpar**) com pagadores aleatórios; despesas excluídas e editadas; compras de cartão compartilhadas; acertos parciais e totais; 3 a 6 meses. Para **toda** família: `snapshot (LEGACY) → migrateFamily → snapshot (STORED)` e `diffSnapshots == []` em **todos os períodos** (cota, diferença, saldo, total, sugestões, status, rótulo, linha ponderada). **Qualquer diferença de 1 centavo falha o teste.** Também: `Σ quota = total`, `Σ balance = 0`, `Σ bps = 10000`, `Σ valores = valor`.
- **Teste do teste** (`gate-detects-drift`): injeta +1 centavo em uma linha do `allocateBackfill` (via *spy*) e prova que `migrateFamily` lança `GateError` e **nada** persiste.
- **Propriedade pura** (`tests/unit/split/backfill.test.ts`, ≥ 2000 casos): para entradas aleatórias, `R_m ≥ 0`, `Σ_i amount = Q_m` (cota `LEGACY`), `Σ_m amount = a_i`, ordem das entradas irrelevante, determinístico (valida a **errata** do ADR-016).

### 8.2 EN-002 (ordem 2; 002a = itens 1..3; 002b = demais)
| Cenário BDD | Testes |
| :-- | :-- |
| Números homologados permanecem / Setembro idêntico | **I**: N1 e N2 (acerto, Home `settlementIndicator`, `explain`) **antes** e **depois** de `migrateFamily`. |
| Mês com mudança de regra migra cada lançamento com o percentual da sua data | **I**: N3 (linhas gravadas por lançamento; cotas 78000/62000). |
| **Centavos por lançamento não alteram o acerto antigo** (novo) | **U/I**: N6 (cotas e diferença idênticas ao *snapshot*; centavos gravados somam as cotas). |
| Lançamento pessoal migra sem percentual | **I**: N5 (`splitMode = NONE`, sem linhas, fora do acerto). |
| Mudar a regra depois não altera (002a) | **I**: `PUT /split-rule` 70/30 ⇒ linhas e meses anteriores idênticos (*checksum* de `transaction_splits`); novo lançamento `RULE` usa 70/30. |
| Acertos registrados e saldo restante | **I**: N4. |
| Rótulo usa os percentuais gravados (002a) | **I**: `explainByRules` com o resultado `STORED` ⇒ `weighted [557, 443]`, "Na prática neste mês: 55,7% / 44,3%". **E**. |
| Migração é repetível sem efeito | **I**: 2ª execução ⇒ `SKIPPED`; *checksum* de `transactions`, `transaction_splits`, `families` idêntico. |
| Falha no meio não deixa dados pela metade | **I**: `failAfter` ⇒ *rollback* total (nenhum rateio, nenhum snapshot, motor `LEGACY`); reaplicar ⇒ tudo correto e acerto igual ao original. |
| Regressão geral | **I**: harness (§8.1). |
| (infra) Constraint trigger | **I** (SQL cru): `Σ bps ≠ 10000`, `Σ valor ≠ valor do lançamento`, rateio em lançamento `NONE`, rateio em receita ⇒ erro no `COMMIT`; editar o valor sem recalcular o rateio ⇒ erro. |
| (infra) Concorrência | **I**: `Promise.all([migrateFamily, createExpense])` ⇒ ou a despesa entra **antes** (e é migrada) ou **depois** (já `STORED` com rateio); nunca despesa comum sem rateio em família `STORED`; idem `putSplitRule` e `registerSettlement` durante a migração. **U** de varredura (invariante 6). |
| (infra) Reversão | **I**: `--engine LEGACY` ⇒ acerto de todos os meses = snapshot; `--rollback --purge` ⇒ idem, sem linhas de rateio; recusa com `CUSTOM`/parcela dividida/contrato. |
| (infra) Famílias novas | **I**: `POST /families` grava `splitEngine = STORED`; lançamento comum grava rateio. |
| (infra) `--verify` | **I**: detecta despesa comum sem rateio e família `STORED` sem `DONE`. |

### 8.3 US-043 (ordem 5; depende da EN-002)
| Cenário BDD | Testes |
| :-- | :-- |
| Três modos disponíveis, Só meu padrão | **C/E**: radiogroup com "Só meu", "Pela regra da família (50% / 50%)", "De outro jeito"; "Só meu" marcado. |
| Dividir pela regra da família | **I**: `split: RULE` em 30000 ⇒ linhas 5000/5000, 15000/15000; acerto cota 15000. |
| Só meu fica fora | **I**: acerto inalterado. |
| Dividir de outro jeito (reembolso 0/100) | **I**: V3 ⇒ cota de Lucas 20000, Mariana 0; acerto mostra Lucas 20000. |
| Percentuais precisam somar cem | **U**: `SplitInputSchema` (70+40) ⇒ "Os percentuais precisam somar 100%"; **E**: botão desabilitado. |
| Centavos ficam com quem pagou | **U/I**: V1 (cota Lucas 0,03, Mariana 0,02). |
| Mudar a regra depois não altera / A regra nova vale para os próximos | **I**: 70/30 depois ⇒ "Mercado" continua 50/50; novo `RULE` = 70/30; **E**: "Pela regra da família (70% / 30%)". |
| Três membros | **I/U**: V2 (3600/3600/1800). |
| Editar o modo em mês aberto / acertado | **I**: `PATCH split: NONE` ⇒ acerto deixa de considerar 30000; em mês acertado ⇒ 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`, com confirmação ⇒ 200 e saldo recalculado. |
| Sem acerto ligado o seletor não aparece / Quatro toques | **I**: `split ≠ NONE` ⇒ 422 `SETTLEMENT_DISABLED`; **E**: sem seletor; "Só meu" em 4 interações. |
| (infra) Compatibilidade | **I**: `isSharedExpense` + `split` juntos ⇒ 400; legado `true` ≡ `RULE`; `true` sobre `CUSTOM` é *no-op*. |
| (infra) Previsões | **I**: previsão `CUSTOM` ⇒ baixa copia o rateio; `RULE` resolve na data do pagamento. |
| (infra) Ex-membro | **I**: lançamento com rateio de membro removido continua somando; `CUSTOM` sem todos os ativos ⇒ 422 `SHARES_MEMBER_MISMATCH`. |
| (infra) Idempotência/concorrência | **I**: `Promise.all` mesma chave ⇒ 1 efeito; duas edições com a mesma `version` ⇒ 200 + 409. |

### 8.4 US-044 (ordem 6)
| Cenário BDD | Testes |
| :-- | :-- |
| Marcar a categoria para dividir por padrão | **I**: `PATCH /categories/:id { defaultSplit: true }` ⇒ 200 "Categoria atualizada"; MEMBER pode; INCOME ⇒ 422. |
| Lançamento herda / Categorias comuns continuam Só meu / Escolha manual não é sobrescrita | **C**: hook `useSplitDefaultFromCategory` (tabela de estados `userPicked`); **E**. |
| Revisão lista as Só meu do mês encerrado | **I**: `GET /settlement/review?period=2026-09` ⇒ 2 itens (8000, 4500), `count 2`; parcelas "Só meu" **não** aparecem. **E**: "2 despesas Só meu neste mês. Revisar?". |
| Dividir a partir da revisão | **I**: `PATCH split RULE` na de 4500 ⇒ cota 2250 para cada. **E**. |
| Revisão não muda nada sozinha / Dispensar | **I**: nenhuma escrita ao abrir; `dismiss` ⇒ `dismissed true`, repetir = 200 sem duplicar; **E**. |
| Mês em andamento não mostra | **I**: período corrente ⇒ `eligible false`; `dismiss` ⇒ 422 `PERIOD_NOT_ENDED`. |
| Dividir em mês já acertado | **I**: 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`. |
| Acerto desligado | **I**: `review` e `dismiss` ⇒ 409 `SETTLEMENT_DISABLED`; `defaultSplit: true` ⇒ 422; **E**: sem opção nem aviso. |

---

## 9. Estimativa, dependências e impacto

| Item | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| EN-002a | 5 (a EN inteira) | **5** | Expansão SQL, `splitAmount`, `settlement-legacy.ts` (refatoração pura), `STORED`, despachante, trava de família, escrita `STORED`, rótulo |
| EN-002b | — | **8** | `allocateBackfill` (+ prova), `migrateFamily`, *script*, *snapshot*/*gate*, reversão, `--verify`, harness de 200 famílias |
| US-043 | 5 | **5** | Seletor, `CUSTOM`, previsões, migração de contrato |
| US-044 | 3 | **3** | `defaultSplit`, hook, revisão, `dismiss` |
Total do SDD: **21**. Dependências: EN-002a ➜ 002b ➜ (janela) ➜ US-043 ➜ US-044; US-042 (SDD-014) depende da EN-002 (**dura**).

**Sequência de *commits* atômicos sugerida**
- **002a**: (1) migração de expansão + `schema.prisma` + testes do gatilho; (2) refatoração `computeSettlementLegacy`/`legacyGroupWeights` com S1..S16 **verdes sem mudança** (um *commit* só, para o `git blame` provar que a lógica não mudou); (3) `splitAmount` + V1..V10; (4) `computeSettlementStored` + despachante + S1..S16 nos dois motores; (5) `lockFamilySplit` e a escrita `STORED` (create/update/baixa) + varredura de trava; (6) leitura (`loadSettlement`) + `explain` com `STORED`.
- **002b**: (1) `allocateBackfill` + propriedade; (2) `migrateFamily` + snapshot + *gate*; (3) *script*, `--dry-run`, `--verify`, reversão; (4) harness de 200 famílias + casos nomeados; (5) documentação operacional no `ambiente-local.md` (comandos).
- **US-043**/**US-044**: schema + API ➜ UI.

**Impacto no código existente**: `split/{settlement,service,repo,schemas,explain}.ts` (+ novos `settlement-legacy.ts`, `split-amount.ts`, `backfill.ts`, `migrate-family.ts`), `transacoes/{schemas,service,mutations,repo}.ts` (`split`, `lockFamilySplit`, mês acertado com `split`), `previstas/{schemas,service}.ts` (baixa herda), `cartoes/*` (SDD-014), `categorias/*` (`defaultSplit`), `familia/service.ts` (`splitEngine = STORED` na criação), `contas/service.ts` (nada), `scripts/migrate-split.ts` (novo), `scripts/check-imports.ts` (o núcleo de migração é puro/recebe `tx`; `settlement-legacy.ts`, `split-amount.ts`, `backfill.ts` entram em `PURE`), `package.json` (`migrate:split`), `transaction-drawer.tsx`, `edit-transaction-form.tsx`, `planned-drawer.tsx`, `acerto-screen.tsx`, `categorias`, `tests/support/{prng,split-universe,factories}.ts`, `prisma/seed.ts`.

**Testes de R1/R2/R2.1 que mudam**: os que passam `isSharedExpense` continuam válidos (compatibilidade); testes do motor passam a importar `computeSettlementLegacy` (mesmo corpo); nenhum número de acerto muda.

**Ajustes pedidos ao PO / Dev (não bloqueantes)**
1. **PO** (EN-002): os cenários "Mudar a regra depois da migração…" e "Rótulo do mês…" são da 002a; os demais, da 002b (já escrito pelo PO) ✔. Acrescentar à US-043 o cenário "Previsão com divisão própria: a baixa herda" (a previsão agora guarda `split`).
2. **PO** (US-044): a lista de revisão **não inclui parcelas** "Só meu" (TL-13); confirmar.
3. **Dev**: a refatoração do passo (2) da 002a **não pode** alterar o motor; se algum S1..S16 falhar, o *commit* é revertido. Registrar no `tasks-board.md` o resultado "antes/depois" do harness.
