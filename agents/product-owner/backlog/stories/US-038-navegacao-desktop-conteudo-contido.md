# US-038 — Navegação no desktop com conteúdo contido

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Could · 2,0 · 2 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | nenhuma |
| Corte | **Cortável (segundo na ordem, depois do tema)** |
| Rastreabilidade | Parecer item 4, Q-F06 · NEED-022 (RN-022.2) · FLUXO-013 · D-PO-23 |

## História
Como **membro da família no desktop**, quero **menu e conteúdo agrupados numa largura confortável**, para **não ter botões espalhados por uma tela larga**.

## Regras de negócio aplicáveis
- **Alternativa adotada (Q-F06, "Opção B")**: **menu superior mantido**, com **menu e conteúdo de largura contida e centralizada** (máx. 960 px de conteúdo; menu alinhado ao mesmo container) a partir de **1024 px**. **Barra inferior só no mobile** (< 1024 px).
- **Alternativa não adotada ("Opção A")**: barra inferior também no desktop com largura contida e centralizada. Registrada no FLUXO-013 para o usuário escolher caso, com o uso, o menu superior incomode; **trocar não exige nova regra**.
- O **botão "+" (lançamento rápido)** continua sempre visível e alcançável nas duas larguras (RN-022.2); no desktop fica ancorado ao canto do **container**, não da janela.
- Nenhuma rota, atalho ou texto muda; só o layout.
- Foco/teclado: ordem natural; menu navegável por Tab.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Navegação no desktop

  Contexto:
    Dado Lucas está autenticado na Home

  Cenário: Desktop mostra menu superior e conteúdo centralizado
    Dado um viewport de 1440 px de largura
    Quando Lucas abre a Home
    Então o menu está no topo
    E o conteúdo tem largura máxima de 960 px e está centralizado
    E o menu está alinhado à mesma largura do conteúdo

  Cenário: Mobile mantém a barra inferior
    Dado um viewport de 375 px de largura
    Quando Lucas abre a Home
    Então a navegação está na barra inferior
    E não vê o menu superior

  Cenário: Tablet estreito usa a barra inferior
    Dado um viewport de 800 px de largura
    Quando Lucas abre a Home
    Então a navegação está na barra inferior

  Cenário: Botão de lançamento rápido continua disponível
    Dado um viewport de 1440 px de largura
    Quando Lucas abre a Home
    Então o botão "+" está visível
    E fica dentro da área do conteúdo centralizado

  Cenário: Nenhuma tela quebra com o conteúdo contido
    Dado um viewport de 1440 px de largura
    Quando Lucas visita Home, Extrato, Acerto, Cartões, Contas a pagar e Contas
    Então nenhuma dessas telas tem rolagem horizontal
    E nenhum botão fica fora da área de conteúdo

  Cenário: Tabelas e listas largas continuam legíveis
    Dado um viewport de 1440 px de largura e um Extrato com 40 lançamentos
    Quando Lucas abre o Extrato
    Então as colunas descrição e valor são legíveis sem cortes
```

## Experiência (UX/estados)
[FLUXO-013](../../flows/FLUXO-013-preferencias-navegacao-e-detalhe.md): wireframes das opções A e B; a adotada é a B.

## Fora de escopo
Menu lateral; atalhos de teclado; personalizar a ordem do menu; barra inferior no desktop (Opção A).

## Perguntas em aberto / pontos para o Tech Lead
- Um único container de layout (`max-w`) na raiz; confirmar que o drawer de lançamento no desktop não depende da largura da janela.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 4, Q-F06).
