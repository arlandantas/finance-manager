# language: pt
Funcionalidade: Seleção despesa x receita inequívoca

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada

  Cenário: Tipo selecionado é claro de relance no lançamento
    Quando Mariana abre o lançamento "Nova despesa"
    Então "Despesa" aparece selecionado com ícone e texto
    E "Receita" aparece não selecionado

  Cenário: Trocar o tipo muda o título e o botão
    Dado que Mariana abre o lançamento "Nova despesa"
    Quando Mariana seleciona "Receita"
    Então o título é "Nova receita"
    E o botão de salvar é "Salvar receita"

  Cenário: O mesmo seletor na gestão de categorias
    Quando Mariana abre o lançamento "Nova categoria"
    Então o seletor "Despesa | Receita" tem o mesmo destaque do lançamento

  Cenário: Não depende só de cor
    Dado que o tema é escuro
    Quando Mariana abre o lançamento "Nova despesa"
    Então o tipo selecionado se distingue pelo ícone e pelo texto além da cor
    E o texto do tipo selecionado tem contraste AA

  Cenário: Navegação por teclado
    Dado que o foco está no seletor de tipo
    Quando Mariana pressiona a seta para a direita
    Então "Receita" fica selecionada
