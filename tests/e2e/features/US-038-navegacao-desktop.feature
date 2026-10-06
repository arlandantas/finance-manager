# language: pt
@valores-ocultos
Funcionalidade: Navegação no desktop

  Contexto:
    Dado Lucas está autenticado na Home do layout

  Cenário: Desktop mostra menu lateral e conteúdo contido (US-064)
    Dado um viewport do layout de 1440 px de largura
    Então o menu está à esquerda com o item ativo destacado e o conteúdo tem no máximo 960 px à direita dele

  Cenário: Mobile e tablet estreito usam a barra inferior
    Dado um viewport do layout de 375 px de largura
    Então a navegação está na barra inferior e não há menu lateral
    Dado um viewport do layout de 800 px de largura
    Então a navegação está na barra inferior e não há menu lateral

  Cenário: Botão de lançamento rápido dentro do container
    Dado um viewport do layout de 1440 px de largura
    Então o botão "+" está visível e dentro da área do conteúdo centralizado

  Cenário: Nenhuma tela quebra com o conteúdo contido
    Dado um viewport do layout de 1440 px de largura
    Então nenhuma das seis telas tem rolagem horizontal
