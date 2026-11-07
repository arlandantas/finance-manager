# language: pt
Funcionalidade: Assinatura no cartão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E hoje é 05/11/2026
    E Lucas está autenticado

  Cenário: Cadastrar a assinatura pela tela do cartão
    Quando Lucas abre o cartão
    E Lucas preenche a assinatura "Netflix" de "R$ 55,90" no dia 10 com a categoria "Moradia"
    Então a frase da primeira cobrança é "Primeira cobrança em 10/11/2026, na fatura de nov/2026"
    Quando Lucas salva a assinatura
    Então o bloco de assinaturas mostra "Netflix" com "R$ 55,90" e "Todo dia 10"

  Cenário: Prevista antes do dia e lançada no dia, nunca nas duas
    Dado a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Então a fatura aberta mostra "Assinaturas previstas neste ciclo: R$ 55,90" e total "R$ 0,00"
    Quando hoje passa a ser 10/11/2026
    E Lucas recarrega a tela do cartão
    Então a fatura aberta não mostra assinaturas previstas e o total é "R$ 55,90"

  Cenário: Extrato mostra o selo Assinatura
    Dado a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Quando hoje passa a ser 10/11/2026
    E Lucas abre o Extrato para ver a assinatura
    Então a linha "Netflix" do Extrato tem o selo "Assinatura" e nenhuma parcela

  Cenário: Cobrança pulada por fatura paga avisa no bloco
    Dado a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    E a cobrança de nov/2026 de "Netflix" foi pulada porque a fatura estava paga
    Quando hoje passa a ser 10/11/2026
    E Lucas recarrega a tela do cartão
    Então o bloco de assinaturas avisa "Cobrança de nov/2026 não lançada: fatura paga"

  Cenário: Tela do cartão cabe em 375 px no tema escuro
    Dado a tela tem 375 por 800 pixels
    E o tema do sistema é escuro
    E a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Então a tela do cartão não tem rolagem horizontal e o bloco de assinaturas está visível

  Cenário: Outro membro vê a assinatura mas não cadastra em nome de Lucas
    Dado a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Quando Mariana abre o cartão
    Então o bloco de assinaturas mostra "Netflix" com "R$ 55,90" e "Todo dia 10"
    E a fatura aberta mostra "Assinaturas previstas neste ciclo: R$ 55,90" e total "R$ 0,00"
    Quando Mariana abre o formulário de nova assinatura
    Então "Lucas" não pode ser escolhido em "Quem gastou"
    Quando hoje passa a ser 10/11/2026
    E Mariana abre o Extrato para ver a assinatura
    Então a linha "Netflix" do Extrato tem o selo "Assinatura" e nenhuma parcela

  Cenário: Assinatura pela porta única
    Quando Lucas abre a porta de lançar escolhendo o cartão "Nubank Mariana"
    E Lucas escolhe "Assinatura (todo mês)" e preenche "Netflix" de "R$ 55,90" no dia 10 com a categoria "Moradia"
    Então a linha de efeito da assinatura é "Lança sozinha todo dia 10 no cartão Nubank Mariana. Primeira cobrança em 10/11/2026"
    E o botão de salvar da porta é "Salvar assinatura"
    Quando Lucas salva a assinatura pela porta
    Então a família tem 1 assinatura "Netflix" e nenhuma compra avulsa

  Cenário: Porta única com assinatura cabe em 375 px no tema escuro
    Dado a tela tem 375 por 800 pixels
    E o tema do sistema é escuro
    Quando Lucas abre a porta de lançar escolhendo o cartão "Nubank Mariana"
    E Lucas escolhe "Assinatura (todo mês)" e preenche "Netflix" de "R$ 55,90" no dia 10 com a categoria "Moradia"
    Então a porta com assinatura não tem rolagem horizontal e não há erros no console

  Cenário: Porta única da assinatura, segundo membro não cadastra em nome de Lucas
    Dado a assinatura "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Quando Mariana abre a porta de lançar escolhendo o cartão "Nubank Mariana"
    E Mariana escolhe "Assinatura (todo mês)" na porta
    Então "Lucas" não pode ser escolhido em "Quem pagou?" na porta
    E o bloco de assinaturas do cartão mostra "Netflix" para Mariana
