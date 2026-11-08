# language: pt
Funcionalidade: Gerenciar compra parcelada, editar parcelas e excluir uma parcela (US-041)

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Editar só uma parcela pergunta o alcance e baixa o limite (AC1, AC2)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o detalhe da parcela "3/10"
    E Lucas toca em "Editar" no detalhe da parcela
    Então o alcance "Somente esta" está marcado e "Esta e as próximas" está disponível
    Quando Lucas troca o valor da parcela para "R$ 300,00" e salva
    Então o limite disponível do cartão volta a "R$ 2.450,00"

  Cenário: Excluir uma parcela e desfazer (AC6)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o detalhe da parcela "5/10"
    E Lucas toca em "Excluir parcela" no detalhe da parcela
    E Lucas confirma a exclusão da parcela
    E Lucas desfaz a exclusão da parcela pelo aviso
    Então o limite disponível do cartão volta a "R$ 2.500,00"

  Cenário: Parcela em fatura fechada não edita nem exclui (AC4)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 está fechada e não paga
    Quando Lucas abre o detalhe da parcela "1/10"
    Então o detalhe da parcela não tem "Editar"
    E o detalhe da parcela não tem "Excluir parcela"
    E o detalhe da parcela mostra "Fatura fechada"

  @integration
  Cenário: Esta e as próximas altera valor e categoria da 3/10 em diante (AC3)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas edita a parcela "3/10" com alcance "Esta e as próximas" para "R$ 200,00"
    Então 3/10 a 10/10 valem "R$ 200,00" e 1/10 e 2/10 seguem "R$ 250,00"

  @integration
  Cenário: Fatura paga trava a parcela e pula as seguintes travadas (AC4, AC5)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 está paga
    Quando Lucas edita a parcela "2/10" com alcance "Esta e as próximas" para "R$ 200,00"
    Então 1/10 segue intacta e 2/10 a 10/10 foram alteradas

  @integration
  Cenário: Conflito de versão mostra a mensagem de Mariana (AC7)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E Mariana alterou a parcela "2/10"
    Quando Lucas envia uma edição com a versão antiga
    Então a tela mostra "Esta compra foi alterada por Mariana. Recarregue para continuar."

  @integration
  Cenário: Duplo clique com a mesma chave aplica uma vez (AC8)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas envia a mesma edição duas vezes com a mesma chave
    Então a parcela tem uma só revisão de edição

  @integration
  Cenário: Parcela comum em mês acertado exige confirmação (AC9)
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E o mês de nov/2026 foi acertado
    Quando Lucas edita o valor de uma parcela comum
    Então a API pede confirmação do mês acertado
