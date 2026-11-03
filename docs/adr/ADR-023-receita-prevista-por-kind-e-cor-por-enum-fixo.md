# ADR-023 — Receita prevista como `kind` da previsão e cor como enum fechado

**Status:** aceito (generaliza ADR-015 §7) · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
Receita prevista tem a mesma máquina de estados da despesa prevista; uma entidade nova duplicaria serviço, rotas e testes. Cor de conta/cartão precisa de contraste verificável nos dois temas e atribuição automática.

## Decisão
1. **`kind` em `planned_expenses`:** `enum PlannedKind { EXPENSE INCOME } DEFAULT EXPENSE` + `CHECK (kind = 'EXPENSE' OR isSharedExpense = false)` (e `splitMode = 'NONE'`). A baixa ramifica só no gerador da `Transaction` (`createExpenseCore` × `createIncomeCore`). Consultas de "A pagar" filtram `kind = 'EXPENSE'` no repo; `GET /planned-expenses` mantém padrão `EXPENSE`. Receita entra por `listReceivables`/`GET /receivables` e "A receber" do Resumo. O `kind` é **imutável**.
2. Receita prevista pendente vive **fora do ledger**; a baixa cria `Transaction INCOME` pelo valor efetivo na data do recebimento.
3. **Cor:** `enum AccountColor` de 10 valores em `bank_accounts` e `credit_cards`, `NOT NULL`. Enum fechado para que contraste (≥ 3:1 nos dois temas) seja testável sobre tokens CSS (`data-color`, sem estilo inline). `pickNextColor` (1ª livre; senão a menos usada) no servidor, sem trava (repetir é permitido). Migração determinística: `row_number()` por família sobre contas e cartões por `(createdAt, id)`, em ciclo.

## Consequências
- Descartados: `PlannedIncome` separada, receita no ledger com status, cor hex livre, atribuir cor na primeira leitura.
- Aba "Pagas e recebidas" lê `kind=ALL`; "Recebida" é rótulo de UI (`status` continua `PAGO`). Renomear a tabela fica para o AP1.
