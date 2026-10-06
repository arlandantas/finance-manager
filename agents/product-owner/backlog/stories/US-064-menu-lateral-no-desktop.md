# US-064 — Menu lateral no desktop (ajuste da US-038)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Polimento · **v0 alpha (Should, 1º dos Should)** |
| MoSCoW · Tamanho (PO) | **Should** · 2 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | US-038 (conteúdo contido), US-056 (contraste) |
| Rastreabilidade | feedback-usuario-v0 U9 · escopo-v0-alpha decisão (h) · NEED-022 |

## História
Como **membro da família no desktop**, quero **navegar por um menu lateral**, para **ter a navegação sempre à vista e mais ergonômica**.

## Regras
- A partir de **1024 px**: menu lateral fixo à esquerda (mesmos destinos e ordem da barra atual, item ativo destacado); o conteúdo contido da US-038 fica à direita. Sem navegação no topo no desktop.
- Abaixo disso: **barra inferior atual** (mobile inalterado).

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Menu lateral no desktop

  Cenário: Desktop mostra menu lateral
    Dado uma janela de 1280 px
    Quando Mariana abre o app
    Então vê o menu lateral à esquerda com todos os destinos

  Cenário: Mobile mantém a barra inferior
    Dado uma janela de 375 px
    Quando Mariana abre o app
    Então vê a barra inferior e não vê o menu lateral

  Cenário: Item ativo destacado
    Dado uma janela de 1280 px
    Quando Mariana navega para "Extrato"
    Então "Extrato" fica destacado no menu
```

## Fora de escopo
Menu recolhível, atalhos de teclado. Se o custo for alto, vira pós-v0 sem perda de função.
