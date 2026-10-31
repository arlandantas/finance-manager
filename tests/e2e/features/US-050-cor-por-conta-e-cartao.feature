# language: pt
Funcionalidade: Cor por conta e cartão

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" e "Nubank Conjunta" e o cartão "Nubank Lucas" para cores
    E Mariana está autenticada para cores

  Cenário: Conta nova recebe uma cor ainda não usada
    Dado que as contas e o cartão existentes usam "Azul", "Verde" e "Roxo"
    Quando Mariana cadastra a conta "Poupança" sem escolher a cor
    Então a conta "Poupança" recebe uma cor diferente de "Azul", "Verde" e "Roxo"

  Cenário: Editar a cor de uma conta
    Quando Mariana edita a conta "Itaú Mariana" e escolhe a cor "Laranja"
    Então a conta "Itaú Mariana" aparece com a cor "Laranja"

  Cenário: Duas contas podem repetir a cor
    Dado que a conta "Itaú Mariana" já é "Laranja"
    Quando Mariana edita a conta "Nubank Conjunta" e escolhe a cor "Laranja"
    Então a alteração é salva sem erro e as duas contas mostram "Laranja"

  Cenário: Cor aparece nos lançamentos junto do nome
    Dado uma despesa na conta "Itaú Mariana" de cor "Laranja"
    Quando Mariana abre o Extrato para cores
    Então a despesa mostra um marcador "Laranja" ao lado de "Itaú Mariana"

  Cenário: Cor nos seletores de pagamento
    Dado que a conta "Itaú Mariana" já é "Laranja"
    Quando Mariana abre o formulário "Nova despesa" para cores
    E escolhe "Itaú Mariana" em "Pagar com"
    Então o seletor "Pagar com" mostra o marcador "Laranja" e o nome "Itaú Mariana"

  Cenário: Nome continua visível sem depender da cor
    Dado uma despesa na conta "Itaú Mariana" de cor "Laranja"
    Quando Mariana abre o Extrato para cores em escala de cinza
    Então todas as origens continuam identificáveis pelo nome

  Cenário: Cartão também tem cor
    Dado uma compra de cartão no "Nubank Lucas"
    Quando Mariana edita o cartão "Nubank Lucas" e escolhe a cor "Roxo"
    Então as compras do cartão mostram o marcador "Roxo"

  Cenário: Cores legíveis nos dois temas
    Quando Mariana alterna entre os temas "Claro" e "Escuro" no seletor de cor
    Então cada cor da paleta mantém contraste mínimo contra o fundo

  Cenário: Contas antigas recebem cor automática
    Dado contas criadas antes desta entrega
    Quando Mariana abre a tela "Contas" para cores
    Então cada conta aparece com uma cor

  Cenário: Seletor de cor acessível
    Quando Mariana abre o seletor de cor da conta "Itaú Mariana"
    Então cada opção tem um nome falado por leitor de tela e a escolhida mostra "Cor:"
