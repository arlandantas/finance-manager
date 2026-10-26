# US-073 — Histórico das análises e apagar o que foi enviado

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 · **R4-C (proposta)** · fatia 4/4 da análise |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Could · 1,3 · 2 |
| Status | Implementada (TASK-062, aguardando validação do Gestor) |
| Depende de | US-070, EN-005 |
| Corte | Cortável; **mas** a transparência mínima (mostrar "o que será enviado") já está na US-070 |
| Rastreabilidade | **NEED-027** (RN-027.8) · NEED-023 (RN-023.5) · RF45 · RN16 · D-PO-64 |

## História
Como **membro da família**, quero **rever as análises anteriores, ver o que foi enviado em cada uma e apagar o histórico**, para **ter transparência e controle sobre a privacidade**.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Histórico de análises

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E duas análises salvas: "out/2026" e "set/2026"
    E Lucas está autenticado

  Cenário: Lista de análises anteriores
    Quando Lucas abre "Análise" e "Histórico"
    Então vê as análises "out/2026" e "set/2026" com data de geração

  Cenário: Ver o que foi enviado
    Quando Lucas abre a análise de "out/2026" e toca em "O que foi enviado"
    Então vê os totais por categoria e os valores recorrentes enviados
    E não vê nomes de pessoas nem dados de conta

  Cenário: Apagar uma análise
    Quando Lucas apaga a análise de "set/2026" e confirma
    Então a análise de "set/2026" some do histórico

  Cenário: Apagar todo o histórico
    Quando Lucas toca em "Apagar todo o histórico" e confirma
    Então o histórico fica vazio
    E as sugestões descartadas continuam salvas

  Cenário: Apagar não afeta lançamentos
    Dado que Lucas apagou todo o histórico
    Quando Lucas abre o Extrato
    Então todos os lançamentos continuam presentes
```

## Histórico
- 2026-10-24 — Criada (D-PO-64).
