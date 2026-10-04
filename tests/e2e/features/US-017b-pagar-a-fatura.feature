# language: pt
Funcionalidade: Pagamento da fatura

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E a fatura "out/2026" com total "R$ 1.200,00"
    E hoje é 28/10/2026
    E Lucas está autenticado

  Cenário: Pagar a fatura fechada
    Quando Lucas toca em "Pagar fatura", escolhe a conta "Itaú Lucas" e confirma o pagamento de "R$ 1.200,00"
    Então o saldo de "Itaú Lucas" passa a "R$ 1.800,00"
    E a fatura "out/2026" fica "Paga" em 28/10/2026
    E aparece o aviso "Fatura paga com sucesso!"

  Cenário: Pagar libera o limite
    Dado o limite disponível de "R$ 3.800,00"
    Quando Lucas paga a fatura "out/2026"
    Então o limite disponível passa a "R$ 5.000,00"

  Cenário: Pagamento não é despesa
    Quando Lucas paga a fatura "out/2026"
    Então o total de despesas de outubro no extrato e na Home não muda
    E o acerto de contas de outubro não muda

  Cenário: Pagamento aparece no extrato como linha neutra
    Quando Lucas paga a fatura "out/2026" em 28/10/2026
    E abre o extrato
    Então vê "Pagamento da fatura Nubank Mariana - out/2026" de "R$ 1.200,00" na conta "Itaú Lucas"
    E a linha não é contada em receitas nem em despesas

  Cenário: Fatura aberta não é pagável
    Dado a fatura "nov/2026" aberta com total "R$ 300,00"
    Quando Lucas abre a fatura "nov/2026"
    Então não vê o botão "Pagar fatura"

  Cenário: Fatura sem compras não é pagável
    Dado a fatura "set/2026" fechada com total "R$ 0,00"
    Quando Lucas abre a fatura "set/2026"
    Então não vê o botão "Pagar fatura"

  Cenário: Conta obrigatória
    Quando Lucas tenta confirmar o pagamento sem escolher a conta
    Então vê "Escolha a conta de pagamento"

  Cenário: Data do pagamento no futuro
    Quando Lucas escolhe uma data posterior a hoje para o pagamento
    Então vê "A data do pagamento não pode ser futura"

  Cenário: Data do pagamento antes do fechamento
    Quando Lucas escolhe a data 20/10/2026 para o pagamento
    Então vê "A data do pagamento deve ser posterior ao fechamento da fatura"

  Cenário: Conta ficará negativa
    Dado que o saldo de "Itaú Lucas" é "R$ 500,00"
    Quando Lucas escolhe "Itaú Lucas" para pagar "R$ 1.200,00"
    Então vê o aviso "A conta de origem ficará negativa" com o botão "Confirmar mesmo assim"
    E ao confirmar o saldo da conta passa a "-R$ 700,00"

  Cenário: Duplo clique não paga duas vezes
    Quando Lucas toca duas vezes rapidamente em "Confirmar pagamento"
    Então apenas um pagamento é registrado
    E a conta é debitada uma única vez

  Cenário: Fatura já paga
    Dado que a fatura "out/2026" já foi paga por Mariana
    Quando Lucas tenta pagar a fatura pela tela que estava aberta
    Então vê "Esta fatura já foi paga"
    E nada é debitado

  Cenário: Total mudou durante o pagamento
    Dado que Lucas abriu o pagamento da fatura de "R$ 1.200,00"
    E que Mariana lançou depois uma compra retroativa de "R$ 50,00" na mesma fatura
    Quando Lucas confirma o pagamento
    Então vê "O valor da fatura mudou. Confira e tente de novo."
    E o drawer passa a mostrar "R$ 1.250,00"
    E nada é debitado

  Cenário: Desfazer o pagamento
    Dado a fatura "out/2026" paga em 28/10/2026 com a conta "Itaú Lucas"
    Quando Lucas toca em "Desfazer pagamento" e confirma
    Então o saldo de "Itaú Lucas" volta a "R$ 3.000,00"
    E a fatura "out/2026" volta a "Fechada"
    E o limite disponível volta a "R$ 3.800,00"

  Cenário: Compra em fatura paga é recusada
    Dado a fatura "out/2026" paga
    Quando Lucas tenta lançar no cartão uma compra com a data 20/10/2026
    Então vê "A fatura de out/2026 já foi paga. Use uma data posterior ao fechamento."
    E nada é registrado

  Cenário: Compras de fatura paga ficam travadas
    Dado a fatura "out/2026" paga
    Quando Lucas tenta editar ou excluir uma compra dela
    Então vê "Esta compra está em uma fatura já paga. Desfaça o pagamento da fatura para alterá-la."

  Cenário: Pagamento não pode ser editado nem excluído no extrato
    Dado o pagamento da fatura "out/2026" no extrato
    Quando Lucas abre o detalhe
    Então não há "Editar" nem "Excluir", só "Desfazer pagamento"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a fatura "out/2026" fechada
    Quando Lucas tenta pagá-la por endereço direto
    Então vê "Não encontrado"

  Cenário: Falha de rede ao pagar
    Dado que não há conexão
    Quando Lucas confirma o pagamento
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
