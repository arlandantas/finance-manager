# SDD-014: Compra parcelada no cartão (US-040a, US-040b, US-042, US-041)

- **Histórias**: [US-040](../../product-owner/backlog/stories/US-040-compra-parcelada-no-cartao.md) (040a + 040b) · [US-041](../../product-owner/backlog/stories/US-041-gerenciar-compra-parcelada.md) · [US-042](../../product-owner/backlog/stories/US-042-parcelado-dividido-no-acerto-por-parcela.md)
- **Fluxo**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md) §1
- **Rastreabilidade**: NEED-003 (RN-003.4..9), NEED-007, NEED-018 · Q-F05, Q-F14, Q-20 · D-PO-25, D-PO-26, D-PO-33, D-PO-34 · D-GES-16, D-GES-17, D-GES-22 · TL-02, TL-03, TL-11, TL-12, TL-16, TL-22 · **[ADR-017](../adrs/ADR-017-parcelamento-no-cartao-e-competencia.md)** e **[ADR-020](../adrs/ADR-020-parcela-na-k-esima-fatura-e-competencia-no-banco.md)** (leitura obrigatória: modelo, competência, fatura da parcela, carimbo de exclusão), [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md), [ADR-016](../adrs/ADR-016-percentual-gravado-por-lancamento.md) (US-042)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md) (lançamento, `version`, mês acertado), [SDD-008](SDD-008-cartoes-fatura.md) (ciclo, fatura, limite, travas), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (predicado único, `Money`), [SDD-011](SDD-011-acerto-opcional-rotulo-e-previa.md) (acerto e `isSharedExpense`), [SDD-012](SDD-012-manutencao-de-cadastros.md) (arquivar cartão, `lockAccountsForPosting`), [SDD-015](SDD-015-percentual-por-lancamento-e-migracao-esboco.md) (**EN-002 antes da US-042**), [SDD-016](SDD-016-tags-e-visoes-sinteticas-esboco.md) (tags nas parcelas) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §10
- **Status**: **Aprovado para Desenvolvimento** (R3) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Estimativa**: **US-040a = 5 · US-040b = 3 · US-042 = 3 · US-041 = 5** (confirmadas; sem mudança em relação ao ciclo anterior)
- **Ordem de execução (D-PO-34)**: **US-040a ➜ US-040b ➜ EN-002 (SDD-015) ➜ US-042 ➜ US-043 (SDD-015) ➜ US-041 ➜ US-044…** A 040a e a 040b formam **a mesma entrega** (a parcela só conta no mês certo com a 040b); em *commits* e PRs separados (§9).
- **Nomes de arquivo**: o arquivo manteve o sufixo `-esboco` apenas para **não quebrar links** de outras pastas; o conteúdo é o SDD completo.

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta | Resolução |
| :-- | :-- |
| Modelo | `InstallmentPlan` (cabeçalho, **sem valor próprio no ledger**) + **N** `Transaction(kind = EXPENSE)` de cartão, uma por fatura (ADR-017 §1). Extrato, fatura, totais, acerto e saldo **não ganham tabela nova**; o plano **nunca** entra em `SUM`. `count = 1` (e à vista) **não** cria plano: comportamento atual **intacto**. |
| Fatura da parcela *k* | `ref_k = ref_1 + (k − 1) meses`, com `ref_1 = invoiceRefFor(purchaseOn, closingDay)` (**ADR-020 §1**, refina ADR-017 §2). Data nominal `occurredOn_k = addMonthsClamped(purchaseOn, k − 1)` (sempre a partir da data original). |
| Competência | `competenceOn` **derivada no banco** por gatilho (ADR-020 §2): sem plano = `occurredOn`; parcela = `closingDate` da fatura. Toda consulta por período usa `periodPredicate` (muda **uma linha**, §4.6). Compra à vista de 28/11 conta em **novembro**; a parcela 1 da compra parcelada de 28/11 conta em **dezembro** (assimetria D-PO-26 por construção, **sem divergência** entre Extrato, Resumo, Acerto e Análise). |
| Criação atômica | Uma transação do `withApi`: cartão `FOR SHARE` ➜ faturas `ref_1..ref_N` `getOrCreateInvoice` em **ordem crescente de `ref`** (`FOR UPDATE`, até 24) ➜ plano ➜ N parcelas ➜ revisões. Qualquer falha ⇒ *rollback* total (**nada** gravado). |
| Idempotência | `Idempotency-Key` cobre a compra inteira (duplo clique = **1** plano com N parcelas). A resposta guardada contém o plano e as parcelas. |
| Limite | **Nenhuma regra nova**: `cardUsage` já soma todas as faturas **sem pagamento ativo**, inclusive as futuras ⇒ o total da compra consome o limite na hora e cada pagamento de fatura libera só a parcela daquela fatura (SDD-008 §4.2). Aviso de limite é da UI e usa o **total** (D-PO-08). |
| Total mínimo e 24x | `installments` 1..24; `amountInCents` (total) ≥ `installments` (≥ 1 centavo por parcela) ⇒ `422 INSTALLMENT_TOTAL_TOO_SMALL`. O 24x é só validação (não muda a estimativa). |
| "Dividir" até a US-042 | Constante `INSTALLMENT_SPLIT_RELEASED` (`cartoes/installments.ts`, `false` até a US-042). `isSharedExpense: true` com `installments > 1` ⇒ `422 INSTALLMENT_SPLIT_UNAVAILABLE`. Depois da US-042 exige também `family.splitEngine = 'STORED'` (a EN-002 já aplicada). `TransactionDefaults.split.installmentsAvailable` informa a UI ("Disponível em breve"). |
| Parcelas somente leitura até a US-041 | `PATCH`, `delete` e `restore` de linha com `installmentPlanId` ⇒ `422 INSTALLMENT_NOT_EDITABLE` (guarda única `assertEditableTransaction`, §4.8). O contorno é **excluir a compra inteira** (040b). |
| Exclusão da compra inteira (040b, vinda da US-041) | `POST /installment-plans/:id/delete`: só se **toda** parcela ativa está em fatura **aberta** (`invoiceStatus = OPEN`: hoje ≤ `closingDate` e sem pagamento ativo); senão `422 INSTALLMENT_PLAN_LOCKED` ("Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."). **Desfazer** = `restore`, que devolve **só** as parcelas removidas por **aquela** exclusão (ADR-020 §3). |
| Mês acertado (US-042/US-013b) | Criar compra em mês acertado **não** exige confirmação (como qualquer despesa retroativa, SDD-009 §1). **Excluir/editar** parcela **comum** (com rateio) cujo período de competência tenha acerto ativo exige `confirmSettledPeriod: true` (`409 SETTLED_PERIOD_CONFIRMATION_REQUIRED`, `details.periods` = **união** dos períodos afetados). |
| Datas futuras no ledger | Parcelas 2..N têm `occurredOn` futura. A validação "não pode ser futura" vale para `purchaseOn`. **Três** consultas filtram `occurredOn <= hoje`: `recent` da Home, `getDefaults` e `usageCountByMe` (ADR-020 §4). |
| Faturas futuras | Materializadas na criação (`ref_2..ref_N`). `InvoiceSummaryDTO.isFuture = ref > openInvoiceRef(hoje)`; `InvoiceDTO.nextRef` passa a ir **até a última fatura materializada**; fatura futura tem `status = OPEN` pela função pura e `canPay = false` (`payInvoice` já exige `CLOSED`). Em "A pagar" (Resumo/Previstas) entram por **vencimento** como qualquer fatura com total > 0 (SDD-010 §4.2). |
| "Parcelas futuras" (UI) | `CardDTO.installmentsFutureInCents` = Σ parcelas **ativas** em faturas com `ref > openInvoiceRef(hoje)`; `InvoiceDTO.futureInstallmentsInCents` = Σ parcelas ativas em faturas do **mesmo cartão** com `ref >` a da fatura exibida. Hipótese do TL (TL-16): a PO só pediu "subtotal na fatura e no cartão". |
| Cartão arquivado (SDD-012) | `CARD_HAS_FUTURE_INSTALLMENTS` passa a existir (§4.9): existe parcela ativa em fatura `ref > open` sem pagamento ativo. Postar/restaurar parcela em cartão arquivado ⇒ `INVALID_REFERENCE` (`cardId`). |
| Tags, rateio, observação | Herdados do plano por cada parcela: tags (todas as parcelas, SDD-016), `categoryId`, `description`, `payerMemberId`, `note`, rateio (SDD-015; cada parcela com **seus** centavos). |
| Juros / valor da parcela | Fora (RN-003.9). O campo de valor é o **total**. |
| Atualização otimista | **Não** há para compra parcelada (N linhas e competência diferem da data): a UI só invalida os caches ao receber `201`. A compra à vista mantém a otimista do SDD-001 §5.1. |
| Concorrência entre compras | Todas as escritas travam faturas **em ordem crescente de `ref`** (ADR-014 §6): compras simultâneas no mesmo cartão **não** geram *deadlock* (teste `Promise.all`). Ordem global de travas: **plano ➜ faturas (asc)** nas operações de plano; **cartão ➜ faturas (asc) ➜ plano novo** na criação. |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/cartoes/installments.ts  (PURO: sem Prisma, sem Date.now())
export const MAX_INSTALLMENTS = 24;
export const INSTALLMENT_SPLIT_RELEASED = false;          // vira true no commit da US-042
export type InstallmentDraft = {
  no: number; amountInCents: number;
  occurredOn: DateISO;        // data nominal (exibida e usada na ordenação do Extrato)
  invoiceRef: string;         // "YYYY-MM" (mês de fechamento)
  competenceOn: DateISO;      // closingDate da fatura (INFORMATIVA: o banco recalcula; usada na prévia e nos testes)
};
export function splitInstallments(totalInCents: number, count: number): number[];   // toda a sobra na parcela 1; RangeError se count < 1 ou total < count
export function addMonthsClamped(date: DateISO, months: number): DateISO;           // sempre a partir da data ORIGINAL (não encadeia)
export function buildInstallments(i: { totalInCents: number; count: number; purchaseOn: DateISO; closingDay: number; dueDay: number }): InstallmentDraft[];
                                                                                    // count < 2 ⇒ RangeError (o serviço nem chama)
export type InstallmentPreview = { count: number; firstInCents: number; othersInCents: number; sameAmount: boolean; firstInvoiceRef: string };
export function previewInstallments(i: { totalInCents: number; count: number; purchaseOn: DateISO; closingDay: number }): InstallmentPreview;

// src/modules/transacoes/schemas.ts (emenda ao SDD-008 §3.2; `isSharedExpense` é o do SDD-011/R2.1; o SDD-015 troca por `split`)
const INSTALLMENTS_MSG = "Escolha de 1 a 24 parcelas";
const installmentsSchema = z.number({ error: INSTALLMENTS_MSG }).int(INSTALLMENTS_MSG)
  .min(1, INSTALLMENTS_MSG).max(MAX_INSTALLMENTS, INSTALLMENTS_MSG).default(1);
// CreateExpenseSchema ganha `installments: installmentsSchema` e, no superRefine:
//   installments > 1 && !cardId  ⇒ issue path ["installments"], "Parcelas só valem para compra no cartão"  (400)
// CreateIncomeSchema: `installments` ⇒ 400 pelo .strict()

export const DeleteInstallmentPlanSchema  = z.object({ version: versionSchema, confirmSettledPeriod: z.boolean().optional() }).strict();
export const RestoreInstallmentPlanSchema = z.object({ version: versionSchema }).strict();
export const EditInstallmentSchema = z.object({                       // US-041 (ordem 6): SÓ então a rota deixa de responder INSTALLMENT_NOT_EDITABLE
  version: versionSchema,                                              // da PARCELA
  planVersion: versionSchema,
  scope: z.enum(["ONLY_THIS", "THIS_AND_NEXT"]).default("ONLY_THIS"),
  confirmSettledPeriod: z.boolean().optional(),
  amountInCents: amountInCentsSchema.optional(),                       // valor DA PARCELA (não o total)
  categoryId: uuidSchema.optional(),
  description: z.string().trim().min(2, "A descrição deve ter no mínimo 2 caracteres").max(100, "A descrição deve ter no máximo 100 caracteres").optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).strict().refine((v) => ["amountInCents", "categoryId", "description", "note"].some((k) => k in v), { message: "Nada para alterar" });

// ── DTOs ──
export type InstallmentDTO = { planId: string; no: number; count: number };     // TransactionDTO.installment | null
// TransactionDTO ganha: installment: InstallmentDTO | null;  competenceOn: string (YYYY-MM-DD)
export type InstallmentParcelDTO = {
  transactionId: string; no: number; amountInCents: number; occurredOn: string;
  invoice: { ref: string; closingDate: string; dueDate: string; status: InvoiceStatus; isFuture: boolean };
  state: "ACTIVE" | "REMOVED";                                          // REMOVED = excluída (plano inteiro ou parcela avulsa, US-041)
  locked: boolean; lockedReason: "INVOICE_CLOSED" | "INVOICE_PAID" | null;   // fatura não aberta ⇒ travada (só leitura)
  version: number;
};
export type InstallmentPlanDTO = {
  id: string; description: string; note: string | null;
  card: { id: string; name: string; color?: AccountColor };            // `color` entra com a US-050
  category: { id: string; name: string; icon: string };
  payer: MemberRef; author: MemberRef;
  count: number; purchaseOn: string;
  totalInCents: number;                                                 // total ORIGINAL da compra
  currentTotalInCents: number;                                          // Σ parcelas ATIVAS (muda com a US-041)
  activeCount: number;
  installments: InstallmentParcelDTO[];                                 // todas, por `no`
  isShared: boolean;                                                    // alguma parcela com rateio (US-042)
  canDelete: boolean; deleteBlockedReason: "INVOICE_CLOSED" | "INVOICE_PAID" | "CARD_ARCHIVED" | null;
  version: number; deleted: boolean; deletedAt: string | null;
};
export type CreateTransactionResponse = {                              // SDD-008 §3.2 ganha:
  transaction: TransactionDTO;                                          // parcela 1
  plan?: InstallmentPlanDTO;                                            // só quando installments > 1
  card?: { id: string; usedInCents: number; availableInCents: number };
};
// CardDTO ganha: installmentsFutureInCents: number
// InvoiceSummaryDTO ganha: isFuture: boolean ;  InvoiceDTO ganha: futureInstallmentsInCents: number (nextRef vai até a última materializada)
// SharedExpenseItemDTO (SDD-002 §2) ganha: installment: { no: number; count: number } | null ; competenceOn: string   (US-042)
// TransactionDefaults.split (SDD-011 §3) ganha: installmentsAvailable: boolean
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

| Rota | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `POST /api/v1/transactions` (`cardId` + `installments` ≥ 2) | `CreateExpenseSchema` | `201 CreateTransactionResponse` (com `plan`) | 400 (`installments`; "Escolha de 1 a 24 parcelas", "Parcelas só valem para compra no cartão") · 422 `INSTALLMENT_TOTAL_TOO_SMALL` "O valor total precisa ter ao menos 1 centavo por parcela" · 422 `INSTALLMENT_SPLIT_UNAVAILABLE` "Dividir compras parceladas ainda não está disponível" · 422 `INVOICE_ALREADY_PAID` (qualquer fatura do intervalo; `details.ref`; "A fatura de {mês/ano} já foi paga. Use uma data posterior ao fechamento.") · 422 `FUTURE_DATE_NOT_ALLOWED` ("A data da compra não pode ser futura", sobre `purchaseOn`) · 422 `INVALID_REFERENCE` (cartão arquivado/de outra família) · 422 `SETTLEMENT_DISABLED` |
| `GET /api/v1/installment-plans/:id` | — | `200 { plan: InstallmentPlanDTO }` | 404 (inexistente **ou de outra família**) |
| `POST /api/v1/installment-plans/:id/delete` (**040b**) | `DeleteInstallmentPlanSchema` | `200 { plan, card: { id, usedInCents, availableInCents } }` | 404 · 409 `VERSION_CONFLICT` · 409 `ALREADY_DELETED` · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` · 422 `INSTALLMENT_PLAN_LOCKED` "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas." |
| `POST /api/v1/installment-plans/:id/restore` (**040b**, o "Desfazer") | `RestoreInstallmentPlanSchema` | `200 { plan, card }` | 404 · 409 `VERSION_CONFLICT` · 422 `NOT_RESTORABLE` (não excluído) · 422 `INVOICE_PAID_LOCKED` (alguma fatura ganhou pagamento) · 422 `INVALID_REFERENCE` (cartão arquivado) · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` |
| `PATCH /api/v1/transactions/:id` · `POST …/:id/delete` · `…/restore` em **parcela** | — | — | **até a US-041**: `422 INSTALLMENT_NOT_EDITABLE` "Esta parcela não pode ser alterada. Exclua a compra parcelada e lance de novo." |
| `PATCH /api/v1/transactions/:id` em parcela (**US-041**) | `EditInstallmentSchema` | `200 { transactions: TransactionDTO[]; plan: InstallmentPlanDTO; card }` (as parcelas **efetivamente** alteradas, por `no`) | 409 `VERSION_CONFLICT` ("Esta compra foi alterada por {Nome}. Recarregue para continuar.") · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` · 422 `INSTALLMENT_LOCKED` ("Fatura {fechada\|paga}: a parcela não pode ser alterada.") · 422 (categoria/valor como no SDD-001) |
| `POST /api/v1/transactions/:id/delete` · `restore` em parcela (**US-041**) | `TransactionStateSchema` | `200 { transaction, plan, card }` | 409 `VERSION_CONFLICT` · 422 `INSTALLMENT_LOCKED` |
| `GET /api/v1/cards[/:id]` · `GET /api/v1/cards/:id/invoices[/:ref]` | — | `CardDTO.installmentsFutureInCents`; `InvoiceDTO.isFuture`, `futureInstallmentsInCents`, `nextRef` até a última materializada | — |
| `GET /api/v1/transactions` | — | `TransactionDTO.installment`, `competenceOn`; o intervalo `from/to` passa de 366 dias para **24 meses** (SDD-016 §3.4) | — |

`PATCH` de parcela: `422 INSTALLMENT_LOCKED` só quando a **própria** parcela está em fatura não aberta; em `THIS_AND_NEXT` as seguintes travadas são **puladas** (não é erro; a resposta lista só as alteradas). `INSTALLMENT_NOT_EDITABLE` deixa de existir no commit da US-041 (a guarda passa a delegar a `editInstallment`).

---

## 4. Regras e algoritmos

### 4.1 Funções puras (`src/modules/cartoes/installments.ts`; 100% de ramos; entram em `PURE` do `check:imports`)
- `splitInstallments(total, n)`: `base = ⌊total ÷ n⌋`, `sobra = total − base × n` **toda na parcela 1** (RN-003.4); `RangeError` se `n < 1` ou `total < n`.
- `addMonthsClamped(d, m)`: ano/mês de `d` + `m`, dia = `min(dia(d), últimoDiaDoMês)`; **nunca encadeia** (31/01 ➜ 28/02 ➜ **31**/03).
- `buildInstallments`: `ref_1 = invoiceRefFor(purchaseOn, closingDay)`; para cada `k`: `invoiceRef = addMonthsToRef(ref_1, k − 1)`; `competenceOn = invoiceDates(invoiceRef, closingDay, dueDay).closingDate`; `occurredOn = addMonthsClamped(purchaseOn, k − 1)`; valores de `splitInstallments`.
- `previewInstallments`: `sameAmount = (primeira == demais)`; `firstInvoiceRef = ref_1`. O texto é montado **no componente** com `<Money>` (a regra `check:imports` proíbe `formatBRL` fora de `Money`): `"{n}x de {Money} · 1ª na fatura de {formatInvoiceLabel(ref)}"`; se `!sameAmount`: `"1ª de {Money} + {n−1}x de {Money} · 1ª na fatura de …"`.

**Vetores obrigatórios** (`tests/unit/cartoes/installments.test.ts`):
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| I1 | `splitInstallments(100001, 3)` | `[33335, 33333, 33333]` |
| I2 | `splitInstallments(250000, 10)` | dez × `25000` |
| I3 | `addMonthsClamped("2027-01-31", 1)` / `2` | `"2027-02-28"` / `"2027-03-31"` |
| I4 | `addMonthsClamped("2028-01-31", 1)` | `"2028-02-29"` (bissexto) |
| I5 | compra 2026-11-10, fechamento 25, vencimento 5, 10x de 250000 | refs `2026-11 … 2027-08`; parcela 10 em `2027-08-10`; `competenceOn` `2026-11-25 … 2027-08-25` |
| I6 | compra 2026-11-28 (depois do fechamento 25), 10x | `ref_1 = 2026-12`, `competenceOn 2026-12-25`; parcela 2: `occurredOn 2026-12-28`, `ref 2027-01` |
| I7 | `buildInstallments({ count: 1 })` | `RangeError` (o serviço trata `1` como à vista e **não** chama) |
| I8 | `splitInstallments(2, 3)` · `splitInstallments(1, 24)` | `RangeError` (serviço: `INSTALLMENT_TOTAL_TOO_SMALL`) |
| I9 | fechamento **28**, compra 2027-01-31, 3x de 90000 | datas `01-31`, `02-28`, `03-31`; refs **`2027-02`, `2027-03`, `2027-04`**; `competenceOn` `…-28` (ADR-020: **uma parcela por fatura**) |
| I10 | BDD "Curso": fechamento 25, compra 2027-01-31, 3x de 60000 | datas `01-31`, `02-28`, `03-31`; refs `2027-02`, `2027-03`, `2027-04` |
| I11 | `splitInstallments(24, 24)` · `(25, 24)` | 24 × `1` · `[2, 1 × 23]` |
| I12 | compra 2026-11-10, 24x | última parcela em `ref 2028-10`, data `2028-10-10` |
| Propriedades (≥ 1000 casos, semente fixa) | Σ parcelas = total; todas ≥ 1; parcela 1 ≥ demais e `p1 − p2 ∈ [0, n−1]`; refs **estritamente consecutivas**; `occurredOn_k ≤ closingDate(ref_k) < occurredOn_k + 1 mês`; `competenceOn` crescente; repetir a chamada dá o mesmo resultado |

### 4.2 `createInstallmentPurchase` (dentro de `createExpenseCore`, quando `cardId` e `installments ≥ 2`)
1. Defaults: `purchaseOn = occurredOn ?? hoje`; `payerMemberId ??= ctx.memberId`. Validar referências **da família** (cartão **ativo**, categoria ativa de despesa, pagador) como no SDD-008 §4.4; `purchaseOn ≤ hoje`; `total ≥ installments`.
2. Guarda de divisão: `isSharedExpense` (ou `split` ≠ NONE, SDD-015) com `INSTALLMENT_SPLIT_RELEASED = false` ou motor ≠ `STORED` ⇒ `422 INSTALLMENT_SPLIT_UNAVAILABLE`; acerto desligado ⇒ `422 SETTLEMENT_DISABLED`.
3. `drafts = buildInstallments(...)`.
4. `lockFamilySplit(tx, familyId)` (**só** quando há rateio; SDD-015 §4.7).
5. Cartão `FOR SHARE` (uma vez) e, **em ordem crescente de `ref`**, `getOrCreateInvoice` das N faturas (`FOR UPDATE`); alguma com pagamento ativo (`activePayments`) ⇒ `422 INVOICE_ALREADY_PAID` (`details.ref` = a **primeira** em ordem crescente).
6. `INSERT InstallmentPlan { totalInCents, installmentCount, purchaseOn, description, categoryId, payerMemberId, authorMemberId, version 1 }`.
7. `INSERT` das N parcelas (`createManyAndReturn`; `competenceOn` **omitida**: o gatilho a deriva), cada uma com `invoiceId` da sua fatura, `installmentPlanId/No/Count`, `isSharedExpense`, `payerMemberId`, `authorMemberId = ctx.memberId`.
8. Rateio por parcela (US-042, só se compartilhada): `splitAmount({ amount: parcela.amountInCents, shares, payerMemberId })` com **o mesmo** vetor para todas (resolvido **uma vez** na data da compra, SDD-015 §4.2); `INSERT transaction_splits`.
9. Tags (SDD-016 §4.2): `INSERT transaction_tags` de **todas** as parcelas.
10. `recordRevision(CREATE)` de cada parcela (`changes[0].to` inclui `installment: { planId, no, count }`, `invoiceRef`, `competenceOn`).
11. Resposta: parcela 1 (DTO), `plan` (DTO), `card: { usedInCents, availableInCents }` (`cardUsage`).
**Complexidade**: ≤ 24 faturas, ≤ 24 parcelas, ≤ 24 × (1 + membros + tags) linhas filhas. Tudo na mesma transação; sem laços de rede.

### 4.3 `deleteInstallmentPlan` (040b) — uma transação do `withApi`
1. `SELECT … FROM installment_plans WHERE id AND familyId FOR UPDATE` (`404` se inexistente/de outra família); `version` divergente ⇒ `409 VERSION_CONFLICT`; `deletedAt` ≠ NULL ⇒ `409 ALREADY_DELETED`.
2. Parcelas **ativas** do plano; faturas distintas **travadas em ordem crescente de `ref`**.
3. Para cada parcela: `invoiceStatus` com `today`; qualquer fatura **não** `OPEN` (`CLOSED` ou `PAID`) ⇒ `422 INSTALLMENT_PLAN_LOCKED` (**nada** gravado).
4. Mês acertado: se alguma parcela tem rateio e o período de sua `competenceOn` (via `periodOf(competenceOn, cutDay)`) tem acerto ativo ⇒ exige `confirmSettledPeriod` (`409` com `details.periods` = união).
5. `at = ctx.clock.now()`; `UPDATE transactions SET deletedAt = at, deletedByMemberId = :me, deletionReason = 'DELETED', version = version + 1, updatedByMemberId = :me WHERE installmentPlanId = :id AND deletedAt IS NULL`; `UPDATE installment_plans SET deletedAt = at, deletedByMemberId, version = version + 1`. Revisão `DELETE` por parcela (`changes: [{ field: "installmentPlan", from: "ACTIVE", to: "DELETED" }]`).
6. Resposta: plano (`deleted = true`) e `card` (uso recalculado: **limite devolvido**).
**Restaurar** (`restoreInstallmentPlan`): mesmas travas; `version` do plano; `deletedAt` nulo ⇒ `422 NOT_RESTORABLE`; cartão arquivado ⇒ `INVALID_REFERENCE`; faturas com pagamento ativo ⇒ `422 INVOICE_PAID_LOCKED`; restaura **apenas** parcelas com `deletedAt = plan.deletedAt` (ADR-020 §3); limpa as colunas de exclusão do plano e das parcelas; `version + 1`; revisões `RESTORE`. Restaurar em fatura que **fechou** (não paga) é **permitido** (como o `restore` do SDD-008 §4.6): o aviso "Desfazer" dura ≥ 8 s, mas a regra vale a qualquer tempo.
**Idempotência**: `Idempotency-Key` por intenção; a exclusão repetida com chave nova ⇒ `409 ALREADY_DELETED`.

### 4.4 `getInstallmentPlan`
Plano + parcelas (todas, inclusive `REMOVED`), cada uma com `invoice` (`ref`, datas, `status` pela função pura **com `today`**, `isFuture`) e `locked` (`status ≠ OPEN`). `canDelete = !deleted ∧ cartão ativo ∧ toda parcela ativa em fatura OPEN`. `currentTotalInCents`/`activeCount` das parcelas ativas.

### 4.5 Faturas futuras, limite e "Parcelas futuras" (emendas ao SDD-008 §4.2 e §6)
- `listInvoices`/`getInvoice`: `isFuture`; `previousRef`/`nextRef` percorrem **todas as materializadas** (da mais antiga até a última futura); a fatura **aberta** continua sendo a de `openInvoiceRef(hoje)`.
- `futureInstallmentsInCents` e `installmentsFutureInCents`: uma consulta agrupada (`SUM` de parcelas ativas por fatura com `ref >`), reaproveitando `invoiceTotals` filtrado por `installmentPlanId IS NOT NULL`.
- Rótulo na fatura: **"{descrição} {no}/{count}"** montado no cliente a partir de `description` e `installment` (a descrição gravada **não** leva o sufixo).
- `usedInCents`: sem alteração (já soma faturas futuras). **Invariante** (teste): `usedInCents` = Σ `totalInCents` das faturas não pagas, futuras incluídas.

### 4.6 Competência: o predicado único (**US-040b**, primeiro *commit*)
`ledger-where.ts` (SDD-010 §4.1) muda **uma linha** em cada função:
```typescript
periodPredicate: Prisma.sql`${raw(`${alias}."competenceOn"`)} BETWEEN ${start}::date AND ${end}::date`
periodFilter:    { competenceOn: { gte, lte } }
```
Consumidores (todos já passam por aqui; **conferir um a um**): `buildLedgerWhere`, `ledgerTotals`, `ledgerPageIds`, `paidByMember`, `split/repo.sharedExpenses`, `pendingSettlementMonths` (agrupa por `periodOf(competenceOn, cutDay)`), `personalSummary`, `getMonthSummary`, carga do acerto, `listSharedExpenses`, `isSettledPeriod` das edições (período = `periodOf(competenceOn)`; em `PATCH` de `occurredOn` de lançamento comum a nova competência é a própria nova data). **Ordenação e cursor do Extrato não mudam** (`occurredOn, createdAt, id`); o índice novo `(familyId, competenceOn DESC, createdAt DESC, id DESC)` atende o filtro por período.
`check:imports` (SDD-006 §6): `PERIOD_FILTER` passa a casar **`occurredOn` e `competenceOn`** com `BETWEEN/gte/lte/gt/lt` fora de `ledger-where.ts` (e `tests/`, `prisma/`); novo teste em `tests/unit/check-imports.test.ts`.
**Propriedade de reconciliação** (≥ 200 conjuntos, `tests/support/prng.ts`; entra no mesmo teste do SDD-010 §8): para dados aleatórios **com** compras à vista e parcelas antes/depois do fechamento, compras de cartão, previstas pagas, transferências e excluídos: `GET /transactions` (totais e `byMember`) = `getMonthSummary` = Σ de `GET /settlement/expenses` = `computeSettlement.totalShared` (US-042) para **todo** período; e a compra à vista de 28/11 está **só** em novembro enquanto a parcela 1 da parcelada do mesmo dia está **só** em dezembro.

### 4.7 Mês acertado e ex-membro (US-042)
- A compra parcelada com rateio grava `splitMode`, `bps` e centavos **por parcela** (SDD-015). Ex-membro: as linhas de rateio guardam o `memberId` (ADR-019); nenhuma regra nova.
- Excluir plano/parcela de mês acertado: ver §4.3 (4) e SDD-001 §4.2 (5).
- Crédito do acerto: `payerMemberId` da parcela (Q-20) — **quem paga a fatura não muda nada**.

### 4.8 Guarda única de edição (`assertEditableTransaction`, SDD-001/008/009/012)
Ordem **fixa** (primeira que casa vence): `NOT_EDITABLE` (kind) ➜ `LINKED_TO_PLANNED` ➜ **`INSTALLMENT_NOT_EDITABLE`** (parcela, até a US-041; depois delega a `editInstallment`) ➜ `ACCOUNT_ARCHIVED_LOCKED` ➜ `INVOICE_PAID_LOCKED`.

### 4.9 `CARD_HAS_FUTURE_INSTALLMENTS` (SDD-012 §4.1)
Dentro do `FOR UPDATE` do cartão, depois de `CARD_HAS_UNPAID_INVOICE` e `CARD_HAS_OPEN_PURCHASES`: existe `Transaction` ativa com `installmentPlanId` em fatura com `ref > openInvoiceRef(hoje)` e **sem** pagamento ativo ⇒ `422 CARD_HAS_FUTURE_INSTALLMENTS` "Este cartão tem parcelas futuras. Exclua as compras parceladas antes de arquivar" (o teste *skipped* do SDD-012 §8 passa a valer).

### 4.10 US-041 (ordem 6; depende da US-040, US-016b, US-013a)
`editInstallment` (uma transação):
1. `SELECT plan FOR UPDATE` (a **primeira** trava; todas as operações de parcela e de plano a respeitam); `planVersion` e `version` da parcela conferem ⇒ senão `409 VERSION_CONFLICT` ("Esta compra foi alterada por {Nome}. Recarregue para continuar.").
2. Alvo = parcela selecionada (`ONLY_THIS`) ou ela e as de `no` maior **ativas** (`THIS_AND_NEXT`). Faturas travadas em ordem crescente. Parcela selecionada em fatura **não aberta** ⇒ `422 INSTALLMENT_LOCKED`; as seguintes não abertas são **puladas** (regra da US-041: fatura **fechada ou paga** trava a parcela; é **mais estrita** que a edição de compra única da US-016b, onde só a fatura **paga** trava — registrada em TL-12).
3. `amountInCents` aplica o **mesmo valor** a cada parcela alvo; `categoryId`, `description`, `note` idem. Rateio: **recalcula centavos** com os mesmos `bps` de cada parcela (`splitAmount`, SDD-015 §4.4).
4. Mês acertado (parcelas comuns): `confirmSettledPeriod` com a união dos períodos das alvo.
5. Cada parcela alterada: `version + 1`, `updatedByMemberId`, revisão `UPDATE` com `changes` (inclui `installment`); `plan.version + 1`.
6. Excluir **uma** parcela: `POST /transactions/:id/delete` (mesma trava de plano e de fatura aberta); a parcela fica `REMOVED` em "Ver compra" (registro "parcela 3/10 removida"); `restore` da parcela (aviso "Desfazer" ≥ 8 s) exige fatura **não paga**. A compra fica com `activeCount − 1`.
7. "Histórico" por parcela: `GET /transactions/:id/history` (já existe).
**Duplo clique**: mesma chave ⇒ 1 efeito; chaves diferentes ⇒ a 2ª vê `VERSION_CONFLICT` (versão do plano/parcela mudou).

### 4.11 Invariantes (verificadas por teste)
1. Σ parcelas ativas **do plano recém-criado** = `totalInCents`; `count` linhas; `no` 1..`count` únicos; refs consecutivas.
2. `competenceOn` das parcelas = `closingDate` da fatura; das demais linhas = `occurredOn` (gatilho **e** `CHECK`).
3. O plano **não** aparece em nenhum `SUM` (nenhuma consulta o lê para valores).
4. `usedInCents` do cartão = Σ faturas não pagas; excluir o plano devolve exatamente a soma das parcelas ativas excluídas; restaurar a recompõe.
5. Parcela só existe em compra de cartão (`CHECK tx_installment_shape_chk`).
6. Excluir o plano não toca nas parcelas já removidas antes (carimbo).

---

## 5. Dados e migração (R3; **uma** migração `us040_parcelamento`, SQL cru; nunca editar migração aplicada)

```prisma
model InstallmentPlan {
  id                String    @id @default(uuid()) @db.Uuid
  familyId          String    @db.Uuid
  cardId            String    @db.Uuid
  totalInCents      BigInt                                    // total ORIGINAL (> 0); o corrente é derivado das parcelas
  installmentCount  Int                                       // 2..24
  purchaseOn        DateTime  @db.Date
  description       String                                    // 2..100 (sem o sufixo "n/N")
  note              String?
  categoryId        String    @db.Uuid
  payerMemberId     String    @db.Uuid
  authorMemberId    String    @db.Uuid
  updatedByMemberId String?   @db.Uuid
  version           Int       @default(1)
  createdAt         DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime  @updatedAt @db.Timestamptz(3)
  deletedAt         DateTime? @db.Timestamptz(3)
  deletedByMemberId String?   @db.Uuid
  family   Family     @relation(fields: [familyId], references: [id])
  card     CreditCard @relation(fields: [familyId, cardId], references: [familyId, id])
  category Category   @relation(fields: [familyId, categoryId], references: [familyId, id])
  payer    Member     @relation("PlanPayer",  fields: [familyId, payerMemberId],  references: [familyId, id])
  author   Member     @relation("PlanAuthor", fields: [familyId, authorMemberId], references: [familyId, id])
  parcels  Transaction[]
  @@unique([familyId, id])
  @@index([familyId, cardId, purchaseOn])
  @@map("installment_plans")
}
model Transaction {                                           // ALTERAÇÕES (demais campos inalterados)
  installmentPlanId String?   @db.Uuid
  installmentNo     Int?
  installmentCount  Int?
  competenceOn      DateTime  @default(dbgenerated("CURRENT_DATE")) @db.Date   // SEMPRE sobrescrita pelo gatilho (ADR-020 §2)
  plan InstallmentPlan? @relation(fields: [familyId, installmentPlanId], references: [familyId, id], onDelete: Restrict, onUpdate: Restrict)
  @@index([familyId, competenceOn(sort: Desc), createdAt(sort: Desc), id(sort: Desc)])
  @@index([familyId, kind, competenceOn])
}
```
Acrescentar as relações inversas em `Family`, `CreditCard`, `Category` e `Member` (o Prisma exige). Se o Prisma 7 recusar a FK composta com coluna opcional, vale o *fallback* do SDD-000 (FK só no SQL).

```sql
-- us040_parcelamento (depois do CREATE TABLE/ALTER gerado pelo Prisma; ordem importa)
-- 1) retropreenchimento ANTES do gatilho (o Prisma cria a coluna NOT NULL DEFAULT CURRENT_DATE; o UPDATE corrige as linhas existentes;
--    tabela pequena; UPDATE SQL não passa por @updatedAt nem altera `version`)
UPDATE "transactions" SET "competenceOn" = "occurredOn";
-- 2) CHECKs
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_count_chk CHECK ("installmentCount" BETWEEN 2 AND 24);
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_total_chk CHECK ("totalInCents" >= "installmentCount");
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL) OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL));
ALTER TABLE "transactions" ADD CONSTRAINT tx_installment_shape_chk CHECK (
  ("installmentPlanId" IS NULL AND "installmentNo" IS NULL AND "installmentCount" IS NULL)
  OR ("installmentPlanId" IS NOT NULL AND "installmentCount" BETWEEN 2 AND 24 AND "installmentNo" BETWEEN 1 AND "installmentCount"
      AND kind = 'EXPENSE' AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL));
ALTER TABLE "transactions" ADD CONSTRAINT tx_competence_chk CHECK ("installmentPlanId" IS NOT NULL OR "competenceOn" = "occurredOn");
CREATE UNIQUE INDEX tx_installment_no_uq ON "transactions" ("installmentPlanId", "installmentNo") WHERE "installmentPlanId" IS NOT NULL;
-- 3) gatilho de competência (ADR-020 §2)
CREATE FUNCTION tx_sync_competence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."installmentPlanId" IS NULL THEN
    NEW."competenceOn" := NEW."occurredOn";
  ELSE
    SELECT "closingDate" INTO STRICT NEW."competenceOn" FROM "card_invoices" WHERE "id" = NEW."invoiceId" AND "familyId" = NEW."familyId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transactions_sync_competence BEFORE INSERT OR UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION tx_sync_competence();               -- em TODA escrita (inclusive soft delete): ninguém grava competência à mão
-- 4) índices de período por competência (o índice por occurredOn permanece: ordenação/cursor do Extrato)
CREATE INDEX tx_family_competence_idx ON "transactions" ("familyId", "competenceOn" DESC, "createdAt" DESC, "id" DESC);
CREATE INDEX tx_family_kind_competence_idx ON "transactions" ("familyId", "kind", "competenceOn");
```
O gatilho dispara em **todo** `INSERT/UPDATE`, portanto editar a data de uma compra comum mantém `competenceOn = occurredOn` sem código na aplicação e uma escrita direta de `competenceOn` é sobrescrita. `tx_kind_shape_chk` **não** muda. **Regressão obrigatória** logo após a migração: S1..S13 (+ S14..S16 se a R2.1 já os entregou), dados homologados nomeados (316990 / 158495 / 114995; 71700 / 35850 / 26050; 78000 / 62000), `test:int` e `test:e2e` completos. Fábricas/seed: `makeInstallmentPurchase({ card, total, count, purchaseOn, shared? })` (gera via **serviço**, não por SQL, para exercitar o gatilho) e plano de demonstração no `prisma/seed.ts`.

---

## 6. Interface

- **Drawer de despesa** (`transaction-drawer.tsx`): com **cartão** em "Pagar com" aparece **"Parcelas"** (`1x` padrão … `24x`; `<select>` nativo, alvo ≥ 44 px) logo abaixo; trocar para conta **volta a 1x e oculta**. Prévia (texto secundário, `aria-live="polite"`): componente `InstallmentPreview` com `previewInstallments` e os dias do cartão em `["cards"]`; usa `<Money>`. Aviso de limite quando **total** > `availableInCents` ("Esta compra passa do limite disponível" + "Confirmar mesmo assim", mesma mecânica do SDD-008 §6). `installments` fora de 1..24 ⇒ "Escolha de 1 a 24 parcelas" (campo `aria-invalid`). **"Dividir com a família"** mostra "Disponível em breve" enquanto `defaults.split.installmentsAvailable = false` (US-042 liga); com o acerto desligado o campo some. A `Idempotency-Key` nasce ao abrir o drawer (SDD-000 §7). Sem otimista (§1).
- **Fatura** (`/cartoes/[id]?ref=`): linhas **"{descrição} {no}/{count}"**; chip da fatura futura com texto "Futura"; subtotal **"Parcelas futuras: {Money}"** (`futureInstallmentsInCents`); setas ◀ ▶ até a última materializada. **Cartões** (`/cartoes`): linha "Parcelas futuras" por cartão (`installmentsFutureInCents`).
- **Extrato**: linha de parcela mostra a **data nominal**, a etiqueta **"Fatura {mês/aaaa} · {no}/{count}"** (`formatInvoiceLabel(invoice.ref)`) e o link **"Ver compra"** (abre `InstallmentPlanDialog`); o filtro de período é por **competência** (a parcela 1 de uma compra de 28/11 aparece em **dezembro**).
- **Detalhe da parcela** (`TransactionDetail`, SDD-010 §4.6): **sem** "Editar" (até a US-041) e **com** "Ver compra" e **"Excluir compra parcelada"**; fatura paga mostra "Fatura paga" (sem excluir). Em `INSTALLMENT_NOT_EDITABLE` (acesso direto) a UI mostra a mensagem e o atalho para a compra.
- **`InstallmentPlanDialog`** ("Ver compra"): total, descrição, categoria, tabela das parcelas (`n/N`, mês da fatura, valor, **chip com texto** Aberta/Fechada/Paga/Futura/Removida) e ações; **Excluir compra parcelada** → diálogo de confirmação ("Todas as {n} parcelas serão excluídas e o limite do cartão será devolvido") → `POST …/delete` → toast **"Compra parcelada excluída" com "Desfazer" por ≥ 8 000 ms** (`POST …/restore`); bloqueio mostra a mensagem do servidor (`INSTALLMENT_PLAN_LOCKED`) **sem** fechar o diálogo.
- **Estados**: skeleton do diálogo; erro "Não foi possível carregar a compra" + "Tentar de novo"; sem conexão com a mensagem padrão (SDD-000 §7) e o formulário **preservado**; 409 ⇒ diálogo padrão "Recarregar".
- **Cache** (chaves novas: `["installment-plan", id]`): compra parcelada invalida `["cards"]`, `["card", id]`, `["invoice", cardId]` (prefixo), `["transactions"]`, `["home"]`, `["month-summary"]`, `["settlement"]`, `["payables"]`, `["analysis"]` (SDD-016) e `["tags"]` (se houve tag); excluir/restaurar plano, as mesmas + `["installment-plan", id]`. Atualizar `invalidateFinancialCaches` (SDD-010 §6.5) com `["installment-plan"]`. O **limite exibido** só muda com a resposta do servidor.
- **Responsivo/AA**: 375 px e 1280 px; situação sempre com texto (não só cor); `Dialog` com foco preso e `Esc`; alvos ≥ 44 px.

---

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); `planId`, `cardId`, `invoiceId` de outra família ⇒ `404`/`INVALID_REFERENCE`; FKs compostas `(familyId, …)` (inclui `installmentPlanId`); `.strict()` rejeita `familyId`, `invoiceId`, `competenceOn`, `installmentPlanId/No/Count`, `authorMemberId`, `deletedAt`. `invoiceId` e `competenceOn` **nunca** vêm do cliente. Logs (pino) sem descrição/valores. Teste de isolamento por recurso (SDD-000 §9.4) para `GET/delete/restore` de plano e para a compra no cartão de outra família ("Não encontrado").

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, I = integração (`db-test`), E = E2E

### Regressão (antes e depois da migração e da troca do predicado)
S1..S13 (+ S14..S16) e dados homologados nomeados; `test:int` e `test:e2e` completos; propriedade de reconciliação (§4.6). **O Dev anota no `tasks-board.md` o resultado "antes" e "depois".**

### US-040a (ordem 1)
| Cenário BDD | Testes |
| :-- | :-- |
| Prévia das parcelas | **U**: `previewInstallments` + componente (`10x de R$ 250,00 · 1ª na fatura de nov/2026`; com centavos: `1ª de … + 2x de …`). **E**. |
| Gera uma parcela por fatura | **U**: I5. **I**: `POST` 250000 em 10x ⇒ 10 linhas, faturas `2026-11 … 2027-08`, `GET /cards/:id/invoices/2026-11` mostra "Notebook" 1/10 25000; `2026-12` 2/10; `2027-08` 10/10. **E**. |
| Limite consumido pelo total | **I**: `card.availableInCents = 250000` (limite 500000); `usedInCents = 250000`. |
| Centavos na primeira parcela | **U**: I1. **I**: `POST` 100001 em 3x ⇒ `[33335, 33333, 33333]`, Σ = 100001. |
| À vista como antes / 1x | **I**: `installments: 1` ⇒ **sem** plano, `installment = null`, mesma resposta da R2. **U**: I7. |
| Depois do fechamento / Mesmo dia e fim do mês | **U**: I6, I9, I10, I3, I4. **I**: relógio fixo 28/11 ⇒ `ref_1 = 2026-12`; 31/01/2027 ⇒ datas `02-28` e `03-31`. |
| Pagar a fatura libera só a parcela | **I**: pagar a fatura de nov (`payInvoice`) ⇒ `availableInCents = 275000`. |
| Total acima do limite | **I**: a API **aceita** (disponível negativo); **E**: aviso + "Confirmar mesmo assim". |
| Número inválido | **U/I**: `25`, `0`, `1.5`, `"x"` ⇒ 400 "Escolha de 1 a 24 parcelas"; `installments` com **conta** ⇒ 400 "Parcelas só valem para compra no cartão"; total 2 em 3x ⇒ 422 `INSTALLMENT_TOTAL_TOO_SMALL`. |
| Só meu até a divisão | **I**: `isSharedExpense: true` com `installments > 1` ⇒ 422 `INSTALLMENT_SPLIT_UNAVAILABLE`. **E**: "Disponível em breve". |
| Duplo clique / Falha de rede | **I**: `Promise.all` com a mesma chave ⇒ **1** plano e 10 parcelas, mesma resposta (`Idempotent-Replay`); chave igual com corpo diferente ⇒ 422 `IDEMPOTENCY_KEY_REUSED`. **E**: `route.abort()` ⇒ mensagem padrão, nada gravado, formulário preservado. |
| Isolamento | **I**: cartão de outra família ⇒ 422 `INVALID_REFERENCE`/404 ("Não encontrado" na tela). |
| (infra) Atomicidade | **I**: falha injetada na 7ª parcela ⇒ **nada** gravado (plano, parcelas, faturas criadas pela transação, revisões). |
| (infra) Concorrência | **I**: duas compras de 24x simultâneas no mesmo cartão ⇒ ambas `201`, **sem** *deadlock*; compra × arquivar cartão ⇒ nunca cartão arquivado com parcela futura. |
| (infra) Fatura paga no intervalo | **I**: compra retroativa cuja 2ª parcela cai em fatura já paga ⇒ 422 `INVOICE_ALREADY_PAID`, nada gravado. |
| (infra) Gatilho | **I** (SQL cru): `UPDATE transactions SET "competenceOn" = …` em parcela é **ignorado** (volta ao `closingDate`); `INSERT` de linha comum com `competenceOn` diferente grava `occurredOn`; `CHECK`s `tx_installment_shape_chk` (`installmentNo > count`, sem cartão) e unicidade `(plan, no)`. |
| (infra) Datas futuras | **I**: parcelas 2..N **não** aparecem em `recent` da Home nem em `getDefaults`/`usageCountByMe`. |

### US-040b (ordem 2)
| Cenário BDD | Testes |
| :-- | :-- |
| Despesa do mês conta só a parcela | **I**: `getMonthSummary` e `GET /transactions` (nov e dez) `+25000` cada. |
| Extrato uma linha por parcela | **I**: `GET /transactions?cardId=…&from=2026-11-01&to=2027-08-31` ⇒ 10 itens `installment {no, count}`. **E** (intervalo pela URL; **PO**: o passo "abre o Extrato filtrado pelo cartão" precisa informar o intervalo; ver §9). |
| Parcela no Extrato do mês da fatura / À vista segue a data | **I** (relógio 28/11): Extrato de dez/2026 tem "Notebook" com `invoice.ref 2026-12` e `competenceOn 2026-12-25`; Extrato de nov/2026 **não**; "Mercado" à vista de 28/11 está em **nov** e **não** em dez. **E**: etiqueta "Fatura dez/2026 · 1/10". |
| Ver compra | **I**: `GET /installment-plans/:id` ⇒ total 250000, 10 parcelas com `invoice`. **E**. |
| Excluir a compra inteira | **I**: `delete` ⇒ 200; nenhuma fatura lista "Notebook"; `availableInCents = 500000`; `ledgerTotals` e Resumo sem as parcelas. |
| Desfazer | **I**: `restore` ⇒ 10 parcelas de volta; `availableInCents = 250000`. Parcelas removidas **antes** por outra via permanecem removidas (teste do carimbo). |
| Excluir com parcela em fatura fechada | **I**: relógio após o fechamento (26/11) ⇒ 422 `INSTALLMENT_PLAN_LOCKED` "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."; **nada** excluído. Fatura paga ⇒ idem. |
| Parcela não é editável | **I**: `PATCH`/`delete`/`restore` em parcela ⇒ 422 `INSTALLMENT_NOT_EDITABLE`. **E**: ausência de "Editar", presença de "Excluir compra parcelada". |
| (infra) Predicado único | **U**: `check-imports` (`competenceOn BETWEEN` e `occurredOn BETWEEN` fora do predicado ⇒ violação). **I**: reconciliação (§4.6). |
| (infra) Concorrência | **I**: `delete` do plano × `payInvoice` da fatura 1 (`Promise.all`) ⇒ ou a exclusão vence (e o pagamento recusa/ou fatura vazia) ou o pagamento vence (e a exclusão recebe `INSTALLMENT_PLAN_LOCKED`); `delete` × `delete` ⇒ 1×200 e 1×409. |
| (infra) Mês acertado | **I** (após a US-042): excluir plano comum com parcela em mês acertado ⇒ 409 com `details.periods` (união); com `confirmSettledPeriod` ⇒ 200 e o acerto dos meses é recalculado. |

### US-042 (ordem 4; depois da EN-002; `INSTALLMENT_SPLIT_RELEASED = true`)
| Cenário BDD | Testes |
| :-- | :-- |
| Campo disponível no parcelado / Acerto desligado esconde | **I**: `defaults.split.installmentsAvailable true` com motor `STORED`; acerto desligado ⇒ 422 `SETTLEMENT_DISABLED`. **E**. |
| Cada parcela entra no acerto do seu mês / O total não entra de uma vez | **I** (relógio 10/11, fechamento 25): `POST` 300000 em 3x dividido, pagador Lucas ⇒ `GET /settlement?period=2026-11` `paidInCents` Lucas = 100000, `totalShared` = 100000; `2026-12` = 100000; `2027-01` = 100000; nenhum mês com 300000. |
| Cota por parcela com regra igual | **I**: nov: cotas 50000/50000, **diferença 50000** (R$ 500,00). |
| Quem pagou a fatura não muda o crédito | **I**: Mariana paga a fatura de nov com "Itaú Mariana" ⇒ `paidInCents` de Lucas inalterado (Q-20). |
| Mudar a regra depois não altera | **I**: regra 60/40 a partir de hoje ⇒ parcela 2/3 (dez) continua 50/50 (rateio gravado). **U**: `splitAmount` por parcela. |
| Parcelado Só meu fora do acerto | **I**: 10x sem dividir ⇒ acerto de nov inalterado. |
| Excluir parcela recalcula o acerto do mês | **I** (**depende da US-041**; teste marcado `@depends-US-041`, executado quando a US-041 entra). |
| Lista de despesas do acerto identifica a parcela | **I**: `GET /settlement/expenses?period=2026-11` ⇒ item `installment { no: 1, count: 3 }`, 100000. **E**: "Geladeira 1/3 R$ 1.000,00". |
| (infra) Assimetria | **I**: compra à vista e parcelada dividida em 28/11 caem em meses diferentes **e** Extrato = Resumo = Acerto (propriedade §4.6). |
| (infra) Centavos | **U/I**: 100001 em 3x dividido 50/50, pagador Lucas ⇒ parcelas 33335/33333/33333 com rateios que somam cada parcela (`splitAmount`, SDD-015 V1..V5). |

### US-041 (ordem 6)
| Cenário BDD | Testes |
| :-- | :-- |
| Pergunta o alcance (padrão "Somente esta") | **E/C**: diálogo com as duas opções e a primeira marcada. |
| Editar somente esta / esta e as próximas / categoria de esta e das próximas | **I**: `PATCH` `ONLY_THIS` 30000 na 3/10 ⇒ só ela muda; `usedInCents` +5000. `THIS_AND_NEXT` 20000 ⇒ 3..10 = 20000, 1..2 = 25000. Categoria idem. Revisão `UPDATE` por parcela. |
| Parcela em fatura paga é travada / pula travadas | **I**: `PATCH` na 1/10 (fatura de nov paga) ⇒ 422 `INSTALLMENT_LOCKED`; `THIS_AND_NEXT` na 2/10 com nov paga ⇒ 2..10 alteradas, 1 intacta. **E**: sem "Editar"/"Excluir", com "Fatura paga". |
| Excluir somente uma parcela / Desfazer | **I**: `delete` da 5/10 ⇒ fatura de mar/2027 sem ela, `usedInCents` −25000, `activeCount 9`, parcela `REMOVED`; `restore` (≥ 8 s na UI) a recompõe. |
| Conflito de versão | **I**: dois `PATCH` com a mesma `version` ⇒ 200 e 409 `VERSION_CONFLICT` com `updatedBy`. |
| Histórico / Duplo clique | **I**: `GET /transactions/:id/history` com autor/data; `Promise.all` mesma chave ⇒ **1** revisão. |
| (infra) Mês acertado e rateio | **I**: parcela comum em mês acertado ⇒ 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`; editar o valor recalcula os centavos com os mesmos `bps`. |

---

## 9. Estimativa, ordem de *commits*, dependências e impacto

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-040a | 5 (a US inteira) | **5** | Migração + gatilho, funções puras, criação atômica, faturas futuras, UI do seletor/prévia |
| US-040b | — | **3** | Predicado por competência (1ª linha), etiquetas/"Ver compra", exclusão/desfazer do plano |
| US-042 | 3 | **3** | Só depois da EN-002 (motor `STORED`); vetores do cenário "3x R$ 3.000,00" |
| US-041 | 5 | **5** | `editInstallment`, exclusão de parcela, diálogo de alcance; cortável |
Total do SDD: **16**. Dependências: 040a ➜ 040b ➜ (EN-002) ➜ 042; 041 depende de 040 e 016b/013a; US-033 fecha o critério de parcelas futuras (§4.9).

**Sequência de *commits* atômicos sugerida**
- **040a**: (1) migração `us040_parcelamento` + `schema.prisma` + testes de banco (gatilho, `CHECK`s); (2) `installments.ts` + vetores I1..I12; (3) `createInstallmentPurchase` + rota + schemas + guarda `assertEditableTransaction`; (4) faturas futuras/limite/`installmentsFutureInCents`/`CARD_HAS_FUTURE_INSTALLMENTS`; (5) UI (seletor, prévia, fatura).
- **040b**: (1) predicado por `competenceOn` + `check:imports` + propriedade de reconciliação + regressão S1..S13; (2) DTO/etiquetas/Extrato (`from/to` 24 meses); (3) `GET/delete/restore` do plano; (4) `InstallmentPlanDialog` e BDD.
- **A 040a só é liberada com a 040b** (mesma entrega). Entre os *commits* o Extrato ainda filtra por `occurredOn`; nenhum cenário da 040a depende do mês do Extrato.

**Impacto no código existente**: `transacoes/{schemas,service,repo,extrato,mutations,optimistic}.ts` (`installments`, `installment`, `competenceOn`, guarda, sem otimista), `transacoes/ledger-where.ts`, `home/{repo,service}.ts` (`recent` ≤ hoje), `split/{repo,service}.ts` e `/settlement/expenses` (período e rótulo), `split/pending.ts` (agrupar por competência), `cartoes/{queries,invoices,invoice-service,service}.ts` (`isFuture`, `nextRef`, subtotais), `previstas/payables.ts` (nenhuma mudança de regra; faturas futuras já entram por vencimento), `contas/service.ts` (`usageCountByMe` ≤ hoje), SDD-012 (`CARD_HAS_FUTURE_INSTALLMENTS`), `scripts/check-imports.ts` (+ teste), `tests/support/factories.ts` (`makeInstallmentPurchase`), `prisma/seed.ts`, `transaction-drawer.tsx`, `invoice-screen`, `cards-screen`, `transaction-detail.tsx`, `installment-plan-dialog.tsx` (novo).

**Ajustes pedidos ao PO / Dev (não bloqueantes)**
1. **PO**: nos cenários "Extrato mostra uma linha por parcela" e "Ver compra", informar o **intervalo** do Extrato (as 10 parcelas estão em 10 competências; o padrão é 1 mês).
2. **PO**: US-041 "fatura **fechada** ou paga trava a parcela" é mais estrito que a US-016b (só paga). Mantido como escrito (TL-12); confirmar na homologação.
3. **PO**: "Parcelas futuras" na fatura = soma das parcelas em faturas **posteriores** à exibida (TL-16).
4. **Dev**: seguir o ADR-020 §1 (ref consecutiva) e **não** recalcular `invoiceRefFor` por parcela.
