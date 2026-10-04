# language: pt
Funcionalidade: Transferência entre contas

  Cenário: Transferir com sucesso
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando Lucas transfere "R$ 1.000,00" de "Itaú Lucas" para "Nubank Conjunta"
    Então "Itaú Lucas" fica com "R$ 2.000,00" e "Nubank Conjunta" com "R$ 1.500,00"
    E o saldo consolidado da família permanece "R$ 3.500,00"

  Cenário: Transferência aparece vinculada no extrato
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00" e uma transferência de "R$ 1.000,00" entre elas
    Quando abro o extrato após a transferência
    Então vejo uma linha de saída em "Itaú Lucas" e uma de entrada em "Nubank Conjunta"
    E ambas indicam que fazem parte da mesma transferência

  Cenário: Não é despesa nem receita
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00" e uma transferência de "R$ 1.000,00" entre elas
    Quando consulto os totais de despesas e receitas do mês
    Então a transferência não é contabilizada em nenhum deles
    E não aparece no cálculo do acerto de contas

  Cenário: Origem igual ao destino
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando escolho a mesma conta nos dois campos
    Então vejo "Escolha contas diferentes" e nada é registrado

  Cenário: Valor inválido
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando informo "R$ 0,00" como valor da transferência
    Então vejo "Informe um valor maior que zero"

  Cenário: Origem sem saldo suficiente
    Dado "Itaú Lucas" com "R$ 200,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando transfiro "R$ 500,00" para "Nubank Conjunta"
    Então vejo o aviso "A conta de origem ficará negativa" e posso confirmar
    E após confirmar, "Itaú Lucas" fica com "-R$ 300,00"

  @integration
  Cenário: Atomicidade
    Dado que ocorre uma falha ao registrar a perna de crédito
    Quando a transferência é processada
    Então nenhuma das duas pernas é registrada e os saldos permanecem iguais

  Cenário: Duplo clique não duplica
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando preencho a transferência e toco duas vezes em "Confirmar transferência"
    Então apenas uma transferência é registrada

  Cenário: Menos de duas contas
    Dado uma família com apenas uma conta
    Quando tento iniciar uma transferência
    Então sou orientado a cadastrar outra conta
