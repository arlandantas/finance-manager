# ADR-015: Despesa prevista como entidade própria (não é `Transaction`)

## Status
Aceito (Tech Lead, 2026-10-04). Implementa a **D-PO-11** (PO) para US-018/US-019.

## Contexto
NEED-004: despesa prevista nasce `PREVISTO` e vira `PAGO` na baixa, com conta, data e **valor efetivo** possivelmente diferente do previsto; enquanto `PREVISTO` não pode afetar saldo, extrato, totais nem acerto. A recorrência (AP1) projetará uma previsão por mês, independentes entre si (RN-004.4).

## Decisão
1. **Tabela `PlannedExpense`** separada do ledger: `description`, `amountInCents` (**previsto**, imutável após a baixa), `dueOn` (`DATE`), `categoryId`, `responsibleMemberId`, `isSharedExpense`, `note`, `status` (`PREVISTO | PAGO`), `version`, autor, exclusão lógica (`deletedAt`, `deletedByMemberId`) e **`paidTransactionId`** (FK composta para `Transaction`, único).
2. **A baixa cria uma `Transaction(kind = EXPENSE)` comum** (valor efetivo, data do pagamento, conta escolhida, categoria/descrição/`isSharedExpense` da previsão, `payerMemberId` = escolhido ou o responsável) pelo **mesmo serviço** `createExpense` da US-005, na mesma transação do banco, e grava `paidTransactionId` + `status = PAGO`. Saldo, extrato, totais e acerto passam a refletir a despesa **sem nenhum código novo**, pelo valor efetivo (**fonte única** do valor pago: a `Transaction`).
3. **`PREVISTO` nunca está no ledger**: nenhuma consulta de saldo/totais/acerto/extrato precisa filtrar "status" (risco de vazamento eliminado por construção). Invariante `CHECK ((status = 'PAGO') = ("paidTransactionId" IS NOT NULL))`.
4. **Desfazer pagamento** = exclusão lógica da `Transaction` com `deletionReason = UNDONE` (revisão `UNDO`), `paidTransactionId = NULL`, `status = PREVISTO`, `version + 1`, na mesma transação. A despesa desfeita permanece no histórico (auditoria).
5. **Guardas cruzadas com US-013**: excluir/restaurar a `Transaction` apontada por uma previsão `PAGO` ⇒ `422 LINKED_TO_PLANNED`; **editar** é permitido e a previsão exibe os valores atuais da `Transaction` (join por `paidTransactionId`).
6. **"Atrasada"** = `status = PREVISTO AND dueOn < hoje` (derivado, fuso da família). Período de listagem usa `periodOf(dueOn, cutDay)` (ADR-010).
7. **Recorrência (AP1)** acrescentará `RecurrenceRule` que **gera linhas `PlannedExpense` independentes** (editar uma não altera as outras, RN-004.4), sem mudar este modelo.

## Alternativas descartadas
- **`Transaction` com `status PREVISTO`**: obriga todo `SUM`/extrato/acerto a filtrar o status (um esquecimento corrompe saldo ou acerto) e mistura valor previsto com efetivo.
- **Baixa apenas altera a previsão para `PAGO` sem gerar `Transaction`**: duplicaria a lógica de saldo/totais/acerto.

## Consequências
- Bloco "A pagar" e a tela "Contas a pagar" consultam `planned_expenses` (e as faturas fechadas não pagas, ADR-014) por um agregador próprio (`listPayables`).
- Duas escritas na baixa (despesa + previsão), atômicas e protegidas por `version` e `Idempotency-Key`; concorrência de dupla baixa resolvida por `UPDATE … WHERE version = :v AND status = 'PREVISTO'`.
