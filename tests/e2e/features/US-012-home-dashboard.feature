# language: pt
Funcionalidade: Home da família

  Cenário: Home com dados
    Dado contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    Quando abro a Home
    Então vejo "Saldo da família: R$ 7.349,50"
    E a lista de contas com seus saldos
    E os últimos 5 lançamentos

  Cenário: Resumo do mês exclui transferências e acertos
    Dado receitas de "R$ 5.000,00", despesas de "R$ 1.200,00" e uma transferência de "R$ 1.000,00"
    Quando abro a Home
    Então "Receitas" mostra "R$ 5.000,00" e "Despesas" mostra "R$ 1.200,00"

  Cenário: Participação por membro
    Dado que Mariana pagou "R$ 900,00" e Lucas "R$ 300,00" em despesas
    Quando abro a Home
    Então vejo "Mariana R$ 900,00 (75%)" e "Lucas R$ 300,00 (25%)"

  Cenário: Card de acerto abre o painel
    Dado que Mariana pagou "R$ 900,00" e Lucas "R$ 300,00" em despesas
    Quando abro a Home
    E toco no card "Acerto do mês"
    Então sou levado ao painel de acerto do mês corrente

  Cenário: Botão de lançamento rápido
    Dado contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    Quando abro a Home
    E toco no botão "+" da Home
    Então o drawer de nova despesa abre com o foco no valor

  Cenário: Família nova sem dados
    Dado uma família sem contas nem lançamentos
    Quando abro a Home
    Então vejo um passo a passo: "1. Cadastre uma conta  2. Convide quem divide as contas  3. Faça seu primeiro lançamento"

  Cenário: Carregamento
    Dado contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    Quando a Home está carregando
    Então vejo skeletons nos blocos, sem saltos de layout

  Cenário: Layout responsivo
    Dado contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    E viewports de 375 px e 1280 px
    Quando abro a Home
    Então todos os blocos são legíveis e utilizáveis sem rolagem horizontal
