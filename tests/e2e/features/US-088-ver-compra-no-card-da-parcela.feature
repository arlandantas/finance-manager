# language: pt
Funcionalidade: Ver compra no card da parcela

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Ação dentro do card
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato filtrado pelo cartão no intervalo de nov/2026 a ago/2027
    Então a parcela "Notebook 2/10" mostra "Ver compra" dentro do próprio card

  Cenário: Abre o plano da compra
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato filtrado pelo cartão no intervalo de nov/2026 a ago/2027
    E Lucas toca no botão "Ver compra" da parcela "Notebook 2/10"
    Então vê o total "R$ 2.500,00" e as 10 parcelas da compra com a fatura de cada uma

  Cenário: Compra à vista não tem a ação
    Dado que Lucas lançou "Mercado" de "R$ 90,00" em "1x"
    Quando Lucas abre o Extrato filtrado pelo cartão no intervalo de nov/2026 a ago/2027
    Então a linha "Mercado" não mostra "Ver compra"

  Cenário: Acessível por leitor de tela
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato filtrado pelo cartão no intervalo de nov/2026 a ago/2027
    Então a ação da parcela "Notebook 2/10" é anunciada como botão "Ver compra" com dica e alvo de 44 pixels
