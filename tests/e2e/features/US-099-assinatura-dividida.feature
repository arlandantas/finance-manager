# language: pt
Funcionalidade: Assinatura dividida entra no acerto

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E hoje é 05/11/2026
    E Lucas está autenticado

  Cenário: Dividir a assinatura pela tela do cartão e ver a cota no acerto
    Quando Lucas abre o cartão
    E Lucas preenche a assinatura "Netflix" de "R$ 55,91" no dia 10 com a categoria "Moradia"
    Então o interruptor da assinatura mostra "Só meu"
    Quando Lucas liga "Dividir com a família" na assinatura
    Então o interruptor da assinatura mostra "Divisão igual (50% / 50%)"
    Quando Lucas salva a assinatura
    E hoje passa a ser 10/11/2026
    E Lucas abre o painel de acerto de novembro de 2026
    Então o acerto de novembro mostra o total "R$ 55,91" e as cotas "R$ 27,95" e "R$ 27,96"

  Cenário: Segundo membro vê o interruptor desligado e não cadastra em nome de Lucas
    Dado a assinatura dividida "Netflix" de "R$ 55,90" no dia 10 cadastrada pela tela do cartão
    Quando Mariana abre o cartão
    E Mariana abre o formulário de nova assinatura
    Então o interruptor da assinatura mostra "Só meu"
    E "Lucas" não pode ser escolhido em "Quem gastou"
    Quando hoje passa a ser 10/11/2026
    E Mariana abre o painel de acerto de novembro de 2026
    Então o acerto de novembro mostra o total "R$ 55,90" e as cotas "R$ 27,95" e "R$ 27,95"

  Cenário: Acerto desligado: o formulário não oferece dividir
    Dado que o acerto da família está desligado
    Quando Lucas abre o cartão
    E Lucas abre o formulário de nova assinatura
    Então o formulário da assinatura não oferece "Dividir com a família"

  Cenário: Formulário com o interruptor cabe em 375 px no tema escuro
    Dado a tela tem 375 por 800 pixels
    E o tema do sistema é escuro
    Quando Lucas abre o cartão
    E Lucas abre o formulário de nova assinatura
    Então o formulário da assinatura tem o interruptor sem rolagem horizontal
