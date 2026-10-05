# SDD-014: Compra parcelada no cartão (US-040, US-041, US-042) — **ESBOÇO** (R3; a detalhar quando a R3 iniciar)

- **Histórias**: [US-040](../../product-owner/backlog/stories/US-040-compra-parcelada-no-cartao.md) · [US-041](../../product-owner/backlog/stories/US-041-gerenciar-compra-parcelada.md) · [US-042](../../product-owner/backlog/stories/US-042-parcelado-dividido-no-acerto-por-parcela.md)
- **Fluxo**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md)
- **Rastreabilidade**: NEED-003 (RN-003.4..9), NEED-007, NEED-018 · Q-F05, Q-F14, Q-20 · D-PO-25, D-PO-26 · D-GES-16, D-GES-17 · **[ADR-017](../adrs/ADR-017-parcelamento-no-cartao-e-competencia.md)** (decisão e motivos; este esboço não os repete), [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md), **[ADR-016](../adrs/ADR-016-percentual-gravado-por-lancamento.md)** (US-042)
- **Depende de**: SDD-008 (fatura, limite, travas), SDD-001 (lançamento), SDD-002/SDD-011 (acerto), SDD-010 (predicado de período), SDD-012 (arquivar cartão) · **EN-002 antes da US-042**
- **Status**: **Esboço** · Autor: Agente Tech Lead · Estimativa: **US-040 = 8 (fatiar 040a = 5 · 040b = 3) · US-041 = 5 · US-042 = 3 (após a EN-002)**

## 1. Escopo do detalhamento futuro
Contratos Zod/TS completos, estados de UI, matriz BDD→teste (a partir dos 16 cenários da US-040, 13 da US-041 e 10 da US-042) e a lista de impacto (§9). O que **já está decidido** está no ADR-017; aqui ficam contratos, vetores e tarefas.

## 2. Contratos (rascunho)
```typescript
// CreateExpenseSchema (SDD-008 §3.2) ganha:
installments: z.number({ error: "Escolha de 1 a 24 parcelas" }).int("Escolha de 1 a 24 parcelas")
  .min(1, "Escolha de 1 a 24 parcelas").max(24, "Escolha de 1 a 24 parcelas").default(1),
// regra: installments > 1 exige cardId (senão 400 path ["installments"] "Parcelas só valem para compra no cartão")
// regra: amountInCents (TOTAL) >= installments (>= 1 centavo por parcela) senão 422 INSTALLMENT_TOTAL_TOO_SMALL
export type InstallmentDTO = { planId: string; no: number; count: number };              // TransactionDTO.installment | null
export type InstallmentPlanDTO = { id: string; totalInCents: number; count: number; purchaseOn: string; card: { id; name };
  description: string; installments: TransactionDTO[]; version: number; deleted: boolean };
export type CreateTransactionResponse = { transaction: TransactionDTO /* parcela 1 */; plan?: InstallmentPlanDTO; card?: {...} };
export const DeleteInstallmentPlanSchema = z.object({ version: versionSchema }).strict();       // US-040b
export const EditInstallmentSchema = z.object({ version: versionSchema /* da parcela */, planVersion: versionSchema,
  scope: z.enum(["ONLY_THIS", "THIS_AND_NEXT"]).default("ONLY_THIS"),
  amountInCents: amountInCentsSchema.optional(), categoryId: uuidSchema.optional(), description: ..., note: ... }).strict();   // US-041
```
## 3. API (rascunho)
| Rota | Observação |
| :-- | :-- |
| `POST /api/v1/transactions` (`cardId` + `installments`) | Cria plano + N parcelas + faturas (ADR-017 §5). `201`. Erros novos: `422 INSTALLMENT_TOTAL_TOO_SMALL`, `422 INVOICE_ALREADY_PAID`. |
| `GET /api/v1/installment-plans/:id` | "Ver compra" (plano + parcelas com situação da fatura). |
| `POST /api/v1/installment-plans/:id/delete` · `/restore` | **US-040b (recomendação)**: exclui todas as parcelas em faturas abertas; `422 INSTALLMENT_PLAN_LOCKED` "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas." |
| `PATCH /api/v1/transactions/:id` (parcela) | **Até a US-041**: `422 INSTALLMENT_NOT_EDITABLE`. Depois: `EditInstallmentSchema`. |
| `GET /api/v1/cards/:id/invoices[/ref]` | Faturas futuras materializadas; `isFuture`; `nextRef` além da aberta; `installmentsFutureInCents` ("Parcelas futuras") no `CardDTO`. |

## 4. Algoritmos e vetores (`src/modules/cartoes/installments.ts`, puro, 100% de ramos)
```typescript
export function splitInstallments(totalInCents: number, count: number): number[];                       // toda a sobra na parcela 1
export function addMonthsClamped(date: DateISO, months: number): DateISO;                               // sempre a partir da data original
export function buildInstallments(i: { totalInCents; count; purchaseOn: DateISO; closingDay: number; dueDay: number }):
  Array<{ no: number; amountInCents: number; occurredOn: DateISO; invoiceRef: string; competenceOn: DateISO }>;
```
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| I1 | `splitInstallments(100001, 3)` | `[33335, 33333, 33333]` |
| I2 | `splitInstallments(250000, 10)` | dez × `25000` |
| I3 | `addMonthsClamped("2027-01-31", 1)` / `2` | `"2027-02-28"` / `"2027-03-31"` (não encadeia: 31/01 ⇒ 28/02 ⇒ **31**/03) |
| I4 | `addMonthsClamped("2028-01-31", 1)` | `"2028-02-29"` (bissexto) |
| I5 | compra 10/11/2026, fechamento 25, vencimento 5, 10x de 250000 | refs `2026-11 … 2027-08`; parcela 10 em `2027-08-10`; `competenceOn` = fechamento da fatura (`2026-11-25`…) |
| I6 | compra 28/11/2026 (depois do fechamento 25) | parcela 1 em `ref 2026-12`, `competenceOn 2026-12-25`; parcela 2 em `2027-01` |
| I7 | `count = 1` | **não** gera plano (comportamento à vista) |
| I8 | `totalInCents = 2`, `count = 3` | erro (`INSTALLMENT_TOTAL_TOO_SMALL`) |
| Propriedades | Σ parcelas = total; todas ≥ 1; datas crescentes; `competenceOn` não decresce; mesmo resultado se a compra for repetida |

## 5. Dados (rascunho; migração `us040_parcelamento`, ver `modelo-de-dados.md` §9)
`installment_plans`; `transactions` + `installmentPlanId/No/Count` + `competenceOn` (retropreenchido com `occurredOn`, `CHECK`, trigger de sincronização, índice por `competenceOn`); `CHECK` de consistência e unicidade `(installmentPlanId, installmentNo)`. **Regressão obrigatória após a migração**: vetores S1..S13, dados homologados e a suíte completa. Todas as consultas por período trocam para `competenceOn` **em um único ponto** (`periodPredicate`, SDD-010 §4.1).

## 6. US-042: acerto por parcela (com a EN-002)
Cada parcela grava o rateio (ADR-016) com o vetor da regra **na data da compra**; centavos por parcela pela regra do §2 do ADR-016; "Dividir" no parcelado habilita-se quando a EN-002 está ativa na família. Lista de despesas do acerto mostra "Geladeira 1/3". Crédito ao `payerMemberId` (Q-20). Testes: vetores do cenário ("3x R$ 3.000,00" ⇒ 1000/1000/1000 nos acertos de nov, dez, jan; cota 500,00), regra alterada depois (parcela 2/3 permanece 50/50), exclusão de parcela (US-041) recalcula o mês, **assimetria**: compra à vista e parcelada em 28/11 caem em meses diferentes **e** os quatro lugares (Extrato, Resumo, Acerto, Análise) concordam (propriedade).

## 7. Interface (rascunho)
Seletor "Parcelas" (1x padrão) abaixo de "Pagar com" só com cartão; prévia "10x de R$ 250,00 · 1ª na fatura de nov/2026" calculada **no cliente** com `buildInstallments` e os dias do cartão; aviso de limite sobre o **total**; "Dividir com a família" mostra "Disponível em breve" até a EN-002 estar ativa; Extrato com etiqueta "Fatura dez/2026 · 3/10" e link "Ver compra"; fatura com subtotal "Parcelas futuras".

## 8. Testes principais (a expandir)
Unidade I1..I8 + propriedades; integração: criação atômica (falha injetada na 7ª parcela ⇒ nada gravado), 24 faturas travadas em ordem (sem `deadlock` em compras simultâneas no mesmo cartão), idempotência (duplo clique ⇒ 1 plano), limite (`usedInCents` = total; pagar a fatura de nov libera só 250000), `recent` da Home sem parcelas futuras, `defaults` ignora futuras, fatura paga no intervalo ⇒ `INVOICE_ALREADY_PAID`; E2E dos cenários BDD; regressão completa.

## 9. Lista de impacto no código existente
`transacoes/{schemas,service,extrato,repo}.ts` (`installment`, `competenceOn`, `periodPredicate`), `home/{repo,service}.ts` (`recent`), `split/repo.ts` e `/settlement/expenses` (período), `cartoes/{queries,invoices,service}.ts` (faturas futuras, `isFuture`, `nextRef`, subtotal), `previstas/payables.ts` (faturas futuras em "A pagar" por vencimento), SDD-012 (`CARD_HAS_FUTURE_INSTALLMENTS`), `check:imports` (nenhum `occurredOn BETWEEN` fora do predicado), `tests/support/factories.ts` (`makeInstallmentPurchase`), `prisma/seed.ts`.
