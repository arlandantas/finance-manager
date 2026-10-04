# language: pt
Funcionalidade: Contas bancárias

  Cenário: Cadastrar conta com sucesso
    Dado que Mariana está na tela "Contas"
    Quando cadastra nome "Itaú Mariana", instituição "Itaú", tipo "Conta corrente", titular "Mariana" e saldo inicial "R$ 1.500,00"
    Então a conta aparece na lista com saldo "R$ 1.500,00"
    E o saldo consolidado da família soma essa conta

  Cenário: Titular padrão
    Dado que Lucas abre o formulário de nova conta
    Então o campo "Titular" vem preenchido com "Lucas"

  Cenário: Saldo inicial negativo
    Dado que a conta está no cheque especial
    Quando cadastro saldo inicial "-R$ 300,00"
    Então a conta aparece com saldo "-R$ 300,00" destacado em vermelho

  Cenário: Campos obrigatórios
    Dado o formulário de nova conta
    Quando tento salvar sem nome ou sem tipo
    Então vejo mensagens de erro nos campos inválidos
    E nenhuma conta é criada

  Cenário: Nome duplicado na família
    Dado que já existe a conta "Itaú Mariana"
    Quando tento cadastrar outra com o mesmo nome
    Então vejo "Já existe uma conta com este nome"

  Cenário: Conta visível para os dois membros
    Dado que Mariana cadastrou a conta "Nubank Conjunta"
    Quando Lucas abre a tela "Contas"
    Então ele vê "Nubank Conjunta" com o mesmo saldo

  Cenário: Isolamento entre famílias
    Dado uma conta da "Família Silva"
    Quando um usuário da "Família Souza" lista contas
    Então a conta da "Família Silva" não aparece

  Cenário: Renomear conta
    Dado a conta "Itaú Mariana"
    Quando altero o nome para "Itaú Principal"
    Então a lista exibe "Itaú Principal" e o saldo permanece o mesmo
