# language: pt
Funcionalidade: Cadastro de cartão de crédito

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada

  Cenário: Cadastrar cartão com sucesso
    Quando Mariana cadastra o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    Então o cartão aparece na lista com limite "R$ 5.000,00" e disponível "R$ 5.000,00"
    E mostra "Fecha dia 25 · vence dia 5 do mês seguinte"

  Cenário: Titular padrão
    Quando Mariana cadastra um cartão sem escolher o titular
    Então o titular do cartão é "Mariana"

  Cenário: Vencimento no mesmo mês do fechamento
    Quando Mariana cadastra o cartão "Itaú Visa" com fechamento dia 10 e vencimento dia 20
    Então a lista mostra "Fecha dia 10 · vence dia 20 do mesmo mês"

  Cenário: Vencimento no mesmo dia do fechamento
    Quando Mariana cadastra o cartão "Inter" com fechamento dia 28 e vencimento dia 28
    Então a lista mostra "Fecha dia 28 · vence dia 28 do mês seguinte"

  Cenário: Cartão não altera o saldo da família
    Dado as contas "Itaú Mariana" com "R$ 6.500,00" e "Nubank Conjunta" com "R$ 849,50"
    Quando Mariana cadastra o cartão "Nubank Mariana" com limite "R$ 5.000,00"
    Então o saldo da família continua "R$ 7.349,50"

  Cenário: Campos obrigatórios
    Quando Mariana tenta salvar um cartão sem nome, sem limite e sem dias
    Então vê "Informe o nome do cartão"
    E vê "Informe um limite maior que zero"
    E vê "Escolha o dia de fechamento (1 a 28)"
    E vê "Escolha o dia de vencimento (1 a 28)"
    E nada é criado

  Cenário: Dia fora do intervalo
    Quando Mariana informa o dia de fechamento 31
    Então vê "Escolha o dia de fechamento (1 a 28)"

  Cenário: Limite inválido
    Quando Mariana informa o limite "R$ 0,00"
    Então vê "Informe um limite maior que zero"

  Cenário: Nome duplicado na família
    Dado o cartão "Nubank Mariana"
    Quando Mariana tenta cadastrar o cartão "nubank mariana "
    Então vê "Já existe um cartão com este nome"

  Cenário: Cartão visível para todos os membros
    Dado o cartão "Nubank Mariana" cadastrado por Mariana
    Quando Lucas abre "Cartões"
    Então vê o cartão "Nubank Mariana" com o mesmo limite

  Cenário: Editar nome e limite
    Dado o cartão "Nubank Mariana" com limite "R$ 5.000,00"
    Quando Mariana altera o nome para "Nubank Roxinho" e o limite para "R$ 6.000,00"
    Então o cartão aparece como "Nubank Roxinho" com limite "R$ 6.000,00"

  Cenário: Dias do ciclo editáveis antes da primeira compra
    Dado o cartão "Nubank Mariana" sem compras
    Quando Mariana altera o fechamento para o dia 20
    Então o cartão passa a mostrar "Fecha dia 20"

  Cenário: Conflito de edição
    Dado que Mariana e Lucas abriram a edição do cartão "Nubank Mariana"
    Quando Mariana salva um novo limite
    E Lucas tenta salvar outro limite
    Então Lucas vê "Este cartão foi alterado por Mariana. Recarregue para continuar."

  Cenário: Nenhum cartão cadastrado
    Dado que a família não tem cartões
    Quando Mariana abre "Cartões"
    Então vê "Cadastre seu primeiro cartão" com o botão "Novo cartão"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Mariana abre "Cartões"
    Então não vê o cartão "Visa Souza"
