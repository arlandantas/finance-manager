# ADR-007: Modelo de ledger, correções e transferências

## Status
Aceito (Tech Lead, 2026-10-04). **Emenda o ADR-001** no ponto "movimentações imutáveis; correções por estorno" (ver Decisão 3).

## Contexto
US-004 (saldo inicial), US-005/006 (despesa/receita), US-010 (transferência atômica com par vinculado), US-011 (acerto como transferência) e US-013 (editar, excluir, restaurar, desfazer com trilha de auditoria) exigem um modelo único de movimentação. O PO deixou em aberto como mapear "editar" sobre um ledger imutável (estorno + novo vs. versionamento com histórico) e definiu apenas o **comportamento observável** como contrato.

## Decisão
1. **Uma única tabela de movimentações `Transaction`** (uma linha = um efeito em **uma** conta). `kind` ∈ `EXPENSE | INCOME | OPENING | TRANSFER_OUT | TRANSFER_IN`; `direction` ∈ `CREDIT | DEBIT` (derivado do `kind`, exceto `OPENING`, que é `CREDIT` ou `DEBIT` conforme o sinal do saldo inicial). `amountInCents` é sempre a **magnitude** (> 0; `OPENING` pode ser 0).
2. **Saldo é derivado, nunca armazenado:** `saldo(conta) = Σ CREDIT − Σ DEBIT` das linhas com `deletedAt IS NULL`. Sem coluna de saldo, não há *lost update*.
3. **Correções sem estorno contábil no R1:** a linha de `Transaction` é o **estado corrente**; toda mudança incrementa `version` e grava uma linha **append-only** em `TransactionRevision` (ação, autor, data, diff campo a campo). Exclusão e "desfazer transferência" são **lógicas** (`deletedAt`, `deletedByMemberId`, `deletionReason` = `DELETED | UNDONE`) e reversíveis só para `DELETED`. A imutabilidade é garantida no nível da **auditoria** (trigger no banco proíbe `UPDATE`/`DELETE` em `TransactionRevision`), e *hard delete* de `Transaction` é proibido (sem rota e com `REVOKE`/trigger). Estornos contábeis explícitos (`AJUSTE_CONCILIACAO`) entram no AP2 (NEED-010) sem migração destrutiva.
4. **Transferência = `TransferGroup` + 2 linhas** (`TRANSFER_OUT` na origem, `TRANSFER_IN` no destino) criadas **na mesma transação de banco**; índice único parcial `(transferGroupId, kind)` garante exatamente uma perna de cada tipo. Acerto de contas (US-011) é um `TransferGroup` com `kind = SETTLEMENT`, `settlementPeriod`, `settlementFromMemberId` (devedor) e `settlementToMemberId` (credor).
5. **Lançamento de abertura (US-004):** `Transaction(kind = OPENING)` criada na mesma transação da conta, na data informada; não editável em nenhuma rota no R1; **excluída** do extrato e de todos os totais de receita/despesa, **incluída** no saldo.
6. **Totais de receita/despesa** consideram **somente** `kind ∈ (EXPENSE, INCOME)` e `deletedAt IS NULL`. Esta regra vive em **uma única função de consulta** (`ledgerTotals`) reutilizada por extrato, Home e acerto (SDD-005), com teste de regressão que injeta transferências, acertos e aberturas.
7. **Renomeações de campos (resolvem GAP-2 do PO):** `isSharedExpense` (ADR-006), `payerMemberId` (quem pagou/recebeu; único campo no MVP por D-PO-01), `authorMemberId` (autor, imutável), `updatedByMemberId`.

## Alternativas descartadas
- **Estorno + novo lançamento para cada edição:** dobra as linhas, polui o extrato e complica o acerto; ganho de imutabilidade absoluta não compensa no R1.
- **Tabelas separadas por tipo (`Expense`, `Income`, `Transfer`):** triplica consultas de saldo/extrato.
- **Saldo materializado:** risco de divergência; medir antes (ADR-001).

## Consequências
- Consultas de saldo/extrato são `SUM`/`SELECT` sobre uma tabela com índices por `familyId`.
- `CHECK`s e índices parciais em SQL cru nas migrações (ver `architecture/modelo-de-dados.md`).
- A trilha de auditoria responde ao PO (US-013) sem estornos visíveis.
