# language: pt
Funcionalidade: Painel de acerto de contas

  Cenário: Cálculo igualitário com um devedor
    Dado a regra 50/50 e as despesas comuns de outubro:
      | quem pagou | valor        |
      | Mariana    | R$ 2.000,00  |
      | Mariana    | R$ 400,00    |
      | Lucas      | R$ 1.200,00  |
      | Lucas      | R$ 400,00    |
    Quando abro o painel de acerto de outubro
    Então vejo "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana"
    E Mariana: pagou "R$ 2.400,00", cota "R$ 2.000,00", diferença "+R$ 400,00"
    E Lucas: pagou "R$ 1.600,00", cota "R$ 2.000,00", diferença "-R$ 400,00"

  Cenário: Despesas pessoais não entram
    Dado uma despesa pessoal de "R$ 500,00" de Mariana
    Quando abro o painel de acerto
    Então o total comum não inclui "R$ 500,00"

  Cenário: Divisão proporcional
    Dado a regra 60% / 40% e total comum de "R$ 1.000,00" pago integralmente por Mariana
    Quando abro o painel de acerto
    Então a cota de Mariana é "R$ 600,00" e a de Lucas é "R$ 400,00"
    E vejo "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana"

  Cenário: Centavo ímpar não se perde
    Dado a regra 50/50 e uma única despesa comum de "R$ 100,01" paga por Mariana
    Quando abro o painel de acerto
    Então as cotas somam exatamente "R$ 100,01"
    E uma cota é "R$ 50,01" e a outra "R$ 50,00"

  Cenário: Mês equilibrado
    Dado que ambos pagaram o mesmo valor em despesas comuns
    Quando abro o painel de acerto
    Então vejo "Tudo certo neste mês" e nenhuma sugestão de transferência

  Cenário: Mês sem despesas comuns
    Dado que não há despesas comuns no mês
    Quando abro o painel de acerto
    Então vejo o estado vazio explicativo e nenhum valor devido

  Cenário: Família com um só membro
    Dado que a família tem apenas Mariana
    Quando abro o painel de acerto
    Então vejo que o acerto exige pelo menos dois membros e a ação "Convidar membro"

  Cenário: Navegar entre meses
    Dado despesas comuns de setembro e de outubro
    Quando abro o painel de acerto
    E navego para o mês anterior
    Então o painel recalcula apenas com as despesas daquele mês
