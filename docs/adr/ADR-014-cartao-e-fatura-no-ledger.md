# ADR-014 — Cartão de crédito, fatura e pagamento da fatura no ledger

**Status:** aceito (estende ADR-007) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
Compra no cartão consome limite e não altera saldo de conta; a fatura fechada é paga a partir de uma conta. A compra é despesa (extrato, totais, acerto, pela data da compra); o pagamento da fatura **não** é despesa.

## Decisão
1. **Compra no cartão** = `Transaction(kind = EXPENSE)` com `accountId = NULL`, `cardId` e `invoiceId`. Totais/acerto não mudam; o saldo filtra `"accountId" IS NOT NULL`.
2. **Pagamento da fatura** = `Transaction(kind = INVOICE_PAYMENT)`, uma perna `DEBIT` na conta, com `cardId`, `invoiceId`, `amountInCents` = total no momento, sem categoria/pagador, `isSharedExpense = false`. Entra no saldo, fora de `ledgerTotals` e do acerto. Desfeito por exclusão lógica `UNDONE`.
3. **Fatura** = `CardInvoice` materializada sob demanda, única por `(cardId, referenceMonth "YYYY-MM" do fechamento)`; grava `closingDate`/`dueDate` calculadas com os dias do cartão na criação (o ciclo é imutável após a primeira compra). **Não guarda total nem situação.**
4. **Derivados:** total = Σ compras ativas da fatura; usado do cartão = Σ compras ativas de faturas sem pagamento ativo; situação (`OPEN | CLOSED | PAID`, `isOverdue`) = função pura de `(closingDate, dueDate, pagamento ativo, hoje)` no fuso `America/Sao_Paulo`.
5. **Fatura da compra:** `invoiceRefFor(date, closingDay)` = mês da data se `dia ≤ closingDay`, senão o seguinte (dia do fechamento fica na fatura que fecha). `dueDate` no mês do fechamento se `dueDay > closingDay`, senão no seguinte.
6. **Concorrência:** toda operação que altera uma fatura faz `SELECT … FOR UPDATE` em `card_invoices`; edição que toca duas faturas trava em ordem crescente de `referenceMonth`. Pagamento exige `expectedTotalInCents` e recalcula sob lock (`409 INVOICE_TOTAL_CHANGED`). Índice único parcial: no máximo **um pagamento ativo por fatura**.
7. **Fatura paga é travada:** nova compra que resolve para fatura paga ⇒ `422 INVOICE_ALREADY_PAID`; editar/excluir/restaurar ⇒ `422 INVOICE_PAID_LOCKED` (desfazer o pagamento antes).
8. **Banco:** `CHECK` de forma por `kind` (compra: conta nula, cartão e fatura não nulos; demais: conta não nula, exceto `INVOICE_PAYMENT`); FKs compostas `(familyId, cardId)`/`(familyId, invoiceId)`; dias 1..28; `limitInCents > 0`.

## Consequências
- Descartados: cartão como conta negativa (derrubaria o saldo na compra), tabela `CardPurchase`, pagamento como despesa (conta duas vezes), fatura com status/total gravados.
- Risco documentado: o acerto credita a compra a `payerMemberId` (quem comprou), não a quem paga a fatura.
- Parcelamento reaproveita `CardInvoice` (ADR-017, ADR-020).
