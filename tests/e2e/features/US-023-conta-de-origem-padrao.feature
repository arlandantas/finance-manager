# language: pt
Funcionalidade: Conta de origem padrão nos pagamentos

  Contexto:
    Dado as contas "Dinheiro" de "Lucas" (R$ 90,00), "Itaú Lucas" de "Lucas" (R$ 3.000,00) e "Itaú Mariana" de "Mariana" (R$ 6.500,00)
    E Lucas está autenticado

  Cenário: Sugestão não usa a última conta se ela ficaria negativa
    Dado que a última conta usada por Lucas foi "Dinheiro"
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre o drawer "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"
    E o aviso "A conta de origem ficará negativa" não aparece

  Cenário: Prefere a conta do titular com saldo suficiente
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre o drawer "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"
    E o motivo "Conta do titular com saldo suficiente" aparece

  Cenário: Baixa usa a conta do responsável com saldo suficiente
    Dado a despesa prevista "Condomínio" de "R$ 650,00" com responsável "Lucas"
    Quando Lucas abre o drawer "Dar baixa" em "Condomínio"
    Então a conta de origem sugerida é "Itaú Lucas"

  Cenário: Titular sem saldo suficiente cai para outra conta com saldo
    Dado a despesa prevista "Reforma" de "R$ 4.000,00" com responsável "Lucas"
    Quando Lucas abre o drawer "Dar baixa" em "Reforma"
    Então a conta de origem sugerida é "Itaú Mariana"

  Cenário: Nenhuma conta cobre o valor
    Dado a despesa prevista "Viagem" de "R$ 9.000,00" com responsável "Lucas"
    Quando Lucas abre o drawer "Dar baixa" em "Viagem"
    Então a conta de origem sugerida é "Itaú Mariana"
    E o aviso "A conta de origem ficará negativa" aparece com o botão "Confirmar mesmo assim"

  Cenário: Desempate pela conta mais usada
    Dado que Lucas usou "Itaú Lucas" 5 vezes e uma segunda conta sua "Bradesco Lucas" com saldo "R$ 3.500,00" 1 vez
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre o drawer "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"

  Cenário: Seletor marca contas sem saldo suficiente
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre o drawer "Pagar fatura"
    Então a opção "Dinheiro" aparece com "saldo insuficiente"
    E a opção "Itaú Lucas" aparece sem marcação

  Cenário: Usuário escolhe outra conta e a escolha é respeitada
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre o drawer "Pagar fatura"
    E Lucas escolhe manualmente a conta "Dinheiro"
    Então o aviso "A conta de origem ficará negativa" aparece com o botão "Confirmar mesmo assim"
    E a conta de origem sugerida é "Dinheiro"

  Cenário: Mudar o valor antes de escolher recalcula a sugestão
    Dado a despesa prevista "Reforma" de "R$ 2.000,00" com responsável "Lucas"
    Quando Lucas abre o drawer "Dar baixa" em "Reforma"
    E Lucas altera o valor pago para "R$ 4.000,00"
    Então a conta de origem sugerida é "Itaú Mariana"

  Cenário: Depois de escolher a conta, mudar o valor não troca a escolha
    Dado a despesa prevista "Reforma" de "R$ 2.000,00" com responsável "Lucas"
    Quando Lucas abre o drawer "Dar baixa" em "Reforma"
    E Lucas escolhe manualmente a conta "Dinheiro"
    E Lucas altera o valor pago para "R$ 4.000,00"
    Então a conta de origem sugerida é "Dinheiro"

  Cenário: Lançamento de despesa continua com a última conta usada
    Dado que a última conta usada por Lucas foi "Dinheiro"
    Quando Lucas abre o formulário de nova despesa
    Então o campo "Pagar com" vem preenchido com "Dinheiro"
