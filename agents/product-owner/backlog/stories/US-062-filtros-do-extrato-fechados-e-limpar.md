# US-062 — Filtros do Extrato fechados por padrão e "Limpar filtros"

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Extrato · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 2 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | extrato com filtros (R1/R2) |
| Rastreabilidade | feedback-usuario-v0 U10 · escopo-v0-alpha decisão (b) · NEED-015 |

## História
Como **membro da família**, quero **os filtros recolhidos e um botão para limpá-los**, para **ler o extrato direto e voltar ao estado inicial em um toque**.

## Regras
- Painel de filtros **fechado ao abrir** o Extrato; botão "Filtros" com a contagem **"N filtros ativos"** quando N > 0.
- **"Limpar filtros"** restaura todos os filtros ao padrão (mantém o mês); visível só com filtro ativo.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Filtros do Extrato

  Cenário: Fechados por padrão
    Quando Mariana abre o Extrato
    Então o painel de filtros está fechado

  Cenário: Indicador de filtros ativos
    Dado os filtros "Conta: Corrente" e "Categoria: Mercado"
    Quando Mariana abre o Extrato
    Então o botão mostra "Filtros (2)"

  Cenário: Limpar filtros
    Dado 2 filtros ativos
    Quando Mariana toca em "Limpar filtros"
    Então todos os filtros voltam ao padrão
    E o botão "Limpar filtros" some

  Cenário: Sem filtros não há botão limpar
    Dado nenhum filtro ativo
    Quando Mariana abre o Extrato
    Então "Limpar filtros" não aparece
```

## Fora de escopo
Filtros salvos, filtro por tag (US-047).
