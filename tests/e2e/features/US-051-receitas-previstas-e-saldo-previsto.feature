# language: pt
Funcionalidade: Receitas previstas e saldo previsto

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E os membros "Mariana" e "Lucas"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Cadastrar uma receita prevista sem mexer no saldo
    Quando Lucas cadastra a receita prevista "Salário" de "R$ 5.000,00" com data esperada 20/11/2026
    Então a aba "A receber" lista "Salário" com o total "R$ 5.000,00"
    E o saldo de "Itaú Lucas" passa a "R$ 3.000,00"

  Cenário: Saldo previsto soma o que falta receber
    Dado a receita prevista "Salário" de "R$ 5.000,00" com data esperada 20/11/2026 e responsável "Lucas"
    Quando Lucas abre a Home de novembro
    Então o Resumo do Mês mostra "A receber" com "R$ 5.000,00"
    E o Resumo do Mês mostra "Saldo atual, menos o que falta pagar, mais o que falta receber"

  Cenário: Receber com valor efetivo diferente
    Dado a receita prevista "Salário" de "R$ 5.000,00" com data esperada 10/11/2026 e responsável "Lucas"
    Quando Lucas recebe "Salário" por "R$ 5.100,00" na conta "Itaú Lucas"
    Então o saldo de "Itaú Lucas" passa a "R$ 8.100,00"

  Cenário: Receita atrasada
    Dado a receita prevista "Freelance" de "R$ 800,00" com data esperada 05/11/2026 e responsável "Lucas"
    Quando Lucas abre a aba "A receber" de novembro
    Então a receita "Freelance" mostra o selo "Atrasada"

  Cenário: O tipo da previsão não troca
    Dado a receita prevista "Freelance" de "R$ 1.200,00" com data esperada 20/11/2026 e responsável "Lucas"
    Quando Lucas abre a edição da receita prevista "Freelance"
    Então a edição mostra "Para mudar o tipo, exclua e cadastre de novo"
