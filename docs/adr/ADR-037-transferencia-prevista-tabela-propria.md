# ADR-037 — Transferência prevista em tabela própria (`planned_transfers`) e série própria

**Status:** aceito (diverge do esboço "kind = TRANSFER" das US-100/101) · **Data:** 2026-11-07 · **Autor:** arquiteto

## Contexto
US-100/101 pedem prever transferências entre contas (pontuais e mensais) que só afetam o saldo previsto por conta. O ADR-023 estendeu `planned_expenses` por `kind`, mas transferência não tem categoria, responsável nem pagador (`categoryId`/`responsibleMemberId` são `NOT NULL`), tem duas contas e a baixa gera um `TransferGroup` (duas pernas), não uma `Transaction`. Um `kind = TRANSFER` ali exigiria afrouxar CHECKs e filtrar dezenas de leituras de "A pagar", Resumo, acerto, exportação e MCP.

## Decisão
1. **Tabela `planned_transfers`:** `fromAccountId`, `toAccountId` (CHECK diferentes; FKs compostas por família), `amountInCents > 0`, `dueOn`, `description?` (2..100), `status` `PREVISTA | EFETIVADA`, `transferGroupId` (único; CHECK `EFETIVADA <=> transferGroupId não nulo`), `version`, exclusão lógica, `authorMemberId`, `updatedByMemberId`. Sem "Só meu": qualquer membro ativo cadastra, edita, exclui e efetiva.
2. **Efetivar** = `createTransferGroup(kind=TRANSFER)` (valor e data efetivos, data <= hoje) + `UPDATE ... WHERE version AND status='PREVISTA'` na mesma transação. Ordem de travas: linha da prevista `FOR UPDATE`, depois contas (`lockAccountsForPosting`). **Desfazer** a transferência (`undoTransferGroup`) devolve a prevista a `PREVISTA` (`transferGroupId = NULL`, `version + 1`) na mesma transação.
3. **Leituras:** nenhuma consulta existente lê a tabela. Só o resumo por conta (US-060) soma `plannedTransfersInCents` (saída negativa, entrada positiva) pelo campo `extras` já previsto em `buildByAccount`; o total do "A pagar" e o saldo previsto do Resumo **não mudam** (transferência interna soma zero).
4. **Arquivar conta** com transferência prevista pendente ou série ativa é bloqueado (`ACCOUNT_HAS_PLANNED_TRANSFERS`, mesma `accountArchiveBlockers`). Efetivar com conta arquivada = 422 `ACCOUNT_ARCHIVED_LOCKED` (defesa).
5. **Série (US-101):** tabela `recurring_transfers` (mesmos campos de data de `recurring_expenses`: `dayOfMonth`, `startMonth`, `endMonth`, `generatedThroughMonth`, `endedAt`) e, em `planned_transfers`, `seriesId`, `occurrenceMonth`, `isException` com chave única `(familyId, seriesId, occurrenceMonth)` sem filtro de exclusão. Geração dentro de `ensureRecurrenceHorizon` (mesma trava e horizonte de 12 meses, ADR-025).

## Consequências
- Reconciliação trivial: nenhum total de Início, Resumo, A pagar ou acerto pode mudar por construção (teste exigido).
- Duplica a máquina pequena de prevista (estado, `version`, exclusão); a pura de datas é compartilhada.
- Descartados: `kind = TRANSFER` em `planned_expenses`; transferência no ledger com status.
