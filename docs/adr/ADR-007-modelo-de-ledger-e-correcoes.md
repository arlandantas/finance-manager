# ADR-007 — Modelo de ledger, correções e transferências

**Status:** aceito (emenda o ADR-001 quanto à imutabilidade) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
Saldo inicial, despesa/receita, transferência atômica, acerto e editar/excluir/restaurar com auditoria exigem um modelo único de movimentação sobre um ledger.

## Decisão
1. Tabela única `Transaction` (uma linha = um efeito em **uma** conta). `kind` ∈ `EXPENSE | INCOME | OPENING | TRANSFER_OUT | TRANSFER_IN`; `direction` ∈ `CREDIT | DEBIT` derivado do `kind` (em `OPENING` pelo sinal). `amountInCents` é sempre a magnitude (> 0; `OPENING` pode ser 0).
2. **Saldo derivado, nunca armazenado:** `Σ CREDIT − Σ DEBIT` das linhas com `deletedAt IS NULL`.
3. **Correções sem estorno contábil:** a linha é o estado corrente; toda mudança incrementa `version` e grava linha append-only em `TransactionRevision` (ação, autor, data, diff). Exclusão/desfazer são lógicas (`deletedAt`, `deletionReason` = `DELETED | UNDONE`; só `DELETED` é reversível). Trigger proíbe `UPDATE/DELETE` em `TransactionRevision`; hard delete de `Transaction` é proibido. Estornos (`AJUSTE_CONCILIACAO`) ficam para a conciliação.
4. **Transferência** = `TransferGroup` + 2 linhas na mesma transação; índice único parcial `(transferGroupId, kind)`. Acerto é `TransferGroup` com `kind = SETTLEMENT` (`settlementPeriod`, devedor, credor).
5. **Abertura:** `OPENING` criada com a conta, não editável, fora do extrato e dos totais, dentro do saldo.
6. **Totais de receita/despesa** consideram só `kind ∈ (EXPENSE, INCOME)` e `deletedAt IS NULL`, em **uma única função** (`ledgerTotals`) reutilizada por extrato, Home e acerto, com teste de regressão.
7. Campos: `isSharedExpense`, `payerMemberId`, `authorMemberId` (imutável), `updatedByMemberId`.

## Consequências
- Consultas são `SUM/SELECT` com índices por `familyId`; `CHECK`s e índices parciais em SQL cru nas migrações.
- Descartados: estorno+novo a cada edição, tabelas por tipo, saldo materializado.
