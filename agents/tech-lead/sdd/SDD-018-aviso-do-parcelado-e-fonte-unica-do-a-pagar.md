# SDD-018: Aviso do parcelado fora do acerto e fonte única do "A pagar" (US-052, US-055)

- **Histórias**: [US-052](../../product-owner/backlog/stories/US-052-aviso-visivel-parcelado-fora-do-acerto.md) · [US-055](../../product-owner/backlog/stories/US-055-faturas-na-tela-a-pagar.md)
- **Release**: v0 alpha ([`release-v0-alpha.md`](../../product-owner/backlog/release-v0-alpha.md)) · **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead
- **Base**: SDD-009 §4.6 (`listPayables`), SDD-010 §4.2 (`listDueItems`), SDD-011 (indicador do acerto), SDD-014 (`INSTALLMENT_SPLIT_RELEASED`)
- **Estimativas (TL)**: **US-052 = 2 · US-055 = 3** (confirmadas)
- **Restrição**: nenhum cálculo do motor do acerto muda (S1..S16, 3.169,90 / 1.584,95 / 1.149,95 verdes). Sem migração.

## 1. US-052 — aviso do parcelado

### 1.1 Decisões
| Gap | Resolução |
| :-- | :-- |
| Texto único | `INSTALLMENT_SPLIT_NOTICE` em `src/modules/cartoes/installment-copy.ts` (string exata da história). Nenhum outro lugar escreve o texto. |
| Quando exibir | `showInstallmentNotice = settlementEnabled && !INSTALLMENT_SPLIT_RELEASED`. Quando a US-042 virar o flag, todos os avisos somem sem tocar em tela (cenário de remoção = teste com flag `true`). |
| Contagem no Acerto | Consulta **somente leitura**, fora do `computeSettlement`: `countInstallmentsOutside(tx, familyId, period)` = `EXPENSE` com `installmentPlanId IS NOT NULL`, `deletedAt IS NULL`, não comum, no **mesmo predicado de período** do acerto (`ledger-where.ts`, por `competenceOn`). Retorna `{ count, totalInCents }`. |
| Formulário | Faixa `role="note"` abaixo do interruptor "Dividir" quando `installments >= 2`; interruptor `disabled` + `aria-describedby` da faixa. À vista: interruptor habilitado (comportamento atual). |
| Resumo | `SettlementIndicatorDTO` ganha `installmentsOutside: { count, totalInCents } | null`; ícone "i" com tooltip/`aria-label` = texto padrão quando `count > 0`. |
| Detalhe "Ver compra" | Linha "Fora do acerto" + texto padrão (só com acerto ligado). |

### 1.2 Contratos
```ts
// src/modules/split/schemas.ts (acréscimo, aditivo)
export const InstallmentsOutsideSchema = z.object({ count: z.number().int().nonnegative(), totalInCents: z.number().int().nonnegative() });
// SettlementResponse.pending  += installmentsOutside: InstallmentsOutside | null
// SettlementIndicatorDTO      += installmentsOutside: InstallmentsOutside | null
```
Nenhuma rota nova; `GET /api/v1/settlement` e `GET /api/v1/home` só ganham o campo (`null` com acerto desligado ou flag liberado).

### 1.3 Testes
- **Unidade**: `showInstallmentNotice` (4 combinações); pluralização "1 parcela"/"N parcelas" e "1 despesa"/"N despesas".
- **Integração**: `countInstallmentsOutside` com parcela no mês, parcela de outro mês, parcela excluída, compra à vista (0); **regressão**: snapshot do `computeSettlement` idêntico com e sem parcelas no mês (valores homologados).
- **E2E (BDD 1:1)**: os 8 cenários da US-052 (formulário 3x/1x/3x→1x, Acerto com/sem parcela, Resumo, Ver compra, números iguais) em 375 e 1280 px; mais 1 cenário "acerto desligado não mostra nada".

## 2. US-055 — faturas em "A pagar" com fonte única

### 2.1 Problema encontrado no código
Hoje há **duas definições** de "a pagar": `listPayables` (tela `/previstas`, só faturas **fechadas**) e `listDueItems` (Resumo, faturas **abertas e fechadas**, `includeOpen: true`), além de `homePayables` (Início). Os totais podem divergir. Esta história unifica.

### 2.2 Decisão: um coletor, três recortes
`src/modules/previstas/payables.ts`:
```ts
/** Única consulta: previstas PREVISTO não excluídas + faturas NÃO pagas (abertas ou fechadas) com total > 0. */
async function collectOpenPayables(tx: Tx, ctx: RequestContext): Promise<PayableItemDTO[]>;
/** Recorte por período (A pagar e Resumo): vencimento no período; no período corrente, + atrasados anteriores. */
export function slicePeriod(items, q: { period; isCurrent }): PayableItemDTO[];
/** Recorte por janela (Início, US-061): atrasados + vencimento em [hoje, hoje+7]. */
export function sliceWindow(items, today: DateISO, days = 7): PayableItemDTO[];
```
- `listDueItems` = `slicePeriod(collectOpenPayables())` + somatórios (inalterado para o Resumo).
- `listPayables` (`GET /api/v1/payables`) passa a **reusar `listDueItems`**; resposta ganha `groups` (UI: previstas e faturas em grupos distintos) sem quebrar `items`/`totals`.
- `homePayables` passa a usar `sliceWindow` (US-061 amplia a Início).
- Ordenação única `comparePayables` (atrasados, vencimento, título). Fatura de total 0 nunca entra (filtro no coletor). Parcelas futuras: só entram como parte do total da fatura do mês (já é assim em `listPayableInvoices`).

### 2.3 Contrato
```ts
export const PayableItemSchema = z.object({
  type: z.enum(["PLANNED", "INVOICE"]), id: z.string(), title: z.string(), dueOn: dateISO,
  amountInCents: z.number().int().positive(), isOverdue: z.boolean(),
  invoiceStatus: z.enum(["OPEN", "CLOSED"]).nullable(),   // novo: selo "Aberta"/"Fechada" (null em PLANNED)
  responsible: MemberRefSchema.nullable(), isSharedExpense: z.boolean().nullable(), href: z.string(),
});
// PayablesResponse: { items, groups: { planned: Item[], invoices: Item[] }, period, totals } — totals.dueInCents === summary.toPay.totalInCents
```

### 2.4 UI (`/previstas`)
Grupo "Faturas" (linha "Fatura {cartão} · vence dd/mm", selos Aberta/Fechada/Atrasada, ação "Ver fatura" = link `href`; **sem pagar na lista**) e grupo "Previstas" (com "Dar baixa"). Total no topo. Mesmo componente de linha do Resumo. Estados: skeleton, vazio "Nada a pagar neste mês", erro com "Tentar de novo". `Money` respeita ocultar valores.

### 2.5 Testes
- **Unidade**: `slicePeriod` (corrente com atrasados, futuro sem atrasados), `sliceWindow` (limites 7/8 dias, atrasado sempre entra), `comparePayables`.
- **Propriedade (integração, obrigatória)**: para fixtures aleatórias (previstas pagas/pendentes/excluídas, faturas abertas/fechadas/pagas/zeradas, 3 períodos), `listPayables(p).totals.dueInCents === getMonthSummary(p).toPay.totalInCents` e os `id`s são os mesmos.
- **Integração**: fatura paga sai; fatura zerada não aparece; fatura atrasada de agosto aparece só no período corrente.
- **E2E (BDD 1:1)**: os 8 cenários da US-055 (inclui reconciliação 1.129,00 com o Resumo e "R$ •••••").
- **Regressão**: E2E existentes da US-018/019/025 (o A pagar da tela passa a incluir fatura aberta: ajustar só os testes que assumiam "só fechadas" — listar no relatório do Dev).
