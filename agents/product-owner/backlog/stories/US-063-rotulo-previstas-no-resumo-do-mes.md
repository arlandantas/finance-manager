# US-063 — Resumo do Mês: rótulo "Previstas" e hierarquia de Despesas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** (ajuste do Gestor: junto à Início enxuta) · 2 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | US-025, US-055 |
| Rastreabilidade | feedback-usuario-v0 U11 · escopo-v0-alpha decisão (g) · NEED-015 |

## História
Como **membro da família**, quero **ver "Previstas" no Resumo do Mês, com Despesas = Previstas + Não previstas**, para **entender o número do fechamento**.

## Regras
- "A pagar" é renomeado para **"Previstas"**; **Previstas = Faturas + A pagar em aberto + pagas**; **Não previstas** = demais despesas do mês; **Despesas = Previstas + Não previstas**.
- **Só rótulo/composição**: nenhum cálculo do motor muda; "A pagar em aberto" **reconcilia com a tela A pagar** (US-055).

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Previstas no Resumo do Mês

  Cenário: Hierarquia das despesas
    Dado previstas de "R$ 1.129,00" e outras despesas de "R$ 400,00" no mês
    Quando Mariana abre o Resumo do Mês
    Então vê "Despesas R$ 1.529,00" igual a "Previstas R$ 1.129,00" mais "Não previstas R$ 400,00"

  Cenário: Composição de Previstas
    Quando Mariana abre o Resumo do Mês
    Então "Previstas" detalha "Faturas", "A pagar em aberto" e "Pagas"

  Cenário: Reconcilia com A pagar
    Quando Mariana abre o Resumo do Mês
    Então "A pagar em aberto" é igual ao total da tela A pagar
```
