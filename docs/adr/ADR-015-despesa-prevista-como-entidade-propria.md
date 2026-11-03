# ADR-015 — Despesa prevista como entidade própria (não é `Transaction`)

**Status:** aceito (D-PO-11) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
Despesa prevista nasce `PREVISTO` e vira `PAGO` na baixa, com conta, data e valor efetivo possivelmente diferentes; enquanto `PREVISTO` não pode afetar saldo, extrato, totais nem acerto. Recorrência projeta uma previsão por mês, independentes entre si.

## Decisão
1. Tabela `PlannedExpense` separada do ledger: `description`, `amountInCents` (previsto, imutável após a baixa), `dueOn`, `categoryId`, `responsibleMemberId`, `isSharedExpense`, `status` (`PREVISTO | PAGO`), `version`, exclusão lógica e `paidTransactionId` (FK composta única).
2. **A baixa cria uma `Transaction(kind = EXPENSE)` comum** pelo mesmo serviço `createExpense`, na mesma transação, gravando `paidTransactionId` + `status = PAGO`. Valor efetivo e data do pagamento vêm da baixa; a `Transaction` é a fonte única do valor pago.
3. **`PREVISTO` nunca está no ledger** (nenhuma consulta filtra status). `CHECK ((status = 'PAGO') = ("paidTransactionId" IS NOT NULL))`.
4. **Desfazer pagamento** = exclusão lógica da `Transaction` (`UNDONE`, revisão `UNDO`), `paidTransactionId = NULL`, `status = PREVISTO`, `version + 1`, na mesma transação.
5. Excluir/restaurar a `Transaction` de uma previsão `PAGO` ⇒ `422 LINKED_TO_PLANNED`; editar é permitido (a previsão exibe os valores atuais).
6. **"Atrasada"** = `PREVISTO AND dueOn < hoje` (derivado, fuso da família); período via `periodOf(dueOn, cutDay)`.
7. Recorrência gera linhas `PlannedExpense` independentes (ADR-025).

## Consequências
- "A pagar" consulta `planned_expenses` + faturas fechadas não pagas (ADR-014) por agregador próprio (`listPayables`).
- Baixa concorrente resolvida por `UPDATE … WHERE version = :v AND status = 'PREVISTO'`. Descartados: `Transaction` com status `PREVISTO` e baixa sem gerar `Transaction`.
- Receita prevista segue o mesmo modelo por `kind` (ADR-023).
