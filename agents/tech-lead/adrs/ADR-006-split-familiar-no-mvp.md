# ADR-006: Split / Acerto de Contas Familiar entra no MVP

## Status
Aceito (decisão do Gestor)

## Contexto
`product-owner/backlog/mvp-definition.md` já incluía a divisão de despesas e o acerto de contas no MVP, enquanto `stakeholder/cronograma-e-releases.md` posicionava o NEED-007 no AP2. O Gestor resolveu: **o split vem para o MVP**.

## Decisão
- NEED-007 (acerto de contas, RN-007.1..3) passa a fazer parte do MVP/AP0.
- **Impacto no modelo de dados desde o AP0:**
  - `Transaction.isSharedExpense` (despesa comum vs pessoal) e regra de divisão por família/transação (`splitRule`: igualitária ou proporcional, em basis points inteiros).
  - `payerMemberId` efetivo (quem desembolsou) para o balanço (RN-007.1).
  - Acerto registrado como **transferência interna** entre contas dos membros (RN-007.3).
- **Cálculo:** funções puras em `src/modules/split`, em centavos, com o algoritmo do maior resto para evitar perda de centavo em divisões ímpares.
- **Fora do MVP (continuam nos releases seguintes):** desdobramento de uma compra em subitens (NEED-008), caixinhas (NEED-009), conciliação (NEED-010), liquidez (NEED-011).

## Ações para outros agentes (rastreabilidade)
- **Stakeholder/PO:** atualizar `cronograma-e-releases.md` e o backlog para refletir NEED-007 no AP0.
- **Tech Lead:** criar `SDD-002` do split antes da implementação.
- **Gestor:** reavaliar estimativa do AP0.
