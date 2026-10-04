# US-009b — Acerto de contas com três membros e detalhe das despesas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-4 Divisão & Acerto de Contas · R1 |
| MoSCoW · WSJF · Tamanho | Should · 3,0 · 3 |
| Status | Especificada (SDD-002) · fatia **9b** da US-009 · **cortável** sem quebrar a R1 |
| Depende de | [US-009a](US-009-painel-de-acerto-de-contas.md) |
| Rastreabilidade | NEED-007 · RN-007.1, RN-007.2 · ADR-006 · FLUXO-003 |

## História
Como **membro de uma família com mais de duas pessoas**, quero **ver as sugestões de acerto para todos** e **conferir as despesas que compõem o cálculo**, para **confiar no resultado e acertar sem discussão**.

## Regras de negócio aplicáveis
Idênticas às da [US-009a](US-009-painel-de-acerto-de-contas.md). O cálculo já é feito pelo motor da 9a (inclusive N > 2); a 9b entrega a **apresentação** de 3+ membros e a **auditabilidade** do total.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Acerto de contas com três membros e detalhe

  Cenário: Três membros
    Dado três membros e regra igualitária com total comum de "R$ 900,00" pago só por Mariana
    Quando abro o painel
    Então a cota de cada um é "R$ 300,00"
    E as sugestões são duas transferências de "R$ 300,00" para Mariana

  Cenário: Ver as despesas que compõem o cálculo
    Quando expando "Ver despesas comuns do período"
    Então vejo a lista com quem pagou e valor, cuja soma é o total comum
```

## Experiência
[FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md): um cartão por membro (rolagem horizontal no mobile se necessário), lista de sugestões e seção expansível "Ver despesas comuns do período".

## Fora de escopo
O mesmo da US-009a. Sem a 9b, o painel da 9a continua correto para qualquer N (apenas sem a lista expansível).

## Nota de corte
Se o prazo apertar, esta história é cortada **antes** da US-013 (ordem de corte: 13b, 9b, 13a). A R1 mantém a promessa para o casal.
