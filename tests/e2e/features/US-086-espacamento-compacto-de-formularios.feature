# language: pt
Funcionalidade: Espaçamento compacto nos formulários

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada
    E a tela tem 375 por 667 pixels

  Cenário: Nova despesa com o Salvar sempre visível
    Quando Mariana abre o formulário-gaveta "Nova despesa"
    Então o botão "Salvar despesa" está visível sem rolar
    E as categorias ocupam 4 colunas de pelo menos 44 pixels de altura

  Cenário: Nova conta com espaço uniforme
    Quando Mariana abre o formulário-gaveta "Nova conta"
    Então o espaço entre os campos é o token padrão de 8 pixels
    E o espaço é o mesmo do formulário de lançamento

  Cenário: Alvos de toque preservados
    Quando Mariana abre o formulário-gaveta "Nova despesa"
    Então cada campo e botão visível tem pelo menos 44 pixels de altura

  Cenário: Erro de validação não desloca os campos acima
    Quando Mariana abre o formulário-gaveta "Nova despesa"
    E Mariana anota a posição do campo "Valor"
    E Mariana tenta salvar a despesa vazia
    Então a mensagem de valor aparece logo abaixo do campo
    E o campo "Valor" não mudou de posição

  Cenário: Campo com foco continua alcançável
    Quando Mariana abre o formulário-gaveta "Nova despesa"
    E Mariana toca no campo "Descrição"
    Então o campo "Descrição" fica dentro da tela
    E o botão "Salvar despesa" está visível sem rolar
