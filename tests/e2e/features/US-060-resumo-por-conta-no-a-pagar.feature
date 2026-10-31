# language: pt
Funcionalidade: Resumo por conta no A pagar

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Saldo previsto por conta
    Dado "Corrente" com saldo "R$ 1.000,00"
    E previstas de "R$ 650,00" e "R$ 120,00" com "Pagar com: Corrente" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" mostra atual "R$ 1.000,00", a pagar "R$ 770,00" e previsto "R$ 230,00"

  Cenário: Conta que vai faltar
    Dado "Corrente" com saldo "R$ 500,00" e a pagar "R$ 770,00"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" destaca "Falta R$ 270,00"

  Cenário: Prevista sem conta
    Dado uma prevista de "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    Então aparece a linha "Sem conta definida" com "R$ 100,00"

  Cenário: Prevista Só meu de outro membro entra no cálculo
    Dado "Corrente" com saldo "R$ 1.000,00"
    E Lucas tem uma prevista "Só meu" de "R$ 300,00" com "Pagar com: Corrente"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" mostra a pagar "R$ 300,00" e previsto "R$ 700,00"

  Cenário: A soma das contas bate com o total de A pagar
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    Então o total de "A pagar" é "R$ 950,00"
    E a soma das linhas por conta, incluindo "Sem conta definida", é "R$ 950,00"

  Cenário: Fatura entra na conta pagadora do cartão
    Dado o cartão "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" inclui "R$ 1.500,00" na coluna "A pagar"

  Cenário: Fatura de cartão sem conta pagadora
    Dado o cartão "Nubank Lucas" sem conta pagadora e fatura fechada de "R$ 1.500,00" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Sem conta definida" inclui "R$ 1.500,00"

  Cenário: Prevista paga sai do cálculo
    Dado "Corrente" com saldo "R$ 1.000,00" e a pagar "R$ 770,00"
    Quando Mariana dá baixa em uma prevista de "R$ 650,00" pela "Corrente"
    Então "Corrente" mostra atual "R$ 350,00" e a pagar "R$ 120,00"
    E o previsto continua "R$ 230,00"

  @valores-ocultos
  Cenário: Valores ocultos
    Dado "Corrente" com saldo "R$ 500,00" e a pagar "R$ 770,00"
    E que os valores estão ocultos
    Quando Mariana abre "A pagar" de outubro de 2026
    Então os valores por conta aparecem mascarados
    E o aviso "Falta" continua visível sem número

  Cenário: Filtro por conta na lista
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    E Mariana toca na linha "Poupança"
    Então a lista mostra só "1" conta a pagar e o filtro "Conta: Poupança"
    Quando Mariana limpa o filtro por conta
    Então a lista mostra só "3" conta a pagar e nenhum filtro por conta

  Cenário: Trocar de mês limpa o filtro por conta
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    E Mariana toca na linha "Corrente"
    E Mariana vai para o mês seguinte e volta
    Então a lista mostra só "3" conta a pagar e nenhum filtro por conta

  Cenário: Linha acionável pelo teclado
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    E Mariana foca a linha "Poupança" e aperta Enter
    Então a lista mostra só "1" conta a pagar e o filtro "Conta: Poupança"

  Cenário: Sem rolagem horizontal
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    Então a página não rola na horizontal

  Cenário: Mês sem nada a pagar mantém as contas com saldo
    Dado "Corrente" com saldo "R$ 1.000,00"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" mostra atual "R$ 1.000,00", a pagar "R$ 0,00" e previsto "R$ 1.000,00"

  Cenário: Sem contas e sem a pagar
    Quando Mariana abre "A pagar" de outubro de 2026
    Então vê "Nenhuma conta com saldo ou a pagar neste mês"

  Cenário: Esqueleto enquanto carrega
    Dado "Corrente" com saldo "R$ 1.000,00"
    Quando Mariana abre "A pagar" de outubro de 2026 com a resposta atrasada
    Então vê o esqueleto do resumo por conta e depois a linha "Corrente"

  Cenário: Erro ao carregar
    Dado "Corrente" com saldo "R$ 1.000,00"
    Quando Mariana abre "A pagar" de outubro de 2026 e a resposta falha
    Então vê "Não foi possível carregar" com o botão "Tentar de novo"
