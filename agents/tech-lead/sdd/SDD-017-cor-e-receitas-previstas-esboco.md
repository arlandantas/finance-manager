# SDD-017: Cor por conta/cartão e receitas previstas (US-050, US-051)

- **Histórias**: [US-050](../../product-owner/backlog/stories/US-050-cor-por-conta-e-cartao.md) · [US-051](../../product-owner/backlog/stories/US-051-receitas-previstas-e-saldo-previsto.md)
- **Fluxos**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md) §4, [FLUXO-006](../../product-owner/flows/FLUXO-006-home-resumo-do-mes.md), [FLUXO-005](../../product-owner/flows/FLUXO-005-despesas-previstas.md)
- **Rastreabilidade**: NEED-017 (RN-017.1..4), NEED-015 (RN-015.4), NEED-004 · Q-F03 · D-PO-30, D-PO-31, D-PO-42 · TL-17, TL-21 · **[ADR-023](../adrs/ADR-023-receita-prevista-por-kind-e-cor-por-enum-fixo.md)** (decisões), [ADR-015](../adrs/ADR-015-despesa-prevista-como-entidade-propria.md) (§7 previa a generalização), [SDD-009](SDD-009-despesas-previstas.md), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (`getMonthSummary`, `listDueItems`, tema, `Money`), [SDD-012](SDD-012-manutencao-de-cadastros.md) (arquivadas)
- **Depende de**: US-004/US-015 (contas e cartões) e **US-037** (tokens de tema, contraste) para a US-050; US-018/US-019/US-025 para a US-051; SDD-015 (`splitMode` em previsões, `CHECK` de não divisão)
- **Status**: **Aprovado para Desenvolvimento** (R3) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Estimativas (confirmadas)**: **US-050 = 3 · US-051 = 5** (total 8; **ambas Could**; ordem de corte: US-051 primeiro, depois US-050)
- **Nome do arquivo**: mantém o sufixo `-esboco` só para não quebrar links; o conteúdo é o SDD completo.

---

## 1. Gaps técnicos e decisões

### 1.1 US-050 — cor por conta e cartão
| Gap / Pergunta | Resolução |
| :-- | :-- |
| Representação | `enum AccountColor { BLUE GREEN PURPLE ORANGE PINK TEAL RED YELLOW GRAY BROWN }` (**10 valores**, ordem = ordem da paleta); coluna `color` `NOT NULL` em `bank_accounts` e `credit_cards`. Nomes na UI: Azul, Verde, Roxo, Laranja, Rosa, Turquesa, Vermelho, Amarelo, Cinza, Marrom (`ACCOUNT_COLOR_LABEL`). Sem cor livre (hex): enum fechado ⇒ contraste auditável (ADR-023 §2). |
| Migração dos existentes | SQL determinístico **sem tela**: por família, ordena **todas** as contas e cartões (inclusive arquivados/excluídos, para ser determinístico) por `(createdAt, id)` e atribui a paleta em ciclo (`row_number() % 10`). Resolve "contas antigas recebem cor automática": nenhuma lógica de "primeira exibição". |
| Cor das novas | `color` **opcional** no `POST`; ausente ⇒ servidor escolhe `pickNextColor(usadas)`: a **primeira da paleta ainda não usada** pelas contas/cartões **não excluídos** da família (ativos e arquivados); se todas estão em uso, a **menos usada** (empate: ordem da paleta). Sem trava (duas criações simultâneas podem repetir; RN-017.4 permite). |
| Editar | `color` no `PATCH` de conta e de cartão (pode repetir). `RenameAccountSchema` vira `UpdateAccountSchema { version, name?, color? }` ("Nada para alterar" se nada vier). Arquivar/reativar **mantém** a cor. |
| Tokens e tema | Duas tonalidades por cor (claro/escuro) como variáveis CSS (US-037). **Contraste do ponto ≥ 3:1** contra os fundos de cada tema (teste de unidade lê os tokens do `globals.css`). O **nome nunca some** (ponto + texto). |
| Onde aparece | `SourceBadge` (ponto 10 px + nome) em Extrato (conta/cartão da linha), Home (últimos lançamentos), seletores "Pagar com"/transferência/baixa/pagamento de fatura, faturas, lista de cartões e de contas, detalhe do lançamento. |
| Acessibilidade do seletor | `radiogroup` de 10 opções; cada uma com **nome falado** (`aria-label`); selecionada com `aria-checked` **e texto visível** ("Cor: Laranja (selecionada)"). Nunca só cor. |
| Escopo de cor | **Por conta/cartão** (RN-017.3); não há cor de membro, categoria ou tag. |

### 1.2 US-051 — receitas previstas
| Pergunta da PO | Resolução |
| :-- | :-- |
| Entidade nova ou `kind` | **`kind`** em `planned_expenses` (`PlannedKind { EXPENSE INCOME } DEFAULT EXPENSE`; ADR-015 §7 e ADR-023 §1). Mesma máquina de estados (`PREVISTO ➜ PAGO`; "Recebido" na UI), mesmos guardas (`version`, `LINKED_TO_PLANNED`, desfazer, baixa única) e **todo** o código de serviço/repo/rotas/testes. Dívida de nome (`planned_expenses`/`PlannedExpense`) registrada; renomear só no AP1. |
| `kind` é imutável | O `PATCH` **rejeita** `kind` (`.strict()`); para trocar, exclui-se e cadastra-se de novo (hipótese conservadora; evita categoria incoerente e rateio herdado). |
| Invariantes | `CHECK (kind = 'EXPENSE' OR "isSharedExpense" = false)` e (com a EN-002) `CHECK (kind = 'EXPENSE' OR "splitMode" = 'NONE')`; categoria **do mesmo tipo** do `kind` (serviço, `INVALID_REFERENCE`, como o SDD-009 §3 para despesa). Receita **nunca** entra no acerto (já excluída: base `kind = 'EXPENSE'`). |
| Baixa ("Receber") | `payPlannedExpense` ramifica por `kind`: despesa ⇒ `createExpenseCore` (inalterado); **receita ⇒ `createIncomeCore`** (extraído de `createIncome`, como o SDD-009 extraiu `createExpenseCore`) com **conta de destino**, data (`paidOn`, não futura), **valor efetivo** (padrão = previsto) e `payerMemberId` = **quem recebeu** (padrão = responsável). Mesmo corpo e mesma rota; só a semântica e as mensagens mudam. Desfazer = `UNDONE` da `Transaction` + `PREVISTO` (SDD-009 §4.4, sem mudança). |
| Impacto em `/previstas` e "A pagar" | `listDueItems`/`homePayables`/`GET /payables` filtram **`kind = 'EXPENSE'`**: a lista "A pagar" e todos os números da R2/R2.1 **não mudam**. Novo `listReceivables` e `GET /receivables`. `GET /planned-expenses` ganha `kind=EXPENSE\|INCOME\|ALL` com **padrão `EXPENSE`** (contrato da R2 preservado). A tela `/previstas` ganha abas **A pagar / A receber / Pagas e recebidas** (a rota e o item de menu continuam "Previstas"). |
| Resumo do Mês | `MonthSummaryDTO.toReceive` (**`null` quando não há receita prevista pendente no período** nem atrasada no mês corrente) e `projectedBalanceInCents = saldoAtual − aPagar + aReceber`. O rótulo e o cálculo da R2.1 **permanecem** sem receitas previstas (`projectedBalanceFormula` informa qual vale). Receita prevista **pendente não entra** em `incomeInCents` (vive fora do ledger). Meses passados/futuros seguem D-PO-42 (saldo **atual** menos só os vencimentos do mês, mais só os recebimentos do mês). |
| "A receber" (caixa) | Receitas previstas `PREVISTO` e não excluídas com `dueOn` no período (+ **atrasadas** de períodos anteriores no mês corrente, como em "A pagar"); `isOverdue = dueOn < hoje`. |
| Recorrência | Fora (AP1): cada receita prevista é pontual. |
| Moeda e `Money` | Todo valor novo por `<Money>`; o "A receber" respeita "ocultar valores". |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// ── US-050: src/modules/contas/colors.ts (PURO; entra em PURE do check:imports) ──
export const ACCOUNT_COLORS = ["BLUE","GREEN","PURPLE","ORANGE","PINK","TEAL","RED","YELLOW","GRAY","BROWN"] as const;
export type AccountColor = (typeof ACCOUNT_COLORS)[number];
export const ACCOUNT_COLOR_LABEL: Record<AccountColor, string> = { BLUE: "Azul", GREEN: "Verde", PURPLE: "Roxo", ORANGE: "Laranja", PINK: "Rosa",
  TEAL: "Turquesa", RED: "Vermelho", YELLOW: "Amarelo", GRAY: "Cinza", BROWN: "Marrom" };
export const accountColorSchema = z.enum(ACCOUNT_COLORS, { error: "Escolha uma cor" });
export function pickNextColor(used: AccountColor[]): AccountColor;     // 1ª da paleta não usada; senão a menos usada (empate: ordem da paleta)

// src/modules/contas/schemas.ts e cartoes/schemas.ts
// CreateAccountSchema / CreateCardSchema ganham: color: accountColorSchema.optional()
export const UpdateAccountSchema = z.object({ version: versionSchema, name: /* nome como no SDD-004 */ z.string().trim().min(2).max(60).optional(), color: accountColorSchema.optional() })
  .strict().refine((v) => v.name !== undefined || v.color !== undefined, { message: "Nada para alterar" });   // substitui RenameAccountSchema
// UpdateCardSchema (SDD-008 §2) ganha: color: accountColorSchema.optional() ("Nada para alterar" passa a considerá-lo)
// DTOs: AccountDTO.color; CardDTO.color; TransactionDTO.account: { id; name; color } | null; TransactionDTO.card: { id; name; color } | null;
//       InstallmentPlanDTO.card.color (SDD-014); InvoiceDTO/InvoiceSummaryDTO não mudam (a cor vem do cartão)

// ── US-051: src/modules/previstas/schemas.ts ──
export const PLANNED_KINDS = ["EXPENSE", "INCOME"] as const;
export type PlannedKind = (typeof PLANNED_KINDS)[number];
// CreatePlannedExpenseSchema ganha: kind: z.enum(PLANNED_KINDS).default("EXPENSE")
//   superRefine: kind = "INCOME" && isSharedExpense/split ≠ NONE ⇒ 400 path ["isSharedExpense"] "Receita não é dividida"
// UpdatePlannedExpenseSchema: `kind` NÃO é aceito (strict)
// PayPlannedExpenseSchema: INALTERADO (kind INCOME: accountId = destino; paidOn = data do recebimento; payerMemberId = quem recebeu)
export const ListPlannedQuerySchema = z.object({
  period: periodKeySchema.optional(), status: z.enum(["PREVISTO", "PAGO"]).optional(),
  kind: z.enum(["EXPENSE", "INCOME", "ALL"]).default("EXPENSE"),                   // padrão EXPENSE: contrato da R2 intacto
}).strict();
export const ReceivablesQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();

// PlannedExpenseDTO ganha: kind: PlannedKind   (paid.accountName = conta de DESTINO quando INCOME)
export type ReceivableItemDTO = {
  id: string; title: string; dueOn: string; amountInCents: number; isOverdue: boolean;
  category: { id: string; name: string; icon: string }; responsible: MemberRef;
  href: string;                                                   // /previstas?tab=receber#{id}
};
export type ReceivablesResponse = {
  items: ReceivableItemDTO[];                                     // atrasadas primeiro, depois dueOn, depois título
  period: { key: string; start: string; end: string };
  totals: { dueInCents: number; overdueInCents: number; overdueCount: number; count: number };
};

// src/modules/home/schemas.ts (emenda ao SDD-010 §2)
export type ReceivableBreakdownDTO = { totalInCents: number; overdueInCents: number; overdueCount: number; totalCount: number; items: ReceivableItemDTO[] /* até 5 */ };
// MonthSummaryDTO ganha: toReceive: ReceivableBreakdownDTO | null;  projectedBalanceFormula: "SALDO_ATUAL_MENOS_A_PAGAR" | "SALDO_ATUAL_MENOS_A_PAGAR_MAIS_A_RECEBER"
//   projectedBalanceInCents = currentBalanceInCents − toPay.totalInCents + (toReceive?.totalInCents ?? 0)
//   isEmpty também exige toReceive === null

// src/modules/previstas/copy.ts (PURO; mensagens por kind)
export function plannedCopy(kind: PlannedKind): { created: string; alreadyPaid: string; notPaid: string; paidLocked: string; versionConflict: (name: string) => string;
  futureDate: string; linkedToPlanned: string; paidBadge: string; payAction: string; undoAction: string; payTitle: string };
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

| Rota | Mudança | Erros novos/relevantes |
| :-- | :-- | :-- |
| `POST /api/v1/accounts` · `POST /api/v1/cards` | `color?` (padrão: `pickNextColor`) | 400 "Escolha uma cor" |
| `PATCH /api/v1/accounts/:id` | `UpdateAccountSchema` (`name?`, `color?`) | 409 `VERSION_CONFLICT` · 409 `DUPLICATE_ACCOUNT_NAME` · 400 "Nada para alterar" |
| `PATCH /api/v1/cards/:id` | `UpdateCardSchema` + `color?` | idem; `CYCLE_LOCKED` só quando muda o ciclo |
| `GET /api/v1/accounts` · `/cards` · `/transactions` · `/transactions/:id` | DTOs com `color` | — |
| `POST /api/v1/planned-expenses` | `kind` (padrão `EXPENSE`) | 400 "Receita não é dividida" · 422 `INVALID_REFERENCE` (categoria de outro tipo) |
| `GET /api/v1/planned-expenses?kind=&status=&period=` | `kind` (padrão `EXPENSE`) | 400 |
| `PATCH /api/v1/planned-expenses/:id` · `POST …/delete` | só `EXPENSE`/`INCOME` conforme o registro; **`kind` no corpo ⇒ 400** | 409 `VERSION_CONFLICT` com a mensagem do `kind` · 422 `PLANNED_PAID_LOCKED` com a mensagem do `kind` |
| `POST /api/v1/planned-expenses/:id/pay` | corpo **inalterado**; `kind = INCOME` gera **receita** (`createIncomeCore`) | 409 `PLANNED_ALREADY_PAID` ("Esta receita prevista já foi recebida") · 422 `FUTURE_DATE_NOT_ALLOWED` ("A data do recebimento não pode ser futura") · 409 `VERSION_CONFLICT` · 422 `INVALID_REFERENCE` (`accountId`, `payerMemberId`) |
| `POST /api/v1/planned-expenses/:id/undo-payment` | `kind = INCOME` ⇒ "Desfazer recebimento" | 409 `PLANNED_NOT_PAID` ("Esta receita prevista não foi recebida") |
| `GET /api/v1/receivables?period=` | **novo** | 400 |
| `GET /api/v1/payables` · `GET /api/v1/month-summary` · `GET /api/v1/home` | `payables`/`toPay` **só** `kind = EXPENSE`; `monthSummary.toReceive`, `projectedBalanceFormula` | — |
| `POST/PATCH /api/v1/transactions` · `POST …/delete\|restore` na receita gerada | `LINKED_TO_PLANNED`: "Esta receita veio de uma receita prevista. Use Desfazer recebimento." | 422 |

Mensagens de `kind = INCOME` (constantes em `plannedCopy`; as de despesa **não mudam**): "Receita prevista cadastrada" · "Esta receita prevista já foi recebida" · "Esta receita prevista não foi recebida" · "Receita prevista recebida não pode ser alterada. Use Desfazer recebimento." · "Esta receita prevista foi alterada por {Nome}. Recarregue para continuar." · "A data do recebimento não pode ser futura" · validação "Informe um valor maior que zero", "Informe a descrição", "Escolha uma categoria", "Escolha a conta do recebimento". Rótulos de UI: "Receber", "Desfazer recebimento", "Recebida", "Pagas e recebidas".

---

## 4. Regras e algoritmos

### 4.1 `pickNextColor` e a migração (vetores obrigatórios, `tests/unit/contas/colors.test.ts`)
| # | Entrada (`used`) | Esperado |
| :-- | :-- | :-- |
| C1 | `[]` | `BLUE` |
| C2 | `[BLUE, GREEN]` | `PURPLE` (1ª livre; cenário "Poupança") |
| C3 | `[GREEN, PURPLE]` | `BLUE` (preenche o buraco) |
| C4 | as 10 cores uma vez | `BLUE` (todas em uso, nenhuma menos usada: ordem da paleta) |
| C5 | 10 cores, `BLUE` ×2 e as demais ×1 | `GREEN` (a menos usada é a 1ª entre as de uso 1) |
| C6 | 12ª criação (`BLUE` ×2, `GREEN` ×2, demais ×1) | `PURPLE` (a menos usada, 1ª na paleta) |
Propriedade (≥ 1000 casos): resultado ∈ paleta; nunca devolve uma cor usada se existe livre; determinístico.
**Migração** (integração; `tests/integration/us-050-cores.int.test.ts`): família com 3 contas e 2 cartões (`createdAt` crescentes) ⇒ `BLUE, GREEN, PURPLE, ORANGE, PINK`; 12 fontes ⇒ a 11ª é `BLUE`, a 12ª `GREEN`; famílias **independentes** (ambas começam em `BLUE`); linhas arquivadas/excluídas entram na ordenação; **idempotente** (reaplicar não muda).

### 4.2 Tema e contraste (`globals.css`, `src/lib/contrast.ts` puro)
Variáveis `--source-{blue,green,…}` em `:root` e em `[data-theme="dark"]` (e no `@media (prefers-color-scheme: dark)` do modo "Sistema", como o restante do tema, SDD-010 §4.5). Valores propostos (**normativos como ponto de partida**; o teste manda):
| Cor | Claro | Escuro | Cor | Claro | Escuro |
| :-- | :-- | :-- | :-- | :-- | :-- |
| BLUE | `#2563eb` | `#60a5fa` | TEAL | `#0d9488` | `#2dd4bf` |
| GREEN | `#16a34a` | `#4ade80` | RED | `#dc2626` | `#f87171` |
| PURPLE | `#7c3aed` | `#a78bfa` | YELLOW | `#a16207` | `#facc15` |
| ORANGE | `#ea580c` | `#fb923c` | GRAY | `#6b7280` | `#9ca3af` |
| PINK | `#db2777` | `#f472b6` | BROWN | `#92400e` | `#d6a77a` |
Razões medidas pelo TL (WCAG) contra os fundos do tema (claro `#ffffff` e `#f8fafc`; escuro `#0f172a` e `#020617`): **mínimo claro 3,15:1** (GREEN em `#f8fafc`), **mínimo escuro 6,45:1** (RED em `#0f172a`). O teste `colors-contrast.test.ts` **lê os tokens do `globals.css`** (parse das variáveis) e exige `contrastRatio(cor, fundo) ≥ 3` para cada cor × cada fundo do tema ativo. Se o Dev mudar o tom de fundo (US-037), o teste acusa.
`SourceBadge`: `<span class="source-dot" data-color="BLUE" aria-hidden="true">` + nome em texto (`data-color` + CSS; **sem** estilo inline, preservando a auditoria de cores fixas da US-037). Ponto 10 px, `border` de 1 px com a cor do texto em baixo contraste para a escala de cinza.

### 4.3 Servidor (US-050)
`createAccount`/`createCard`: `color = input.color ?? pickNextColor(coresUsadas)` com `coresUsadas` = `SELECT color FROM bank_accounts WHERE familyId AND deletedAt IS NULL UNION ALL SELECT color FROM credit_cards …` (inclui arquivadas). `updateAccount`/`updateCard`: `color` **sem** efeito de ciclo, sem nova trava; `version` como hoje. Arquivar/reativar não altera `color`. **Nenhuma** consulta de saldo/limite/acerto muda.

### 4.4 `createIncomeCore` e `payPlannedExpense` (US-051; SDD-009 §4.3 emendado)
1. `createIncome` do SDD-001 é **extraído** em `createIncomeCore(tx, ctx, input, { allowArchivedCategory })` (mesmas validações: categoria **de receita**, data não futura "A data da receita não pode ser futura", conta da família e **não arquivada**).
2. `payPlannedExpense` (carrega com `FOR UPDATE`; `version` ➜ `PLANNED_ALREADY_PAID`; `paidOn ≤ hoje`; referências da família) ramifica: `kind = EXPENSE` ⇒ `createExpenseCore` (**inalterado**); `kind = INCOME` ⇒ `createIncomeCore({ accountId, categoryId: planned.categoryId, amountInCents: effective, occurredOn: paidOn, payerMemberId: body.payerMemberId ?? planned.responsibleMemberId, description: planned.description, note })` com `allowArchivedCategory: true`. Depois, o mesmo `UPDATE planned_expenses SET status = 'PAGO', paidTransactionId …` e a resposta (`PayPlannedResponse`; `account.balanceInCents` **sobe**).
3. `undoPlannedPayment` e a guarda `LINKED_TO_PLANNED` valem para receita **sem mudança de lógica** (mensagens por `kind`).
4. A mensagem de `FUTURE_DATE_NOT_ALLOWED` na baixa de receita é a do recebimento ("A data do recebimento não pode ser futura").

### 4.5 `listReceivables` e `getMonthSummary` (US-051; SDD-010 §4.2 emendado)
- `listReceivables(tx, ctx, { period, today })` (`previstas/payables.ts`, função irmã de `listDueItems`): `kind = 'INCOME' AND status = 'PREVISTO' AND deletedAt IS NULL AND dueOn BETWEEN start AND end`; **se `isCurrent`**, `OR dueOn < start` (atrasadas). Ordem: atrasadas primeiro, depois `dueOn`, depois título. `totals.dueInCents = Σ`.
- `listDueItems`/`homePayables`/`GET /payables`: acrescentar `AND kind = 'EXPENSE'` **no `repo.ts`** (único ponto; teste de regressão com receita prevista presente, `A pagar` inalterado).
- `getMonthSummary`: `toReceive = receivablesBreakdown(...)` (`null` se `count = 0`); `projectedBalanceInCents = current − toPay.total + (toReceive?.total ?? 0)`; `projectedBalanceFormula = toReceive ? "…MAIS_A_RECEBER" : "SALDO_ATUAL_MENOS_A_PAGAR"`; `isEmpty = income = 0 ∧ expense = 0 ∧ toPay.totalCount = 0 ∧ toReceive === null`. **Invariantes:** (i) receita prevista **pendente** não altera `incomeInCents`, `expenseInCents`, `byMember`, extrato nem acerto; (ii) dar baixa **move** o valor de "A receber" para `incomeInCents` **do mês do recebimento** (sem duplicidade); (iii) reconciliação do SDD-010 §4.2 (iii) continua valendo.
- **Vetores** (`tests/unit/home/projected-balance.test.ts`, função pura `projectedBalance`): saldo 734950, a pagar 125890, a receber 500000 ⇒ **1109060**; sem a receber ⇒ **609060** (rótulo da R2.1); saldo 100000, a pagar 150000, a receber 80000 ⇒ **30000**; a receber só atrasado no mês corrente entra; mês futuro: `current − toPay(mês) + toReceive(mês)`.
- **Textos** (`home/copy.ts`): R2.1 `"Saldo atual menos o que ainda vai pagar neste mês"`; com receitas: **`"Saldo atual, menos o que falta pagar, mais o que falta receber"`**; negativo mantém `"Seu saldo não cobre o que falta pagar"`.

### 4.6 Invariantes de dados (US-051)
`status = 'PAGO' ⇔ paidTransactionId IS NOT NULL` (CHECK existente); `kind = INCOME ⇒ isSharedExpense = false` (CHECK novo) e `splitMode = 'NONE'` (CHECK da EN-002/US-043 ampliado); a `Transaction` gerada de uma receita é `kind = INCOME` **e** tem `paidPlanned` apontando para a previsão do **mesmo** `kind` (teste de consistência).

---

## 5. Dados e migrações (SQL cru; nunca editar migração aplicada)
**Ordem**: `us050_cores` ➜ `us051_previstas_receita` (independentes; a US-051 vem depois da US-043 no *backlog*).
```prisma
enum AccountColor { BLUE GREEN PURPLE ORANGE PINK TEAL RED YELLOW GRAY BROWN }
enum PlannedKind  { EXPENSE INCOME }
model BankAccount    { /* … */ color AccountColor }       // NOT NULL (backfill na migração)
model CreditCard     { /* … */ color AccountColor }
model PlannedExpense { /* … */ kind PlannedKind @default(EXPENSE)  @@index([familyId, kind, status, dueOn]) }
```
```sql
-- us050_cores (o Prisma cria o enum e as colunas ANULÁVEIS; o SQL abaixo preenche e só então impõe NOT NULL)
WITH src AS (
  SELECT 'A'::text AS t, "id", "familyId", "createdAt" FROM "bank_accounts"
  UNION ALL SELECT 'C', "id", "familyId", "createdAt" FROM "credit_cards"
), ranked AS (
  SELECT t, "id", row_number() OVER (PARTITION BY "familyId" ORDER BY "createdAt", "id") AS rn FROM src
)
UPDATE "bank_accounts" a
SET "color" = (ARRAY['BLUE','GREEN','PURPLE','ORANGE','PINK','TEAL','RED','YELLOW','GRAY','BROWN'])[((r.rn - 1) % 10) + 1]::"AccountColor"
FROM ranked r WHERE r.t = 'A' AND r."id" = a."id";
-- (idem para "credit_cards" com r.t = 'C', repetindo os dois CTE)
ALTER TABLE "bank_accounts" ALTER COLUMN "color" SET NOT NULL;
ALTER TABLE "credit_cards"  ALTER COLUMN "color" SET NOT NULL;
```
```sql
-- us051_previstas_receita (o Prisma cria o enum e a coluna com DEFAULT 'EXPENSE'; linhas existentes viram despesa)
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_income_not_shared_chk CHECK ("kind" = 'EXPENSE' OR "isSharedExpense" = false);
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_income_no_split_chk   CHECK ("kind" = 'EXPENSE' OR "splitMode" = 'NONE');   -- só se `us043_modo_custom` já aplicada; senão omitir e acrescentar nela
```
**Regressão após `us051`**: **todas** as consultas e testes de previstas da R2 (o `kind` padrão preserva os resultados), `A pagar` da Home e do Resumo idênticos com e sem receitas previstas cadastradas. Seed: 1 receita prevista ("Salário"); fábricas `makePlanned({ kind })`; contas/cartões do seed ganham cor pela migração (ou `makeAccount({ color })`).

---

## 6. Interface

### 6.1 US-050
- **Seletor de cor** (`ColorPicker`) em "Nova/Editar conta" e "Nova/Editar cartão": grade de 10 botões 44 px (`role="radio"` dentro de `radiogroup`, `aria-label` = nome da cor), selecionada com marca visível e a linha de texto "Cor: Laranja (selecionada)"; a cor sugerida vem de `pickNextColor` calculada **no cliente** com `["accounts"]`/`["cards"]` (o servidor repete a regra se o campo for omitido). Repetição permitida sem aviso.
- **`SourceBadge`** (ponto + nome) nas superfícies do §1.1; fatura e detalhe usam a cor **do cartão**. Em conta/cartão **arquivado**: nome com "(arquivada)" e a cor mantida.
- **Estados**: o seletor não tem estados de carga próprios (usa o formulário); erro "Escolha uma cor" no campo; sem conexão com a mensagem padrão.
- **Cache**: `PATCH` de conta/cartão invalida `["accounts"]`, `["cards"]`, `["card", id]`, `["transactions"]`, `["home"]`, `["installment-plan"]` (cartão), pois a cor aparece nesses DTOs.
- **Escala de cinza** (cenário BDD): o E2E aplica `filter: grayscale(1)` ao documento e afirma que cada origem continua com **nome visível**.

### 6.2 US-051
- **Previstas** (`/previstas`; título "Previstas"): abas **A pagar** (`GET /payables`, inalterada) · **A receber** (`GET /receivables`) · **Pagas e recebidas** (`GET /planned-expenses?status=PAGO&kind=ALL`); seletor de mês por vencimento (na URL, `?tab=`). Item de receita: descrição, categoria, valor, data esperada, responsável, chip **Atrasada** (cor + texto), ações **Receber**, Editar, Excluir; recebida: **Desfazer recebimento** (diálogo), "Previsto R$ x · Recebido R$ y" e a diferença.
- **Drawer** `planned-drawer.tsx`: controle "Despesa prevista | Receita prevista" no topo (somente no cadastro; fixo na edição, `kind` imutável); a grade de categorias mostra as do `kind`; sem "Dividir" para receita; mensagem "Receita prevista cadastrada". **`pay-drawer.tsx` variante "Receber"**: título "Receber receita prevista", campo de valor **efetivo** pré-preenchido com o previsto e diferença ao vivo ("+R$ 100,00 sobre o previsto"), **conta de destino** (sem aviso de saldo negativo), data (≤ hoje), "Quem recebeu", botão fixo "Confirmar recebimento".
- **Home**: o Resumo ganha a linha **"A receber"** (expansível, até 5 itens com selo "Atrasada" e ação "Receber") **somente** quando `toReceive ≠ null`; "Saldo previsto" usa o rótulo conforme `projectedBalanceFormula`. O bloco/linha "A pagar" **não muda**.
- **Estados**: skeleton por aba; vazio "Nenhuma receita a receber neste mês" + ação "Cadastrar receita prevista"; erro por aba; 409 ⇒ diálogo padrão (mensagem do `kind`); `Idempotency-Key` ao abrir o drawer. Valores por `<Money>`.
- **Cache**: chaves novas `["receivables", period]`; criar/editar/excluir previsão invalidam `["planned"]`, `["payables"]`, `["receivables"]`, `["home"]`, `["month-summary"]`; **baixa/desfazer** invalidam também `["accounts"]`, `["transactions"]`, `["analysis"]` e `["settlement"]` (sem efeito, mas mantém a lista única). Acrescentar `["receivables"]` a `invalidateFinancialCaches`.

---

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); previsão/receita, conta de destino e membros de outra família ⇒ `404`/`INVALID_REFERENCE`; `.strict()` rejeita `familyId`, `status`, `paidTransactionId`, `authorMemberId` **e `kind` no `PATCH`**; cor é enum fechado (`400` para valor fora da paleta). Logs sem descrição/valores. Teste de isolamento por recurso para `GET /receivables` e para a baixa por endereço direto ("Não encontrado").

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, C = componente, I = integração (`db-test`), E = E2E

### US-050 (ordem 12)
| Cenário BDD | Testes |
| :-- | :-- |
| Conta nova recebe uma cor ainda não usada | **U**: C1..C6. **I**: contas `BLUE` e `GREEN` ⇒ `POST` sem `color` ⇒ `PURPLE`; `color` informado vence. |
| Editar a cor / Duas contas podem repetir | **I**: `PATCH { version, color: "ORANGE" }` ⇒ 200; repetir `ORANGE` em outra conta ⇒ 200 (sem erro); `color` inválido ⇒ 400 "Escolha uma cor"; `version` velha ⇒ 409. |
| Cor aparece nos lançamentos junto do nome | **I**: `GET /transactions` ⇒ `account.color`/`card.color`. **C**: `SourceBadge` (ponto `aria-hidden` + nome). **E**: Extrato. |
| Cor nos seletores de pagamento | **C/E**: cada opção de "Pagar com" com ponto e nome. |
| Nome continua visível sem depender da cor | **E**: `grayscale(1)` ⇒ nomes presentes e legíveis. |
| Cartão também tem cor | **I/E**: `PATCH /cards/:id { color }`; compras do cartão mostram o marcador; **o ciclo continua travado** (`CYCLE_LOCKED` não é afetado). |
| Cores legíveis nos dois temas | **U**: `colors-contrast.test.ts` (10 cores × fundos dos dois temas ≥ 3:1; lê o `globals.css`). **E**: alternar tema. |
| Contas antigas recebem cor automática | **I**: migração (§4.1): ciclo, determinismo, famílias independentes, arquivadas incluídas, idempotência. |
| Seletor de cor acessível | **C**: `radiogroup`, `aria-label` por opção, `aria-checked`, texto "Cor: Laranja (selecionada)" (Testing Library `getByRole("radio", { name: "Laranja" })`). |
| (infra) Arquivar mantém a cor | **I**: arquivar/reativar não altera `color`; conta arquivada ainda renderiza a cor no histórico. |
| (infra) Isolamento | **I**: `PATCH` de conta de outra família ⇒ 404. |

### US-051 (ordem 13; **primeiro Could a cortar**)
| Cenário BDD | Testes |
| :-- | :-- |
| Cadastrar uma receita prevista | **I**: `POST { kind: "INCOME", … }` ⇒ 201 "Receita prevista cadastrada"; saldo e extrato **inalterados** (invariante). **E**. |
| Saldo previsto soma o que falta receber | **U**: `projectedBalance` (vetores §4.5). **I**: saldo 734950, a pagar 125890, a receber 500000 ⇒ `toReceive.totalInCents 500000`, **`projectedBalanceInCents 1109060`**, `projectedBalanceFormula = "…MAIS_A_RECEBER"`. **E**: "A receber R$ 5.000,00", "Saldo previsto R$ 11.090,60" e o texto "Saldo atual, menos o que falta pagar, mais o que falta receber". |
| Sem receitas previstas o saldo previsto não muda | **I**: `toReceive null`, `projectedBalanceInCents 609060`, fórmula da R2.1. **E**: sem a linha "A receber". |
| Receber com valor efetivo diferente | **I**: `pay` com `amountInCents 510000`, conta Itaú ⇒ `Transaction INCOME 510000` na data do recebimento; saldo da conta **+510000**; Extrato mostra a receita; `paid.differenceInCents = +10000`. |
| Receita prevista pendente não entra nas receitas do mês | **I**: `incomeInCents` do Resumo e `totals` do Extrato **sem** a pendente. |
| Desfazer o recebimento | **I**: `undo-payment` ⇒ transação `UNDONE`, previsão `PREVISTO`, saldo volta; "Desfazer recebimento" na UI. |
| Receita atrasada | **I**: `dueOn 05/10/2026`, hoje 12/10 ⇒ `isOverdue`, aparece em `toReceive.items` com selo; mês seguinte (corrente = outro) não a lista como atrasada **fora** do mês corrente. **E**: selo "Atrasada". |
| Receita prevista não entra no acerto | **I**: receita recebida ⇒ `GET /settlement` idêntico; `isSharedExpense true` na criação ⇒ 400 "Receita não é dividida". |
| Valor inválido | **U/I**: `0` ⇒ 400 "Informe um valor maior que zero". |
| Baixa única | **I**: segunda baixa com `version` atual ⇒ 409 `PLANNED_ALREADY_PAID` "Esta receita prevista já foi recebida"; `Promise.all` ⇒ exatamente **1** receita gerada. |
| Isolamento | **I**: baixa/`GET` de receita da Família Souza ⇒ 404 ("Não encontrado"). |
| (infra) Regressão da R2 | **I**: a suíte **inteira** de previstas/Resumo/Payables **antes e depois** da migração; `A pagar` idêntico com receitas previstas presentes (`kind` default). |
| (infra) `kind` imutável e categoria | **I**: `PATCH { kind }` ⇒ 400; categoria de despesa em receita prevista ⇒ 422 `INVALID_REFERENCE`; `CHECK`s do banco (`planned_income_not_shared_chk`). |
| (infra) `LINKED_TO_PLANNED` | **I**: excluir/restaurar a receita gerada pelo extrato ⇒ 422 "Esta receita veio de uma receita prevista. Use Desfazer recebimento." |
| (infra) Meses futuros | **I**: mês seguinte: `current − toPay(mês) + toReceive(mês)` (D-PO-42). |
| (infra) Mensagens por `kind` | **U**: `plannedCopy("INCOME")` e `("EXPENSE")` (nenhuma mensagem de despesa mudou). |

---

## 9. Estimativa, dependências e impacto

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-050 | 3 | **3** | Enum + migração, `pickNextColor`, `UpdateAccountSchema`, tokens e contraste, `SourceBadge`, `ColorPicker` (cortável, 2º) |
| US-051 | 5 | **5** | `kind`, `createIncomeCore`, `listReceivables`, Resumo, abas, drawer "Receber" (**primeiro a cortar**) |
Total do SDD: **8**.

**Sequência de *commits* atômicos sugerida**
- **US-050**: (1) migração + schema + `colors.ts` + C1..C6; (2) `UpdateAccountSchema`/`UpdateCardSchema` + DTOs + criação com cor; (3) tokens CSS + `contrast.ts` + teste de contraste; (4) `SourceBadge`/`ColorPicker` e aplicação nas superfícies.
- **US-051**: (1) migração + schema + regressão de `kind` padrão; (2) `createIncomeCore` + ramificação da baixa + `plannedCopy`; (3) `listReceivables`, `GET /receivables`, `getMonthSummary`; (4) UI (abas, drawer, Home).

**Impacto no código existente**: `contas/{schemas,service,repo}.ts` (`color`, `UpdateAccountSchema`), `cartoes/{schemas,service,repo}.ts`, `transacoes/{service,extrato}.ts` (DTO com cor; `createIncomeCore`), `previstas/{schemas,service,repo,payables,rules}.ts` + novo `copy.ts`, `home/{service,schemas}.ts` (`toReceive`, fórmula), `globals.css` (tokens), `src/lib/contrast.ts` (já previsto no SDD-010 §4.5), `previstas-screen.tsx`, `planned-drawer.tsx`, `pay-drawer.tsx`, `home-screen.tsx`, `contas-screen.tsx`, `cartoes-screen.tsx`, `transaction-drawer.tsx`, `extrato-screen.tsx`, novo `components/{source-badge,color-picker}.tsx`, `scripts/check-imports.ts` (`colors.ts`, `previstas/copy.ts` em `PURE`), `prisma/seed.ts`, `tests/support/factories.ts` (`makePlanned({ kind })`, `makeAccount({ color })`), SDD-004 (`RenameAccountSchema` ➜ `UpdateAccountSchema`).

**Testes de R1/R2/R2.1 que mudam**: os que comparam `AccountDTO`/`CardDTO`/`TransactionDTO` por igualdade estrita ganham `color`; os de `A pagar`/Resumo continuam iguais (o `kind` padrão); a regra "saldo previsto" ganha a variante com receitas.

**Ajustes pedidos ao PO / Dev (não bloqueantes)**
1. **PO** (US-051): o `kind` da previsão é **imutável** (excluir e cadastrar de novo para trocar); a aba "Pagas e recebidas" mistura os dois `kind` (TL-21).
2. **PO** (US-050): a cor das contas existentes é atribuída **na migração** (ordem de criação), não "na primeira exibição" (efeito observável idêntico).
3. **Dev**: o contraste é verificado **sobre os tokens reais** do `globals.css`; ao ajustar o tema (US-037), rodar o teste e, se falhar, trocar o tom da cor (não o limite de 3:1).
