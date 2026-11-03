# ADR-006 — Split / acerto de contas familiar entra no MVP

**Status:** aceito · **Data:** 2026-10 · **Autor:** gestor

## Contexto
O MVP do PO incluía divisão de despesas e acerto, mas o cronograma do Stakeholder o colocava no AP2. O Gestor decidiu: o split vem para o MVP.

## Decisão
- Acerto de contas (NEED-007) faz parte do MVP/AP0.
- Modelo desde o AP0: `Transaction.isSharedExpense` (comum vs pessoal), regra de divisão por família/transação (`splitRule`: igualitária ou proporcional, em basis points inteiros), `payerMemberId` (quem desembolsou) e acerto como **transferência interna** entre contas dos membros.
- Cálculo em funções puras (`src/modules/split`), em centavos, pelo maior resto.
- Fora do MVP: subitens de compra, caixinhas, conciliação, liquidez.

## Consequências
- A regra de divisão foi depois versionada (ADR-011) e o percentual gravado por lançamento (ADR-016).
