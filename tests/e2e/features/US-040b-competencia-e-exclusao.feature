# language: pt
Funcionalidade: Competência da parcela e exclusão da compra parcelada (US-040b)

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Despesa do mês conta só a parcela
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Então as despesas de nov/2026 no Extrato são "R$ 250,00"
    E as despesas de dez/2026 no Extrato são "R$ 250,00"

  Cenário: Extrato mostra uma linha por parcela
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato filtrado pelo cartão no intervalo de nov/2026 a ago/2027
    Então vê 10 linhas "Notebook" com rótulos "1/10" a "10/10"

  Cenário: Parcela aparece no Extrato do mês da fatura
    Dado que hoje é 28/11/2026
    E que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato de 2026-12
    Então vê a linha "Notebook" com a etiqueta "Fatura dez/2026 · 1/10"
    E o Extrato de 2026-11 não mostra a linha "Notebook"

  Cenário: Compra à vista segue pela data da compra
    Dado que hoje é 28/11/2026
    E que Lucas lançou "Mercado" de "R$ 90,00" em "1x"
    Então o Extrato de 2026-11 mostra a linha "Mercado"
    E o Extrato de 2026-12 não mostra a linha "Mercado"

  Cenário: Ver compra mostra todas as parcelas
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas toca em "Ver compra" na parcela "3/10" do Extrato de nov/2026 a ago/2027
    Então vê o total "R$ 2.500,00" e as 10 parcelas com a fatura de cada uma

  Cenário: Excluir a compra parcelada inteira
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas exclui a compra parcelada pelo detalhe e confirma
    Então nenhuma fatura mostra "Notebook"
    E o limite disponível do cartão volta a "R$ 5.000,00"

  Cenário: Desfazer a exclusão da compra parcelada inteira
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E Lucas excluiu a compra parcelada pelo detalhe
    Quando Lucas desfaz pelo aviso
    Então as 10 parcelas voltam às suas faturas
    E o limite disponível do cartão volta a "R$ 2.500,00"

  Cenário: Excluir a compra com parcela em fatura fechada
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 está fechada e não paga
    Quando Lucas tenta excluir a compra parcelada pelo detalhe
    Então a tela mostra "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."
    E nenhuma parcela é excluída

  Cenário: Parcela não é editável até a gestão de parcelas
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o detalhe da parcela "3/10"
    Então o detalhe da parcela não tem "Editar"
    E o detalhe da parcela tem "Excluir compra parcelada"

  Cenário: Intervalo do Extrato aceita até 24 meses
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas escolhe no Extrato um intervalo de 25 meses
    Então a tela mostra "Escolha um intervalo de até 24 meses"
