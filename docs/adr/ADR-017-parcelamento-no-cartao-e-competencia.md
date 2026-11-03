# ADR-017 — Compra parcelada no cartão (N linhas no ledger) e competência

**Status:** aceito (estende ADR-014; D-PO-25/26, D-GES-16/17) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
Compra parcelada (2x a 24x): parcelas em centavos com sobra na 1ª, limite consumido pelo total e liberado a cada fatura paga, uma linha por parcela no Extrato e na fatura. A parcela conta no mês da **fatura** em que cai; a compra à vista continua pela **data da compra**.

## Decisão
1. **Plano + N lançamentos:** `InstallmentPlan` (compra-mãe, sem valor próprio no ledger; nunca entra em soma) e cada parcela é `Transaction(kind = EXPENSE)` de cartão com `installmentPlanId`, `installmentNo`, `installmentCount`, `invoiceId` da **sua** fatura. `CHECK` de consistência (todos nulos ou todos preenchidos, 1 ≤ no ≤ count ≤ 24) e único `(installmentPlanId, installmentNo)`. Compra à vista e 1x não têm plano. Parcelas herdam categoria, descrição, pagador, rateio, tags e nota.
2. **Cálculo** (`buildInstallments`): `base = ⌊total ÷ N⌋` e **toda a diferença vai para a parcela 1** (R$ 1.000,01 em 3x ⇒ 333,35 + 333,33 + 333,33). Data da parcela *k* = `addMonthsClamped(purchaseOn, k − 1)` sempre a partir da data original (31/01 ⇒ 28/02 ⇒ 31/03). Fatura = `invoiceRefFor(data_k, closingDay)`.
3. **Limite:** `usedInCents` soma todas as faturas sem pagamento ativo (inclusive futuras); sem regra nova.
4. **Competência:** coluna `competenceOn` decide em que mês o lançamento conta (Extrato, Resumo, Acerto, Análise, `byMember`, totais). Sem plano, `competenceOn = occurredOn` (garantido por `CHECK` e trigger); para parcela, `= closingDate` da fatura da parcela. Toda consulta por período usa o **mesmo predicado** `ledgerPeriodWhere` (`competenceOn BETWEEN :start AND :end`); script de CI falha se aparecer `occurredOn BETWEEN` fora dele; teste de propriedade de reconciliação entre telas.
5. Dados existentes inalterados (`competenceOn = occurredOn`); regressão dos vetores homologados antes e depois da migração.
6. **Datas futuras:** a validação "não futura" vale para `purchaseOn`. `recent` da Home e "últimos lançamentos" filtram `occurredOn <= hoje`; `defaults` ignora parcelas futuras. Extrato exibe a data nominal e a etiqueta "Fatura dez/2026 · 1/10".
7. **Atomicidade:** plano + N parcelas + até N faturas numa transação, travando faturas em ordem crescente de `ref`; `Idempotency-Key` cobre a compra inteira. Fatura paga no intervalo ⇒ `422 INVOICE_ALREADY_PAID`.
8. **Edição:** parcelas são somente leitura até haver edição de série (`422 INSTALLMENT_NOT_EDITABLE`); "esta e as próximas" usa `InstallmentPlan.version` + `version` da parcela e só altera faturas abertas. Excluir a compra inteira (+ Desfazer) deve existir desde a primeira entrega.
9. `cycleLocked = EXISTS(card_invoices)` segue suficiente; ciclo versionado futuro deve olhar faturas futuras materializadas.

## Consequências
- Parcelas anteriores ao app: ver ADR-027; parcela na k-ésima fatura: ADR-020.
- Descartados: compra-mãe como `EXPENSE` com o total, tabela `Installment` separada, gerar faturas sob demanda ao ler.
