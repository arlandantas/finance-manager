# language: pt
Funcionalidade: Fatura do cartão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E Lucas está autenticado

  Cenário: Fatura aberta com total e datas
    Dado que hoje é 20/10/2026
    E compras de "R$ 300,00" e "R$ 100,00" em 15/10/2026 no cartão
    Quando Lucas abre o cartão "Nubank Mariana"
    Então vê a fatura "out/2026" com situação "Aberta", total "R$ 400,00", fechamento 25/10 e vencimento 05/11
    E vê as duas compras da mais recente para a mais antiga

  Cenário: Cartões listam fatura atual e limite
    Dado que hoje é 20/10/2026
    E uma compra de "R$ 400,00" em 15/10/2026 no cartão
    Quando Lucas abre "Cartões"
    Então o cartão "Nubank Mariana" mostra "Fatura aberta R$ 400,00", usado "R$ 400,00" e disponível "R$ 4.600,00"

  Cenário: Fatura fecha depois do dia de fechamento
    Dado uma compra de "R$ 400,00" em 15/10/2026 no cartão
    E que hoje é 25/10/2026
    Então a fatura "out/2026" está "Aberta"
    Quando hoje passa a ser 26/10/2026
    Então a fatura "out/2026" está "Fechada" com vencimento 05/11 e é destacada como "a pagar"

  Cenário: Fatura vencida
    Dado uma compra de "R$ 400,00" em 15/10/2026 no cartão
    E que hoje é 06/11/2026 e a fatura não foi paga
    Então a fatura "out/2026" aparece como "Vencida" em destaque de alerta

  Cenário: Limite considera faturas fechadas e abertas
    Dado compras de "R$ 1.200,00" na fatura "out/2026" e de "R$ 300,00" na fatura "nov/2026"
    E que hoje é 28/10/2026
    Quando Lucas abre o cartão
    Então o limite usado é "R$ 1.500,00" e o disponível é "R$ 3.500,00"

  Cenário: Navegar para faturas anteriores
    Dado compras em out/2026 e em nov/2026 e que hoje é 20/11/2026
    Quando Lucas abre a fatura atual e toca em "Fatura anterior"
    Então vê a fatura "out/2026"
    E o botão "Fatura anterior" fica desabilitado por não haver fatura mais antiga

  Cenário: Subtotal por membro
    Dado compras de "R$ 300,00" de Mariana e de "R$ 100,00" de Lucas na fatura "out/2026"
    Quando Lucas abre a fatura
    Então vê "Mariana R$ 300,00" e "Lucas R$ 100,00"

  Cenário: Compra retroativa em fatura fechada aumenta o total
    Dado a fatura "out/2026" fechada com total "R$ 400,00" e que hoje é 28/10/2026
    Quando Lucas lança "R$ 50,00" no cartão com a data 20/10/2026
    Então o total da fatura "out/2026" passa a "R$ 450,00"

  Cenário: Compra excluída não conta no total
    Dado uma compra de "R$ 100,00" excluída na fatura "out/2026"
    Quando Lucas abre a fatura
    Então o total não inclui "R$ 100,00"

  Cenário: Fatura sem compras
    Dado que o cartão não tem compras
    Quando Lucas abre o cartão
    Então vê "Nenhuma compra nesta fatura" e total "R$ 0,00"

  Cenário: Fatura fechada aparece em "A pagar"
    Dado a fatura "out/2026" fechada com total "R$ 400,00" e vencimento 05/11/2026
    E que hoje é 02/11/2026
    Quando Lucas abre a Home
    Então o bloco "A pagar" mostra "Fatura Nubank Mariana R$ 400,00" com vencimento 05/11

  Cenário: Erro ao carregar a fatura
    Dado que a leitura da fatura falha
    Quando Lucas abre o cartão
    Então vê "Não foi possível carregar" com o botão "Tentar de novo"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Lucas tenta abrir a fatura do cartão "Visa Souza" por endereço direto
    Então vê "Não encontrado"
