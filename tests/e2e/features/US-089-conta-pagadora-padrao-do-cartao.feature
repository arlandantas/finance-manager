# language: pt
Funcionalidade: Conta pagadora padrão do cartão

  Contexto:
    Dado a "Família Silva" com as contas "Corrente" e "Poupança" e os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" de Lucas com fechamento dia 25 e vencimento dia 5
    E hoje é 28/10/2026
    E Lucas está autenticado

  Cenário: Definir a conta pagadora no cadastro
    Quando Lucas edita "Nubank Lucas" e escolhe "Conta que paga a fatura: Corrente"
    Então vê "Cartão atualizado"
    E "Nubank Lucas" mostra "Paga pela Corrente"

  Cenário: Conta pagadora é opcional
    Quando Lucas cria o cartão "Itaú Lucas" sem escolher a conta pagadora
    Então o cartão "Itaú Lucas" é criado sem conta pagadora

  Cenário: Conta sugerida ao pagar
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas abre o pagamento da fatura de "out/2026"
    Então o campo "Conta de origem" vem com "Corrente" e o texto "Conta pagadora do cartão"

  Cenário: Escolher outra conta no ato
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas escolhe "Poupança" em "Conta de origem" e confirma
    Então o pagamento sai da "Poupança"
    E a conta pagadora padrão do cartão continua "Corrente"

  @integration
  Cenário: O app não paga sozinho
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada vencendo hoje
    Quando o dia passa sem ninguém pagar
    Então a fatura continua em "A pagar" e nada é debitado da "Corrente"

  @integration
  Cenário: Conta pagadora arquivada
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas abre o diálogo de arquivar a conta "Corrente" já zerada
    Então o diálogo de arquivar cita "Nubank Lucas" como cartão que usa a conta
    Quando Lucas confirma o arquivamento
    Então o cartão mostra o aviso "A conta Corrente foi arquivada"
    E a fatura ainda pode ser paga por outra conta

  @integration
  Cenário: Trocar a conta padrão não muda pagamento já feito
    Dado a fatura de setembro paga pela "Corrente"
    Quando Lucas troca a conta pagadora para "Poupança"
    Então o pagamento de setembro continua debitado da "Corrente"

  Cenário: Fatura mostra de qual conta sai
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas abre "A pagar" de novembro de 2026
    Então o item "Fatura Nubank Lucas" mostra "Sai da conta Corrente"

  Cenário: Pagadora com saldo insuficiente continua sugerida
    Dado "Nubank Lucas" com conta pagadora "Poupança" e fatura fechada de "R$ 4.000,00"
    Quando Lucas abre o pagamento da fatura de "out/2026"
    Então o campo "Conta de origem" vem com "Poupança" e o texto "Conta pagadora do cartão"
    E a opção "Poupança" indica "saldo insuficiente"

  @valores-ocultos
  Cenário: Valores ocultos mantêm o nome da conta
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas abre o pagamento da fatura de "out/2026"
    Então o campo "Conta de origem" vem com "Corrente" e o texto "Conta pagadora do cartão"
    E nenhum valor em reais aparece em claro no pagamento

  Cenário: Sem rolagem horizontal
    Dado "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00"
    Quando Lucas vai para a tela de cartões
    Então "Nubank Lucas" mostra "Paga pela Corrente"
    E a página não rola na horizontal no cartão
