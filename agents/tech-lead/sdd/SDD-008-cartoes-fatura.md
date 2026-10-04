# SDD-008: Cartões de Crédito, Compra à Vista, Fatura e Pagamento (US-015, US-016a/b, US-017a/b)

- **Histórias**: [US-015](../../product-owner/backlog/stories/US-015-cadastrar-cartao-de-credito.md) · [US-016a](../../product-owner/backlog/stories/US-016-compra-a-vista-no-cartao.md) · [US-016b](../../product-owner/backlog/stories/US-016b-corrigir-compra-no-cartao-e-filtro.md) · [US-017a](../../product-owner/backlog/stories/US-017-ver-fatura-do-cartao.md) · [US-017b](../../product-owner/backlog/stories/US-017b-pagar-a-fatura.md)
- **Fluxos**: [FLUXO-004](../../product-owner/flows/FLUXO-004-cartao-e-fatura.md), [FLUXO-001 rev. 3](../../product-owner/flows/FLUXO-001-lancamento-rapido.md)
- **Rastreabilidade**: NEED-003 (RN-003.1..3) · NEED-001 (RN-001.1/3) · NEED-002 (RN-002.2/3) · NEED-007 · **ADR-014 (cartão e fatura no ledger)**, ADR-007, ADR-009, ADR-010, ADR-013 · D-PO-01, D-PO-02, D-PO-05..D-PO-10
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md), [SDD-004](SDD-004-contas-e-ledger.md), [SDD-005](SDD-005-extrato-e-home.md) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §7
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap | Resolução |
| :-- | :-- |
| **GAP-3** — `Transaction` exigia `accountId` | Compra no cartão = `Transaction(kind=EXPENSE)` com `accountId NULL` + `cardId` + `invoiceId`; pagamento = `Transaction(kind=INVOICE_PAYMENT)` (ADR-014). Totais, acerto e saldo **não mudam de regra**. |
| Fatura (entidade) | `CardInvoice` criada **sob demanda** (primeira compra no ciclo), única por `(cardId, referenceMonth)`; guarda `closingDate`/`dueDate`; **total, limite e situação são derivados**. |
| Fechamento/vencimento com meses curtos | Dias limitados a **1..28** (D-PO-05): toda data existe em todo mês; sem tratamento de 29..31. |
| Compra no dia do fechamento | Fica na fatura que fecha naquele dia (`dia ≤ closingDay`; D-PO-06). |
| Mudança do ciclo do cartão | Dias **travados após a primeira fatura materializada** (D-PO-07): `cycleLocked = EXISTS(card_invoices)`; a trava vale mesmo se a compra foi excluída (conservador). `PATCH` com dia diferente e travado ⇒ `422 CYCLE_LOCKED`. Corrida "editar ciclo x primeira compra": `PATCH` trava a linha do cartão `FOR UPDATE`; a criação de fatura a trava `FOR SHARE`. |
| Fuso e "hoje" | Situação da fatura e validações usam `todayInFamilyTz(ctx.clock)` (`America/Sao_Paulo`); datas são `DATE` (`YYYY-MM-DD`), comparadas como texto ISO. `2026-10-26T02:30:00Z` ainda é 25/10 em SP ⇒ fatura de out/2026 **aberta**. |
| Limite estourado / conta negativa | **Não bloqueia**: a API aceita e devolve `availableInCents` (negativo); aviso e confirmação são da UI (D-PO-08). |
| Concorrência na fatura | `SELECT … FOR UPDATE` na linha de `card_invoices` em toda escrita que muda o conteúdo da fatura; edição que troca de fatura trava as duas **em ordem crescente de `referenceMonth`**. Pagamento compara `expectedTotalInCents` dentro do *lock* (`409 INVOICE_TOTAL_CHANGED`). |
| Fatura paga travada | Compra nova com data que resolve para fatura paga ⇒ `422 INVOICE_ALREADY_PAID`; editar/excluir/restaurar compra dela ⇒ `422 INVOICE_PAID_LOCKED`. |
| Quem recebe o crédito no acerto | `payerMemberId` da compra (quem comprou), **não** quem paga a fatura (Q-20; ADR-014 §Consequências). |
| Pagamento parcial/juros | Fora (D-PO-09): o valor é sempre o total derivado, conferido por `expectedTotalInCents`. |
| Permissões | D-PO-02: todos os membros usam todos os cartões; titular informativo; sem `role`. |
| Sem cartão arquivável | Não há arquivar/excluir cartão na R2. |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/cartoes/schemas.ts
const dayOfMonth = (msg: string) => z.number({ error: msg }).int(msg).min(1, msg).max(28, msg);
const limitSchema = z.number({ error: "Informe um limite maior que zero" }).int("O limite deve ser um número inteiro de centavos")
  .positive("Informe um limite maior que zero").max(MAX_AMOUNT_IN_CENTS, "Valor acima do limite permitido");

export const CreateCardSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cartão").max(60, "O nome deve ter no máximo 60 caracteres"),
  institution: z.string().trim().min(1).max(40).default("Outro"),          // mesmas sugestões de INSTITUTION_SUGGESTIONS
  ownerMemberId: uuidSchema.optional(),                                      // padrão: membro logado
  limitInCents: limitSchema,
  closingDay: dayOfMonth("Escolha o dia de fechamento (1 a 28)"),
  dueDay: dayOfMonth("Escolha o dia de vencimento (1 a 28)"),
}).strict();

export const UpdateCardSchema = z.object({
  version: versionSchema,
  name: z.string().trim().min(2, "Informe o nome do cartão").max(60).optional(),
  institution: z.string().trim().min(1).max(40).optional(),
  ownerMemberId: uuidSchema.optional(),
  limitInCents: limitSchema.optional(),
  closingDay: dayOfMonth("Escolha o dia de fechamento (1 a 28)").optional(),
  dueDay: dayOfMonth("Escolha o dia de vencimento (1 a 28)").optional(),
}).strict().refine((v) => Object.keys(v).some((k) => k !== "version"), { message: "Nada para alterar" });

export const PayInvoiceSchema = z.object({
  accountId: z.uuid({ error: "Escolha a conta de pagamento" }),
  paidOn: dateISOSchema.optional(),                                          // padrão: hoje
  expectedTotalInCents: amountInCentsSchema,                                 // total que o usuário viu
  note: z.string().trim().max(500).optional(),
}).strict();
export const UndoInvoicePaymentSchema = z.object({ version: versionSchema }).strict();   // version da perna de pagamento
export const InvoiceRefParamSchema = periodKeySchema;                       // :ref = "YYYY-MM" (mês de fechamento)

// ── DTOs ──
export type InvoiceStatus = "OPEN" | "CLOSED" | "PAID";
export type InvoiceSummaryDTO = {
  cardId: string; ref: string;                       // "2026-10"
  closingDate: string; dueDate: string;              // YYYY-MM-DD
  status: InvoiceStatus; isOverdue: boolean;         // isOverdue = CLOSED && hoje > dueDate
  totalInCents: number; purchasesCount: number;
  paidOn: string | null;
};
export type InvoiceDTO = InvoiceSummaryDTO & {
  purchases: TransactionDTO[];                       // ativas, da mais recente à mais antiga (occurredOn, createdAt, id)
  byMember: Array<{ member: MemberRef; totalInCents: number; count: number }>;   // todos os membros; 0 se não compraram
  payment: null | { transactionId: string; accountId: string; accountName: string; paidOn: string;
                    amountInCents: number; version: number; paidBy: MemberRef };
  previousRef: string | null; nextRef: string | null;   // navegação [mais antiga materializada .. fatura aberta]
  canPay: boolean;                                   // CLOSED && total > 0
};
export type CardDTO = {
  id: string; name: string; institution: string; owner: MemberRef;
  limitInCents: number; usedInCents: number; availableInCents: number;   // pode ser negativo
  closingDay: number; dueDay: number; cycleLocked: boolean;
  version: number; createdAt: string;
  openInvoice: InvoiceSummaryDTO;                    // a fatura aberta hoje (virtual, total 0, se ainda não materializada)
  payableInvoices: InvoiceSummaryDTO[];              // CLOSED (inclui vencidas) com total > 0, mais antigas primeiro
};
export type CardsResponse = { items: CardDTO[]; totalLimitInCents: number; totalUsedInCents: number };
export type PayInvoiceResponse = {
  invoice: InvoiceDTO; payment: TransactionDTO;
  account: { id: string; balanceInCents: number }; card: { id: string; usedInCents: number; availableInCents: number };
};
```

Alterações em contratos do SDD-001/005 (compra no cartão e pagamento), ver §3.2.

---

## 3. Contratos de API

### 3.1 Cartões e faturas (`auth: "family"`; mutações idempotentes)

| Rota | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/cards` | — | `200 CardsResponse` (ordem `createdAt` asc) | 401 · 403 `NO_FAMILY` |
| `POST /api/v1/cards` | `CreateCardSchema` | `201 { card: CardDTO }` | 400 · 409 `DUPLICATE_CARD_NAME` "Já existe um cartão com este nome" · 422 `INVALID_REFERENCE` (`ownerMemberId`) |
| `GET /api/v1/cards/:id` | — | `200 { card: CardDTO }` | 404 |
| `PATCH /api/v1/cards/:id` | `UpdateCardSchema` | `200 { card: CardDTO }` | 404 · 409 `VERSION_CONFLICT` · 409 `DUPLICATE_CARD_NAME` · 422 `CYCLE_LOCKED` |
| `GET /api/v1/cards/:id/invoices` | — | `200 { items: InvoiceSummaryDTO[] }` (materializadas + a aberta; mais recentes primeiro; até 24) | 404 |
| `GET /api/v1/cards/:id/invoices/:ref` | — | `200 { invoice: InvoiceDTO }` | 400 (`ref` inválida) · 404 `NOT_FOUND` (cartão de outra família, ou `ref` posterior à fatura aberta, ou sem fatura materializada que não seja a aberta) |
| `POST /api/v1/cards/:id/invoices/:ref/pay` | `PayInvoiceSchema` | `201 PayInvoiceResponse` | 404 · 409 `INVOICE_ALREADY_PAID` · 409 `INVOICE_TOTAL_CHANGED` · 422 `INVOICE_NOT_CLOSED` · 422 `INVOICE_EMPTY` · 422 `FUTURE_DATE_NOT_ALLOWED` · 422 `PAYMENT_BEFORE_CLOSING` · 422 `INVALID_REFERENCE` (`accountId`) |
| `POST /api/v1/cards/:id/invoices/:ref/undo-payment` | `UndoInvoicePaymentSchema` | `200 { invoice: InvoiceDTO; account: {id, balanceInCents}; card: {id, usedInCents, availableInCents} }` | 404 · 409 `VERSION_CONFLICT` · 409 `INVOICE_NOT_PAID` |

Mensagens exatas:
- `CYCLE_LOCKED`: "Os dias de fechamento e vencimento não podem ser alterados porque já há compras neste cartão".
- `VERSION_CONFLICT` do cartão: "Este cartão foi alterado por {Nome}. Recarregue para continuar." (coluna `updatedByMemberId`).
- `INVOICE_ALREADY_PAID`: **"Esta fatura já foi paga"** (no `pay`) · para **compra** em fatura paga: **"A fatura de {mês/ano} já foi paga. Use uma data posterior ao fechamento."** (código `INVOICE_ALREADY_PAID`, 422; `details: { ref }`).
- `INVOICE_PAID_LOCKED`: "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la."
- `INVOICE_TOTAL_CHANGED`: "O valor da fatura mudou. Confira e tente de novo." (`details: { currentTotalInCents }`).
- `INVOICE_NOT_CLOSED`: "A fatura ainda está aberta e só pode ser paga depois do fechamento". `INVOICE_EMPTY`: "Esta fatura não tem compras para pagar". `INVOICE_NOT_PAID`: "Esta fatura não está paga".
- `PAYMENT_BEFORE_CLOSING`: "A data do pagamento deve ser posterior ao fechamento da fatura". `FUTURE_DATE_NOT_ALLOWED` no pagamento: "A data do pagamento não pode ser futura"; na compra no cartão: **"A data da compra não pode ser futura"**.
- Rótulo `{mês/ano}` = `formatInvoiceLabel(ref)` (`"2026-10"` → `"out/2026"`; meses `jan fev mar abr mai jun jul ago set out nov dez`).

### 3.2 Alterações nos contratos de lançamento (emendas aos SDD-001 §2/§3 e SDD-005 §2/§3)

```typescript
// CreateExpenseSchema (SDD-001 §2): conta OU cartão
const expenseBase = { ...common, accountId: z.uuid({ error: "Escolha uma conta" }).optional(),
                      cardId: z.uuid({ error: "Escolha um cartão" }).optional() };
export const CreateExpenseSchema = z.object({ type: z.literal("EXPENSE"), ...expenseBase, isSharedExpense: z.boolean().default(true) })
  .strict().superRefine((v, c) => {
    if (!v.accountId && !v.cardId) c.addIssue({ code: "custom", path: ["accountId"], message: "Escolha uma conta ou um cartão" });
    if (v.accountId && v.cardId)   c.addIssue({ code: "custom", path: ["cardId"],    message: "Informe a conta ou o cartão, não os dois" });
  });
// CreateIncomeSchema: inalterado (accountId obrigatório; `cardId` => 400 pelo .strict()).

export type TransactionDTO = {            // diferenças em relação ao SDD-001 §2
  type: "EXPENSE" | "INCOME" | "TRANSFER_OUT" | "TRANSFER_IN" | "OPENING" | "INVOICE_PAYMENT";
  account: { id: string; name: string } | null;                     // null em compra no cartão
  card: { id: string; name: string } | null;                        // compra no cartão e pagamento de fatura
  invoice: { ref: string; closingDate: string; dueDate: string } | null;
  // category.archived (SDD-007) e plannedExpenseId: string | null (SDD-009) também entram
};
export type CreateTransactionResponse = {
  transaction: TransactionDTO;
  account?: { id: string; balanceInCents: number };                 // só quando há conta
  card?: { id: string; usedInCents: number; availableInCents: number };   // só em compra no cartão
};
export type TransactionDefaults = { accountId: string | null; cardId: string | null; payerMemberId: string; today: string };
```

| Rota (SDD-001/005) | Mudança |
| :-- | :-- |
| `POST /transactions` | Aceita `cardId` (despesa). Erros novos: `422 INVALID_REFERENCE` (`cardId`: "Escolha um cartão"), `422 INVOICE_ALREADY_PAID`. `FUTURE_DATE_NOT_ALLOWED` da compra no cartão usa "A data da compra não pode ser futura". |
| `GET /transactions/defaults` | `accountId` = como no R1 (último **conta** usada → titular → 1ª); `cardId` = cartão da **despesa mais recente do membro** se ela foi no cartão; senão `null`. O cliente pré-seleciona o cartão quando `cardId != null`. |
| `PATCH /transactions/:id` | Compra no cartão: `accountId` no corpo ⇒ `422 PAYMENT_SOURCE_NOT_EDITABLE` "Para mudar a forma de pagamento, exclua e lance novamente". `occurredOn` pode mudar a fatura (§4.6). `INVOICE_PAYMENT` ⇒ `422 NOT_EDITABLE` ("… Use Desfazer pagamento"). |
| `POST /transactions/:id/delete` / `restore` | Compra em fatura paga ⇒ `422 INVOICE_PAID_LOCKED`. `INVOICE_PAYMENT` ⇒ `422 NOT_EDITABLE`. |
| `GET /transactions` | Novo filtro `cardId` (uuid) e `type=INVOICE_PAYMENT`. `type=EXPENSE` inclui compras no cartão. Ver §5. |

---

## 4. Regras e algoritmos

### 4.1 Funções puras do ciclo (`src/modules/cartoes/cycle.ts`, 100% de ramos testados, sem Prisma/`Date.now()`)

```typescript
export type DateISO = string;
/** Mês de fechamento da fatura que recebe a compra: dia(date) <= closingDay ? ym(date) : ym(date)+1 mês. */
export function invoiceRefFor(date: DateISO, closingDay: number): string;
/** closingDate = `${ref}-${pad(closingDay)}`; dueDate = dueDay > closingDay ? mesmo mês : mês seguinte, dia dueDay. */
export function invoiceDates(ref: string, closingDay: number, dueDay: number): { closingDate: DateISO; dueDate: DateISO };
export function addMonthsToRef(ref: string, n: number): string;              // "2026-12" + 1 => "2027-01"
export function invoiceStatus(i: { closingDate: DateISO; dueDate: DateISO; paid: boolean }, today: DateISO):
  { status: "OPEN" | "CLOSED" | "PAID"; isOverdue: boolean };               // paid => PAID; hoje <= closingDate => OPEN; senão CLOSED; isOverdue = CLOSED && hoje > dueDate
export function openInvoiceRef(today: DateISO, closingDay: number): string;  // = invoiceRefFor(today, closingDay)
export function formatInvoiceLabel(ref: string): string;                     // "2026-10" => "out/2026"
```

**Vetores obrigatórios** (testes unitários; `closingDay, dueDay` entre colchetes):

| Entrada | Saída esperada |
| :-- | :-- |
| `invoiceRefFor("2026-10-15", 25)` | `"2026-10"` |
| `invoiceRefFor("2026-10-25", 25)` (dia do fechamento) | `"2026-10"` |
| `invoiceRefFor("2026-10-26", 25)` | `"2026-11"` |
| `invoiceRefFor("2026-12-26", 25)` (virada de ano) | `"2027-01"` |
| `invoiceRefFor("2026-10-01", 1)` / `("2026-10-02", 1)` | `"2026-10"` / `"2026-11"` |
| `invoiceRefFor("2026-02-28", 28)` / `("2026-03-01", 28)` | `"2026-02"` / `"2026-03"` |
| `invoiceDates("2026-10", 25, 5)` | `{ closingDate: "2026-10-25", dueDate: "2026-11-05" }` |
| `invoiceDates("2026-12", 25, 5)` | `{ "2026-12-25", "2027-01-05" }` |
| `invoiceDates("2026-10", 10, 20)` (vencimento > fechamento) | `{ "2026-10-10", "2026-10-20" }` |
| `invoiceDates("2026-02", 28, 28)` (igual ⇒ mês seguinte) | `{ "2026-02-28", "2026-03-28" }` |
| `invoiceStatus({closing 2026-10-25, due 2026-11-05, paid false}, "2026-10-25")` | `OPEN`, `isOverdue false` |
| idem, `"2026-10-26"` · `"2026-11-05"` · `"2026-11-06"` | `CLOSED/false` · `CLOSED/false` · `CLOSED/true` |
| idem com `paid: true`, `"2026-11-06"` | `PAID`, `isOverdue false` |
| `addMonthsToRef("2026-01", -1)` · `("2026-12", 1)` | `"2025-12"` · `"2027-01"` |
| `formatInvoiceLabel("2026-10")` | `"out/2026"` |
| Propriedade | Para todo `date` e `closingDay`, `invoiceDates(invoiceRefFor(date, c), c, d).closingDate >= date` e `< date + 1 mês`; compra e fatura nunca ficam a mais de 1 ciclo de distância. |

### 4.2 Consultas derivadas (única implementação, `src/modules/cartoes/queries.ts`)
- `cardUsage(tx, familyId, cardIds?)` → `Map<cardId, usedInCents>`: SQL de `modelo-de-dados.md` §7.4 (compras ativas em faturas **sem pagamento ativo**); cartões sem linhas = 0. **Uma** função para Cartões, Home/payables, resposta da compra e testes.
- `invoiceTotals(tx, familyId, invoiceIds)` → `{ totalInCents, count }` por fatura (compras `EXPENSE` ativas); `invoiceByMember(tx, familyId, invoiceId)` → subtotal por `payerMemberId`.
- `activePayments(tx, familyId, invoiceIds)` → pagamento ativo por fatura (`kind = INVOICE_PAYMENT AND deletedAt IS NULL`).
- `buildInvoiceSummary(card, invoiceRow | null, ref, totals, payment, today)` monta `InvoiceSummaryDTO` (linha nula ⇒ virtual: datas por `invoiceDates`, total 0).

### 4.3 `getOrCreateInvoice(tx, card, ref)` e travas
1. `SELECT … FROM credit_cards WHERE id = :card FOR SHARE` (impede o `PATCH` do ciclo durante a criação).
2. `INSERT INTO card_invoices (…) VALUES (… invoiceDates(ref, card.closingDay, card.dueDay) …) ON CONFLICT ("cardId","referenceMonth") DO NOTHING`.
3. `SELECT … FROM card_invoices WHERE "cardId" = :card AND "referenceMonth" = :ref FOR UPDATE` e retornar.
Operações que tocam duas faturas chamam em **ordem crescente de `ref`**.

### 4.4 `createExpense` com cartão (US-016a, dentro do `createTransaction` do SDD-001 §4.1)
1. Defaults: `occurredOn ??= hoje`; `payerMemberId ??= ctx.memberId`.
2. Referências **da família**: cartão (`422 INVALID_REFERENCE` path `cardId`), categoria **ativa** e do tipo, pagador.
3. `occurredOn <= hoje` (senão `FUTURE_DATE_NOT_ALLOWED`, mensagem do cartão).
4. `ref = invoiceRefFor(occurredOn, card.closingDay)`; `invoice = getOrCreateInvoice(...)` (com *lock*).
5. Fatura com pagamento ativo ⇒ `422 INVOICE_ALREADY_PAID` (`details.ref`).
6. `INSERT Transaction { kind: EXPENSE, direction: DEBIT, accountId: null, cardId, invoiceId, … igual ao SDD-001 }` + revisão `CREATE`.
7. Resposta: `transaction` (com `card`, `invoice`) e `card: { usedInCents, availableInCents }` via `cardUsage`. **Não** devolve `account`.

### 4.5 `payInvoice` (US-017b) — uma transação do `withApi`
1. Cartão da família (`404`); `ref` válida; **lock** da fatura (`SELECT … FOR UPDATE`); fatura inexistente e `ref` ≠ aberta ⇒ `404`.
2. Pagamento ativo existe ⇒ `409 INVOICE_ALREADY_PAID`.
3. `invoiceStatus(...)` ≠ `CLOSED` ⇒ `422 INVOICE_NOT_CLOSED` (inclui fatura aberta/virtual).
4. `total = invoiceTotals` ; `total = 0` ⇒ `422 INVOICE_EMPTY`; `total ≠ expectedTotalInCents` ⇒ `409 INVOICE_TOTAL_CHANGED`.
5. `paidOn ??= hoje`; `paidOn > hoje` ⇒ `FUTURE_DATE_NOT_ALLOWED`; `paidOn <= closingDate` ⇒ `PAYMENT_BEFORE_CLOSING`.
6. Conta **da família** ⇒ senão `422 INVALID_REFERENCE` (`accountId`).
7. `INSERT Transaction { kind: INVOICE_PAYMENT, direction: DEBIT, accountId, cardId, invoiceId, amountInCents: total, occurredOn: paidOn, description: "Pagamento da fatura {card.name} - {formatInvoiceLabel(ref)}", note, authorMemberId, payerMemberId: null }` + revisão `CREATE`. O índice parcial garante um pagamento ativo por fatura (corrida ⇒ `INVOICE_ALREADY_PAID`).
8. Responder `201`: fatura (agora `PAID`), pagamento, `balanceInCents` da conta (`accountBalances`) e uso do cartão.

### 4.6 Edição, exclusão e restauração de compra no cartão (emenda ao SDD-001 §4.2/§4.3; US-016b)
- `accountId` no corpo de compra no cartão ⇒ `422 PAYMENT_SOURCE_NOT_EDITABLE`.
- `occurredOn` alterada: calcula `newRef`; **trava as faturas antiga e nova em ordem crescente**; se **qualquer uma** tem pagamento ativo ⇒ `422 INVOICE_PAID_LOCKED`; atualiza `invoiceId`.
- Outros campos (valor, categoria, pagador, `isSharedExpense`, descrição, nota): trava a fatura; paga ⇒ `INVOICE_PAID_LOCKED`.
- `delete`/`restore`: trava a fatura; paga ⇒ `INVOICE_PAID_LOCKED`. (Restaurar numa fatura que **ficou paga** depois da exclusão também é bloqueado.)
- Confirmação de mês acertado (SDD-001 §4.2.5) continua valendo pela `occurredOn` e `isSharedExpense`.
- `INVOICE_PAYMENT`: `NOT_EDITABLE` em `PATCH`/`delete`/`restore`; só `undo-payment`.

### 4.7 `undoInvoicePayment`
Lock da fatura; pagamento ativo ausente ⇒ `409 INVOICE_NOT_PAID`; `UPDATE … WHERE id AND version = :v` (0 linhas ⇒ `409 VERSION_CONFLICT`); marca `deletedAt`, `deletedByMemberId`, `deletionReason = UNDONE`, `version + 1`; revisão `UNDO`. Saldo e uso do cartão voltam por derivação.

### 4.8 Ciclo do cartão (`PATCH /cards/:id`)
`FOR UPDATE` no cartão; comparar `closingDay`/`dueDay` com os atuais; se algum difere e `EXISTS(card_invoices WHERE cardId)` ⇒ `422 CYCLE_LOCKED`; `UPDATE … WHERE version = :v`; sem diferença ⇒ `200` sem mudar `version`. `limitInCents` abaixo do usado **é aceito** (disponível negativo).

### 4.9 Invariantes (verificadas por teste)
1. Compra no cartão **não altera** `accountBalances` de nenhuma conta; `ledgerTotals.expenseInCents` **inclui** a compra.
2. Pagamento da fatura **não altera** `ledgerTotals` nem o acerto (SDD-002); **altera** o saldo da conta (−total).
3. Σ saldos da família muda **apenas** pelo pagamento (−total) e por receitas/despesas em conta.
4. `usedInCents` = Σ totais das faturas não pagas; pagar reduz exatamente o total; desfazer restaura.
5. Cada fatura tem **no máximo um** pagamento ativo (índice parcial).
6. `closingDate < dueDate` e `ref` = mês de `closingDate`.

---

## 5. Emendas ao extrato e à Home (SDD-005)

- `buildLedgerWhere` (única fonte de lista e totais) ganha `cardId` (`t."cardId" = $c`; casa compras **e** pagamentos desse cartão). `accountId` continua igualdade em `t."accountId"`: compras no cartão **não** casam (conta nula); pagamentos **casam** (debitam a conta). `type=INVOICE_PAYMENT` ⇒ `t.kind = 'INVOICE_PAYMENT'`. O padrão "tudo menos `OPENING`" **inclui** pagamentos (linha neutra).
- **Totais não mudam de regra**: `kind IN ('EXPENSE','INCOME')` ⇒ compra no cartão soma em despesas; pagamento fica de fora. `count` conta as linhas listáveis (inclui pagamentos). A propriedade "Σ itens = totais" passa a ignorar linhas `INVOICE_PAYMENT`, `TRANSFER_*` (teste ajustado).
- Consulta de página: `LEFT JOIN bank_accounts`, `LEFT JOIN credit_cards`, `LEFT JOIN card_invoices` (para `account`, `card`, `invoice` do DTO). O cursor/keyset **não muda**.
- Linha do extrato: compra no cartão mostra `card.name` onde iria a conta, marcador **"Cartão"** e a fatura `out/2026`; pagamento = linha **neutra** (ícone de setas, "Pagamento da fatura {Cartão} - {mês/ano}", sem verde/vermelho, valor com "−").
- Home: `familyBalanceInCents`/contas **inalterados** (cartão não entra); `monthSummary` e `byMember` já incluem compras no cartão (consultas por `kind = 'EXPENSE'`); `recent` inclui compras e pagamentos.

---

## 6. Interface

- **Drawer de despesa** (`transaction-drawer.tsx`): chip "Conta" ➜ **"Pagar com"** (lista agrupada *Contas* / *Cartões*, cartão mostra "Disponível R$ …"); no modo Receita só contas. Ao escolher cartão: dica **"Entra na fatura de {mês/ano} · fecha {dd/mm}"** (calculada no cliente com `invoiceRefFor`/`invoiceDates` das funções puras e os dias do cartão em `["cards"]`) e aviso de limite quando `valor > availableInCents` (botão *Confirmar mesmo assim*; mesma mecânica do aviso de conta negativa). Padrão de seleção: `defaults.cardId ?? defaults.accountId`. A `Idempotency-Key` segue a regra do SDD-000 §7.
- **Rotas**: `/cartoes` (lista, drawer Novo/Editar cartão com frase explicativa do ciclo atualizada ao vivo, campos de dia desabilitados com a explicação quando `cycleLocked`), `/cartoes/[id]?ref=YYYY-MM` (seletor ◀▶, *chip* de situação com texto, total, subtotal por membro, compras; `previousRef`/`nextRef` desabilitam as setas), drawer **Pagar fatura** (valor somente leitura = `totalInCents`; conta com saldo; data em *Mais detalhes*; aviso "A conta de origem ficará negativa"; botão fixo "Confirmar pagamento"). Em `INVOICE_TOTAL_CHANGED` o drawer **recarrega a fatura** (novo total em `expectedTotalInCents`, **nova** `Idempotency-Key`) e mostra a mensagem.
- Detalhe/extrato: ver §5; ação **Desfazer pagamento** no detalhe do pagamento (chama `undo-payment` com `card.id`/`invoice.ref`/`version`).
- **Chaves de cache**: `["cards"]`, `["card", id]`, `["invoice", cardId, ref]`. Compra no cartão invalida `["cards"]`, `["invoice"]`, `["transactions"]`, `["home"]`, `["settlement"]` (**não** `["accounts"]`); pagamento/desfazer invalidam também `["accounts"]` e `["payables"]`. Atualização otimista da compra como no SDD-001 §5.1; **limite exibido só muda com a resposta do servidor**.
- Estados e responsividade conforme SDD-000 §7 (375 px / 1280 px; situação sempre com texto; alvos ≥ 44 px).

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); cartão/fatura/conta de outra família ⇒ `404` (ou `INVALID_REFERENCE` quando vem no corpo); FKs compostas `(familyId, cardId)` e `(familyId, invoiceId)`; `.strict()` rejeita `familyId`, `invoiceId`, `authorMemberId`, `status`. `invoiceId` **nunca** vem do cliente (resolvido no servidor). Logs (pino) sem descrição/nota nem valores de fatura.

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, I = integração (`db-test`), E = E2E

> Convenção SDD-000 §9: `describe("US-0xx …")`, `it` com o título do cenário; `.feature` copiando o Gherkin das histórias; fábricas novas `makeCard`, `makeCardPurchase`, `makeInvoicePayment`, `makeInvoice(card, ref)`; relógio fixo via `Clock`/`APP_NOW_OVERRIDE`.

### US-015
| Cenário BDD | Testes |
| :-- | :-- |
| Cadastrar cartão com sucesso | **I**: `POST /cards` → 201, `limitInCents 500000`, `usedInCents 0`, `availableInCents 500000`, `openInvoice.totalInCents 0`. **E**: lista com "Fecha dia 25 · vence dia 5 do mês seguinte". |
| Titular padrão | **I**: sem `ownerMemberId` ⇒ titular = logado. |
| Vencimento no mesmo mês / mesmo dia | **U**: frase do ciclo (`cycleSentence(10,20)` = "mesmo mês"; `(28,28)` = "mês seguinte"); **E**: textos na lista. |
| Cartão não altera o saldo da família | **I**: `GET /accounts` `totalBalanceInCents` igual antes e depois. |
| Campos obrigatórios / dia fora do intervalo / limite inválido | **U**: schema com as 4 mensagens exatas, `31`, `0`, `-1`, `1.5`. **I**: 400, nada criado. **E**: erros nos campos. |
| Nome duplicado | **I**: `"nubank mariana "` ⇒ 409 `DUPLICATE_CARD_NAME`; corrida (chaves diferentes) ⇒ 1×201 e 1×409. |
| Cartão visível para todos / Isolamento | **I**: Lucas lista cartão de Mariana; teste padrão SDD-000 §9.4 em `GET/PATCH /cards/:id`, `GET /cards/:id/invoices[/ref]`, `pay`, `undo-payment`. |
| Editar nome e limite | **I**: `PATCH` ⇒ 200, `version 2`; limite abaixo do usado aceito (`availableInCents` negativo). |
| Dias editáveis antes da compra / travados depois | **I**: sem fatura ⇒ `PATCH closingDay` 200; após 1ª compra ⇒ 422 `CYCLE_LOCKED` com a mensagem; nome/limite continuam 200; trava persiste após excluir a compra; corrida `PATCH` ciclo x 1ª compra ⇒ ou ciclo muda e a compra usa o novo, ou compra primeiro e `CYCLE_LOCKED` (nunca fatura com datas do ciclo antigo e cartão novo). **E**: campo desabilitado com a explicação. |
| Conflito de edição | **I**: dois `PATCH` mesma `version` em `Promise.all` ⇒ 1×200 e 1×409 com "Este cartão foi alterado por Mariana. Recarregue para continuar.". |
| Nenhum cartão cadastrado | **E**: vazio "Cadastre seu primeiro cartão". |
| (infra) Idempotência / `.strict()` / Atomicidade / Migração | **I**: duplo envio mesma chave ⇒ 1 cartão; `familyId`/`closingDate` no corpo ⇒ 400; `CHECK`s: `closingDay 29`, `limit 0` rejeitados no banco; `migrations.int.test` cobre `credit_cards`. |

### US-016a
| Cenário BDD | Testes |
| :-- | :-- |
| Compra no cartão com sucesso | **I**: `POST /transactions` (`cardId`, 30000): `account` ausente, `accountBalances` iguais, `card.usedInCents 30000`, `availableInCents 470000`; `authorMemberId = payerMemberId = Lucas`; `occurredOn = hoje`; revisão CREATE. **E**: fluxo do drawer com "Pagar com: Nubank Mariana" ⇒ aviso e limite "R$ 4.700,00". |
| A compra entra na fatura aberta | **I**: `GET /cards/:id/invoices/2026-10` ⇒ `closingDate 2026-10-25`, `dueDate 2026-11-05`, `status OPEN`, total 30000. |
| Fechamento / depois do fechamento / fim de ano / retroativa | **U**: vetores §4.1. **I**: relógio 25/10, 26/10, 26/12 e 28/10 com `occurredOn 20/10` ⇒ `nov/2026`, `jan/2027`, `out/2026`; **fuso**: relógio `2026-10-26T02:30:00Z` (25/10 em SP) ⇒ compra de "hoje" cai em `out/2026` e a fatura segue `OPEN`. |
| Em nome de outro membro / pessoal | **I**: `payerMemberId = Mariana` ⇒ `author = Lucas`; `isSharedExpense false` fora do `computeSettlement`. |
| Compartilhada entra no acerto pela data | **I** (com SDD-002): compra Mariana 30000 compartilhada (EQUAL) em 15/10 ⇒ `settlement` out/2026 "Lucas deve 15000 a Mariana"; **regressão**: o mesmo valor lançado por conta dá o mesmo acerto. |
| Entra nos totais do mês | **I**: `ledgerTotals` out ⇒ `expenseInCents += 30000`; `Σ saldos` igual; Home `monthSummary.expense` e `byMember` incluem. **E**: total do extrato. |
| Acima do limite | **I**: disponível 10000, compra 30000 ⇒ **201**, `availableInCents −20000`. **E**: aviso "Esta compra ultrapassa o limite disponível do cartão", *Confirmar mesmo assim*. **U** (componente): aviso aparece só quando `valor > disponível`. |
| Valor obrigatório / data futura | **U/I**: igual US-005; amanhã (relógio fixo, virada em SP) ⇒ 422 `FUTURE_DATE_NOT_ALLOWED` "A data da compra não pode ser futura". |
| Meio de pagamento padrão | **I**: `GET /defaults` ⇒ `cardId` quando a última despesa foi no cartão; `null` quando foi em conta. **E**: "Pagar com" pré-selecionado. |
| Receita só aceita contas | **I**: `INCOME` com `cardId` ⇒ 400 (`.strict()`); **E/Componente**: lista sem cartões no modo Receita. |
| Família sem cartões | **E**: seletor só com contas + atalho "Cadastrar cartão". |
| Duplo clique não duplica | **I**: `Promise.all` mesma chave ⇒ 1 compra, `usedInCents` aumenta 1×, 2ª resposta `Idempotent-Replay`. **E**: duplo clique. |
| Compra aparece no extrato | **I**: `GET /transactions` ⇒ item com `account null`, `card`, `invoice.ref`. **E**: marcador "Cartão" e fatura. |
| Falha de rede ao salvar | **E**: `route.abort()` ⇒ mensagem e formulário preservado; reenvio com a mesma chave cria 1 compra. |
| (infra) Referências inválidas | **I**: cartão de outra família ⇒ 422 `INVALID_REFERENCE`; `accountId` **e** `cardId` ⇒ 400 "Informe a conta ou o cartão, não os dois"; nenhum ⇒ 400 "Escolha uma conta ou um cartão". |
| (infra) Banco | **I**: `INSERT` direto de `EXPENSE` com conta **e** cartão, ou sem ambos, viola `tx_kind_shape_chk`. |
| (infra) Atomicidade | **I**: falha injetada após o `INSERT` da fatura/antes da compra ⇒ nem compra nem fatura (ou fatura vazia inofensiva) e saldos iguais; falha em `recordRevision` ⇒ compra não persiste. |
| (infra) Concorrência | **I**: 10 compras simultâneas no mesmo ciclo ⇒ **1** fatura (`card_invoices`) e total = soma. |

### US-016b
| Cenário BDD | Testes |
| :-- | :-- |
| Corrigir o valor | **I**: `PATCH amountInCents` ⇒ 200, total da fatura e `usedInCents` recalculados, `version 2`, revisão `UPDATE`. **E**: "Editado por Mariana". |
| Mudar a data muda a fatura | **I**: `PATCH occurredOn` 27/10 (relógio 28/10) ⇒ `invoiceId` da fatura nov/2026; total de out/2026 = 0; faturas travadas em ordem crescente (teste de *deadlock*: dois `PATCH` cruzados em `Promise.all` terminam sem erro 40P01). |
| Excluir libera / Restaurar | **I**: `delete` ⇒ `usedInCents` cai; `restore` ⇒ volta; `ALREADY_DELETED` ao repetir. **E**: toast "Desfazer". |
| Forma de pagamento não editável | **I**: `PATCH` com `accountId` em compra de cartão ⇒ 422 `PAYMENT_SOURCE_NOT_EDITABLE`. **E**: campo desabilitado com a dica. |
| Conflito de edição | **I**: dois `PATCH` ⇒ 1×200, 1×409 com a mensagem do SDD-001. |
| Filtrar por cartão / por conta | **I**: `GET /transactions?cardId=` ⇒ só a compra e o pagamento do cartão; `?accountId=` não traz a compra; totais do filtro corretos. **E**: chip "Cartão" e URL com `cardId`. |
| Detalhe mostra cartão e fatura | **I**: `GET /transactions/:id` com `card`, `invoice`, `author`, `payer`. |
| Acerto recalculado | **I**: excluir a compra compartilhada ⇒ `settlement` deixa de incluí-la. |

### US-017a
| Cenário BDD | Testes |
| :-- | :-- |
| Fatura aberta com total e datas | **I**: `GET .../invoices/2026-10` (relógio 20/10) ⇒ `OPEN`, total 40000, `purchases` em ordem. **E**: tela. |
| Cartões listam fatura atual e limite | **I**: `GET /cards` ⇒ `openInvoice.totalInCents 40000`, `usedInCents 40000`, `availableInCents 460000`. |
| Fatura fecha depois do dia | **I**: relógio 25/10 ⇒ `OPEN`; 26/10 ⇒ `CLOSED`, `canPay true`; `payableInvoices` contém a fatura. |
| Fatura vencida | **I**: relógio 06/11 ⇒ `isOverdue true`. **E**: destaque de alerta com texto. |
| Limite considera abertas e fechadas | **I**: out 120000 (fechada) + nov 30000 (aberta) ⇒ `usedInCents 150000`, disponível 350000; fatura **paga** não conta. |
| Navegar para faturas anteriores | **I**: `previousRef`/`nextRef` coerentes; `previousRef null` na mais antiga; `GET /invoices/{ref posterior à aberta}` ⇒ 404. **E**: setas e desabilitar. |
| Subtotal por membro | **I**: `byMember` Mariana 30000, Lucas 10000; membro sem compras = 0. |
| Compra retroativa em fatura fechada | **I**: total sobe (não paga). |
| Compra excluída não conta | **I**: total exclui; `purchasesCount` também. |
| Fatura sem compras | **I**: `openInvoice` virtual (`totalInCents 0`, `purchases []`). **E**: "Nenhuma compra nesta fatura". |
| Fatura fechada em "A pagar" | **I**: `listPayableInvoices` retorna a fatura CLOSED com total > 0 (consumida por SDD-009 `listPayables`). |
| Erro ao carregar / Isolamento | **E**: `route.abort()` ⇒ "Não foi possível carregar" + "Tentar de novo"; **I**: 404 em fatura de outra família. |
| (infra) Derivação | **U**: vetores de `invoiceStatus`. **I**: `cardUsage` x soma manual sobre dados aleatórios (propriedade); total = Σ itens. |

### US-017b
| Cenário BDD | Testes |
| :-- | :-- |
| Pagar a fatura fechada | **I**: Itaú 300000, fatura 120000 (relógio 28/10) ⇒ 201; `accountBalances` Itaú 180000; fatura `PAID`, `paidOn 2026-10-28`; transação `INVOICE_PAYMENT` DEBIT 120000 com descrição "Pagamento da fatura Nubank Mariana - out/2026". **E**: aviso "Fatura paga com sucesso!". |
| Pagar libera o limite | **I**: `usedInCents` cai exatamente 120000. |
| Pagamento não é despesa | **I (regressão obrigatória)**: `ledgerTotals`, Home `monthSummary` e `computeSettlement` idênticos antes/depois; Σ saldos = −120000. |
| Linha neutra no extrato | **I**: item `type INVOICE_PAYMENT` com `account` e `card`; **fora** de `totals`; presente em `count`. **E**: linha neutra "−". |
| Aberta / sem compras não pagável | **I**: `pay` em fatura aberta ⇒ 422 `INVOICE_NOT_CLOSED`; total 0 ⇒ 422 `INVOICE_EMPTY`; `canPay false`. **E**: botão ausente. |
| Conta obrigatória / data futura / antes do fechamento | **U**: schema "Escolha a conta de pagamento". **I**: `paidOn` amanhã ⇒ 422 `FUTURE_DATE_NOT_ALLOWED`; `paidOn 2026-10-25` (= fechamento) ⇒ 422 `PAYMENT_BEFORE_CLOSING`; `2026-10-26` ⇒ 201. |
| Conta ficará negativa | **I**: pagar 120000 com saldo 50000 ⇒ 201, saldo −70000. **E**: aviso e confirmação. |
| Duplo clique não paga duas vezes | **I**: `Promise.all` mesma chave ⇒ 1 pagamento; chaves **diferentes** ⇒ 1×201 e 1×409 `INVOICE_ALREADY_PAID`. |
| Fatura já paga | **I**: segundo `pay` ⇒ 409 "Esta fatura já foi paga". |
| Total mudou durante o pagamento | **I**: `expectedTotalInCents 120000` após compra retroativa de 5000 ⇒ 409 `INVOICE_TOTAL_CHANGED` com `currentTotalInCents 125000`; nada debitado; **corrida** compra x pagamento (`Promise.all`) ⇒ ou compra antes (409) ou pagamento antes (compra 422 `INVOICE_ALREADY_PAID`), **nunca** pagamento sem incluir a compra. |
| Desfazer o pagamento | **I**: `undo-payment` ⇒ saldo restabelecido, fatura `CLOSED`, `usedInCents` volta, perna `UNDONE` + revisão `UNDO`; repetir ⇒ 409 `INVOICE_NOT_PAID`; versão velha ⇒ 409; novo pagamento depois do desfazer ⇒ 201 (índice parcial permite). |
| Compra em fatura paga é recusada | **I**: `POST` com data no ciclo ⇒ 422 `INVOICE_ALREADY_PAID` com a mensagem "A fatura de out/2026 já foi paga. Use uma data posterior ao fechamento."; nada gravado. |
| Compras de fatura paga ficam travadas | **I**: `PATCH`/`delete`/`restore` ⇒ 422 `INVOICE_PAID_LOCKED`; depois de desfazer o pagamento ⇒ 200. |
| Pagamento não editável | **I**: `PATCH`/`delete` do pagamento ⇒ 422 `NOT_EDITABLE`. **E**: detalhe sem Editar/Excluir, com "Desfazer pagamento". |
| Isolamento / Falha de rede | **I**: 404 em `pay`/`undo` de outra família; **E**: mensagem padrão e reenvio com a mesma chave. |
| (infra) Banco | **I**: segundo `INVOICE_PAYMENT` ativo na mesma fatura viola `tx_invoice_payment_active_uq`; `INVOICE_PAYMENT` sem conta ou sem cartão viola `tx_kind_shape_chk`; `DELETE` direto continua proibido (trigger). |
| (infra) Atomicidade | **I**: falha ao gravar a revisão ⇒ pagamento não persiste. |

---

## 9. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-015 | 3 | **3** | Módulo `cartoes` (schemas, repo, 4 rotas), tela/drawer, 2 migrações (`credit_cards`) |
| US-016a | 5 | **5** | **Maior risco**: migração que torna `accountId` anulável e reescreve `tx_kind_shape_chk`, `CardInvoice` + travas, funções puras, drawer "Pagar com", emendas no DTO/extrato. Se estourar, o Dev entrega em *commits* atômicos (banco → serviço → UI) |
| US-016b | 3 | **3** | Regras de edição com troca de fatura (travas ordenadas), filtro por cartão, depende da US-013a |
| US-017a | 3 | **3** | Consultas derivadas, situação por relógio, 2 telas, `listPayableInvoices` |
| US-017b | 5 | **5** | Pagamento com *lock* e `expectedTotalInCents`, desfazer, travas de fatura paga, regressões de totais/acerto |
Ordem técnica: US-015 ➔ US-016a ➔ US-017a ➔ (SDD-009: US-018/US-019) ➔ US-017b ➔ US-016b. A migração `us016_compra_cartao` é a única que reescreve uma constraint do R1; rodar a suíte inteira (`test:int`, `test:e2e`) logo após aplicá-la.

## 10. Impacto no código da R1 (lista de verificação para o Dev)
| Arquivo / módulo | Mudança |
| :-- | :-- |
| `prisma/schema.prisma` + migrações | §7 do modelo de dados; `accountId` anulável em `Transaction`; novos modelos |
| `src/modules/contas/ledger-queries.ts` (`accountBalances`) | Acrescentar `AND "accountId" IS NOT NULL` (teste: compra no cartão não cria chave `null` no mapa) |
| `src/modules/transacoes/schemas.ts` | `CreateExpenseSchema` (conta **ou** cartão), `TransactionDTO` (`account` anulável, `card`, `invoice`, tipo `INVOICE_PAYMENT`), `TransactionDefaults.cardId`, `ListTransactionsQuerySchema` (`cardId`, `type=INVOICE_PAYMENT`) |
| `src/modules/transacoes/{service,repo,extrato}.ts` | Ramo de compra no cartão em `createTransaction`; `getDefaults`; joins de conta/cartão/fatura; `buildLedgerWhere` com `cardId`; `toTransactionDTO` com `account` anulável |
| US-013a (`updateTransaction`/`delete`/`restore`, ainda não implementada) | Regras do §4.6; `NOT_EDITABLE` também para `INVOICE_PAYMENT` |
| `src/components/transaction-drawer.tsx`, `optimistic.ts` | "Pagar com", dica de fatura, aviso de limite; item otimista com `card` no lugar de `account` |
| `src/app/(app)/extrato/*` (`ledger-row`, `transaction-detail-drawer`, `filters`) | Exibir cartão/fatura/marcador; linha neutra de pagamento; filtro "Cartão" |
| `tests/unit/transacoes/schemas.test.ts:38` | A mensagem "Escolha uma conta" passa a ser **"Escolha uma conta ou um cartão"** quando não há conta nem cartão |
| `tests/support/factories.ts`, `prisma/seed.ts` | `makeCard`, `makeInvoice`, `makeCardPurchase`, `makeInvoicePayment`; seed com um cartão |
| `scripts/check-imports.ts` | `cycle` entra na regex dos módulos **puros** (ao lado de `rules`, `settlement`, `period`…); `repo.ts` já é permitido; `queries.ts` usa só o tipo `Tx` (não importa `@/lib/db`) |
