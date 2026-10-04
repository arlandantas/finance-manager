# ADR-014: Cartão de crédito, fatura e pagamento da fatura no ledger

## Status
Aceito (Tech Lead, 2026-10-04). **Estende o ADR-007** (modelo único de movimentação) para a R2 (US-015..017b). Resolve o **GAP-3** do PO (`Transaction` exigia `accountId`).

## Contexto
NEED-003/RN-003.1: compra no cartão consome **limite**, **não** altera saldo de conta; a fatura fechada é paga a partir de uma conta. O PO decidiu (FLUXO-004 §4): a compra é **despesa** (extrato, totais do mês e acerto, pela data da compra); o **pagamento da fatura não é despesa** (como transferência: movimenta caixa sem criar gasto). Restrições herdadas: totais/saldo/acerto vivem em **uma função de consulta cada** (ADR-007 §6); saldo é derivado; `Transaction` não tem `DELETE`.

## Decisão
1. **Compra no cartão = `Transaction(kind = EXPENSE)`** com `accountId = NULL`, `cardId` e `invoiceId` preenchidos. Mesma tabela, mesmos `isSharedExpense`, `payerMemberId`, `authorMemberId`, `occurredOn` (data da compra), `version`, revisões e exclusão lógica. **Nenhuma consulta de totais/acerto muda** (`kind = EXPENSE`), e o saldo (`GROUP BY accountId`) ignora as compras no cartão porque não têm conta (a consulta passa a filtrar `"accountId" IS NOT NULL`).
2. **Pagamento da fatura = `Transaction(kind = INVOICE_PAYMENT)`**, **uma perna**: `direction = DEBIT`, `accountId` (conta debitada), `cardId`, `invoiceId`, `amountInCents` = total da fatura no momento, sem categoria, sem `payerMemberId`, `isSharedExpense = false`. Entra no **saldo** (debita a conta) e **fica fora** de `ledgerTotals` (`kind IN (EXPENSE, INCOME)`) e do acerto (`kind = EXPENSE`), sem código novo. Aparece no extrato como linha neutra. É **desfeito** por exclusão lógica com `deletionReason = UNDONE` e revisão `UNDO` (mesmo vocabulário do desfazer transferência). Escolhido em vez de `TransferGroup` porque não existe a segunda perna em conta.
3. **Fatura = `CardInvoice` materializada sob demanda**: `(cardId, referenceMonth "YYYY-MM" do mês de fechamento)` único; guarda `closingDate` e `dueDate` (`DATE`) **calculadas com os dias do cartão no momento da criação**. Como o ciclo do cartão é imutável depois da primeira compra (D-PO-07), os dias gravados nunca divergem do cartão. A fatura **não guarda** total nem situação.
4. **Total, limite e situação são derivados**: total da fatura = Σ compras ativas com `invoiceId`; **usado** do cartão = Σ compras ativas cujas faturas **não têm pagamento ativo**; **situação** (`OPEN | CLOSED | PAID`, mais `isOverdue`) = função pura de `(closingDate, dueDate, existe pagamento ativo, hoje)`, com `hoje` do `Clock` no fuso `America/Sao_Paulo` (ADR-010). Sem coluna de saldo/situação ⇒ sem *lost update* nem job de "fechar fatura".
5. **Fatura da compra**: `invoiceRefFor(date, closingDay)` = mês da data se `dia(date) ≤ closingDay`, senão o mês seguinte (compra no dia do fechamento fica na fatura que fecha; D-PO-06). `dueDate` = mesmo mês do fechamento se `dueDay > closingDay`, senão mês seguinte.
6. **Concorrência**: toda operação que altera o conteúdo de uma fatura (criar/editar data/excluir/restaurar compra, pagar, desfazer pagamento) executa `SELECT … FROM card_invoices WHERE id = … FOR UPDATE` antes de checar o estado e gravar; quando uma edição toca **duas** faturas, trava em ordem crescente de `referenceMonth` (evita *deadlock*). O pagamento exige `expectedTotalInCents` e recalcula dentro do *lock* (`409 INVOICE_TOTAL_CHANGED` se diferir). Índice único parcial garante **no máximo um pagamento ativo por fatura**.
7. **Fatura paga é travada**: criar compra com data que resolve para fatura paga ⇒ `422 INVOICE_ALREADY_PAID`; editar/excluir/restaurar compra de fatura paga ⇒ `422 INVOICE_PAID_LOCKED`. Para alterar, desfaz-se o pagamento antes.
8. **Integridade no banco** (SQL cru, `modelo-de-dados.md` §7): `CHECK` de forma por `kind` (compra: conta nula + cartão e fatura não nulos; todos os demais: conta não nula, cartão/fatura nulos, exceto `INVOICE_PAYMENT`); FKs compostas `(familyId, cardId)` e `(familyId, invoiceId)`; `CHECK` de faixa 1..28 nos dias; `limitInCents > 0`.

## Alternativas descartadas
- **Cartão como `BankAccount` com saldo negativo** (pagar = transferência): reaproveitaria transferências, mas **o saldo da família cairia na compra**, contrariando RN-003.1 e o "separar cartão do saldo imediato" do Stakeholder; e o ciclo/limite precisariam de entidade própria de qualquer jeito.
- **Tabela `CardPurchase` separada**: triplica extrato, totais e acerto (mesma razão do ADR-007).
- **Pagamento da fatura como despesa**: conta o gasto duas vezes (compra e pagamento) e distorce acerto e totais.
- **Fatura com `status` e `total` gravados**: exige job de fechamento, correção de total a cada edição e invalida cache; a derivação é barata (índice `(familyId, invoiceId)`).
- **Ciclo versionado por vigência** (como ADR-011) para permitir mudar os dias: custo alto para R2; D-PO-07 trava a mudança após a primeira compra. Reavaliar no AP1, quando o parcelamento exigir projeção de faturas futuras.

## Consequências
- **Impactos nos SDDs da R1** (listados no SDD-008 §10): `accountId` nulo em `TransactionDTO`, `accountBalances` filtra `accountId IS NOT NULL`, extrato ganha `cardId`/`INVOICE_PAYMENT`, US-013 trata compras de cartão e travas de fatura.
- **Risco econômico documentado (Q-20):** o acerto credita a compra a `payerMemberId` (quem comprou), não a quem paga a fatura. Mudar isso (AP2) é uma regra de consulta, não de modelo.
- Totais/acerto/Home **não mudam de código**; a regressão é coberta por testes que injetam compras no cartão e pagamentos de fatura.
- Parcelamento (AP1) reaproveita `CardInvoice`: uma compra parcelada vira N linhas `EXPENSE` com `installmentGroupId`, uma por fatura.
