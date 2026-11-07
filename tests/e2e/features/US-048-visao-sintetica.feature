# language: pt
Funcionalidade: Visão sintética da Análise

  Contexto:
    Dado a família da análise com receita de "R$ 5.000,00" e despesas de "R$ 700,00", "R$ 300,00" e "R$ 200,00" em outubro e hoje 12/10/2026

  Cenário: Totais e participação por categoria no mês corrente
    Quando abro a Análise
    Então a análise mostra receitas "R$ 5.000,00", despesas "R$ 1.200,00" e resultado "R$ 3.800,00"
    E a análise lista as participações "58,3%", "25,0%" e "16,7%"

  Cenário: Drill-down leva ao Extrato com o mesmo valor
    Quando abro a Análise
    E abro a primeira categoria da análise
    Então o Extrato filtrado mostra despesas "R$ 700,00"

  Cenário: Mês anterior vazio e receitas
    Quando abro a Análise
    E navego para o mês anterior na análise
    Então a análise diz "Nada lançado neste período"
    Quando navego para o mês seguinte na análise
    E escolho receitas na análise
    Então a análise lista as participações "100,0%"

  Cenário: Intervalo acima de 24 meses mostra o erro
    Quando abro a Análise do intervalo "2024-01-01" a "2026-10-31"
    Então a análise mostra o erro "Escolha um intervalo de até 24 meses"

  @valores-ocultos
  Cenário: Valores ocultos (padrão) mantêm as barras
    Quando abro a Análise
    Então a análise mostra a máscara no lugar dos valores e 3 barras

  Cenário: Erro de rede permite tentar de novo
    Dado que o serviço da análise está indisponível
    Quando abro a Análise
    Então a análise mostra "Não foi possível carregar a análise" com o botão "Tentar de novo"
