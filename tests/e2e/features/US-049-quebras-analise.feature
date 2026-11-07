# language: pt
Funcionalidade: Quebras da Análise por membro, conta/cartão e tag

  Contexto:
    Dado a família da viagem com Lazer "R$ 1.050,00" da Mariana, Transporte "R$ 600,00" do Lucas e Moradia "R$ 300,00" sem tag, hoje 12/10/2026

  Cenário: Por tag mostra o valor sem percentual e a linha Sem tag leva ao Extrato
    Quando abro a Análise agrupada por "tag"
    Então a linha "viagem-nordeste" da análise mostra "R$ 1.650,00" e "—"
    Quando abro a linha "Sem tag" da análise
    Então o Extrato filtrado mostra despesas "R$ 300,00"

  Cenário: Filtros combinados, URL compartilhável e limpar filtros
    Quando abro a Análise agrupada por "member" com a tag "viagem-nordeste"
    Então a linha "Mariana" da análise mostra "R$ 1.050,00" e "63,6%"
    Quando recarrego a página
    Então a linha "Lucas" da análise mostra "R$ 600,00" e "36,4%"
    Quando limpo os filtros da análise
    Então a linha "Mariana" da análise mostra "R$ 1.350,00" e "69,2%"

  Cenário: Combinação sem lançamentos e conta/cartão
    Quando abro a Análise agrupada por "account"
    Então a linha "Nubank Lucas" da análise mostra "R$ 600,00" e "30,8%"
    Quando abro a Análise agrupada por "category" com a tag "inexistente-x"
    Então a análise diz "Nada lançado com esses filtros"
