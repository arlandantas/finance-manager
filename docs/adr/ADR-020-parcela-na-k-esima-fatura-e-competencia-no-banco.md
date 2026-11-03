# ADR-020 — Parcela *k* na *k*-ésima fatura, competência derivada no banco, exclusão do plano por carimbo

**Status:** aceito (refina ADR-017) · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
Lido literalmente, o ADR-017 produz duas parcelas na mesma fatura com fechamento no dia 28 e compra nos dias 29..31. A competência escrita só pela aplicação pode divergir em caminhos esquecidos (seed, scripts). O desfazer da exclusão do plano não pode ressuscitar parcelas excluídas antes.

## Decisão
1. **Fatura da parcela:** `ref_1 = invoiceRefFor(purchaseOn, closingDay)`; `ref_k = addMonthsToRef(ref_1, k − 1)` (refs estritamente consecutivas, uma parcela por fatura). Data nominal `occurredOn_k = addMonthsClamped(purchaseOn, k − 1)` sempre a partir da data original.
2. **`competenceOn` derivada no banco:** gatilho `BEFORE INSERT OR UPDATE` em `transactions`: sem plano ⇒ `occurredOn`; com plano ⇒ `closingDate` da fatura da linha. `CHECK tx_competence_chk` (`installmentPlanId IS NOT NULL OR competenceOn = occurredOn`) permanece. Nenhum caminho de escrita consegue gravar competência divergente.
3. **Exclusão/restauração do plano por carimbo único:** `InstallmentPlan.deletedAt = at` e cada parcela ativa recebe o **mesmo** `deletedAt` (um `clock.now()`, `deletionReason = DELETED`). Restaurar devolve **somente** parcelas com `deletedAt = plan.deletedAt`. A trilha fica nas revisões de cada parcela.
4. **Data futura não vaza:** `recent` da Home, `getDefaults` e `usageCountByMe` filtram `occurredOn <= hoje`. Extrato, Resumo, Acerto e Análise usam só a competência (predicado único).

## Consequências
- `installments.ts` (puro) chama `invoiceRefFor` uma vez e `addMonthsToRef` nas demais; o cliente reutiliza para a prévia.
- Testes: gatilho corrige competência divergente; propriedade de refs consecutivas; vetor de borda (fechamento 28, compra 31/01).
- Descartados: ADR-017 §2 literal, competência gravada pela aplicação, tabela de eventos do plano.
