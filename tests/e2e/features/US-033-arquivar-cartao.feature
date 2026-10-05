# language: pt
Funcionalidade: Arquivar cartão de crédito

  Contexto:
    Dado a família com o cartão "Nubank Lucas" (compras pagas) e o cartão "Cartão novo" (sem compras)

  Cenário: Arquivar cartão sem pendências
    Quando Mariana arquiva o cartão "Nubank Lucas" e confirma
    Então vê o aviso de cartão "Cartão arquivado"
    E "Nubank Lucas" não aparece na lista de cartões

  Cenário: Cartão arquivado some do Pagar com e mantém compras no Extrato
    Dado que o cartão "Nubank Lucas" foi arquivado
    Quando Mariana abre o formulário de despesa do cartão
    Então "Nubank Lucas" não aparece nas opções de "Pagar com"
    Quando Mariana abre o Extrato dos cartões
    Então a compra antiga do "Nubank Lucas" mostra "(arquivado)"

  Cenário: Fatura fechada não paga bloqueia o arquivamento
    Dado uma fatura fechada de "R$ 479,00" do "Nubank Lucas" ainda não paga
    Quando Mariana tenta arquivar o cartão "Nubank Lucas"
    Então vê o bloqueio de cartão "Pague a fatura antes de arquivar o cartão"

  Cenário: Fatura aberta com compras bloqueia o arquivamento
    Dado uma compra de "R$ 90,00" na fatura aberta do "Nubank Lucas"
    Quando Mariana tenta arquivar o cartão "Nubank Lucas"
    Então vê o bloqueio de cartão "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar."

  Cenário: Reativar cartão
    Dado que o cartão "Nubank Lucas" foi arquivado
    Quando Mariana reativa o cartão "Nubank Lucas"
    Então "Nubank Lucas" volta à lista de cartões

  Cenário: Excluir cartão sem compras e cartão com compras só arquiva
    Quando Mariana exclui o cartão "Cartão novo" e confirma
    Então vê o aviso de cartão "Cartão excluído"
    Quando Mariana abre as ações do cartão "Nubank Lucas"
    Então vê a ação de cartão "Arquivar" e não vê "Excluir"
