# language: pt
Funcionalidade: Rótulo da regra de divisão no Acerto

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas" e a regra igual vigente

  Cenário: Mês com regra única mostra a regra daquele mês
    Dado despesas comuns de setembro de 2026 que somam "R$ 717,00"
    Quando Lucas abre o Acerto de "2026-09"
    Então o rótulo da divisão é "Divisão igual (50% / 50%)"
    E a cota de Mariana é "R$ 358,50" e a de Lucas é "R$ 358,50"

  Cenário: Mês passado não herda a regra criada depois
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    E despesas comuns de setembro de 2026 que somam "R$ 717,00"
    Quando Lucas abre o Acerto de "2026-09"
    Então o rótulo da divisão é "Divisão igual (50% / 50%)"
    E o rótulo não menciona "58%"

  Cenário: Mês com mudança de regra mostra os dois trechos e o percentual ponderado
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    E uma despesa comum de "R$ 400,00" paga por Mariana em 02/10/2026
    E uma despesa comum de "R$ 1.000,00" paga por Lucas em 10/10/2026
    Quando Lucas abre o Acerto de "2026-10"
    Então o rótulo da divisão é "50% / 50% até 03/10 · 58% / 42% a partir de 04/10"
    E o painel mostra "Na prática neste mês: 55,7% / 44,3%"
    E a cota de Mariana é "R$ 780,00" e a de Lucas é "R$ 620,00"

  Cenário: Mês sem despesas comuns não mostra percentual ponderado
    Quando Lucas abre o Acerto de "2026-11"
    Então o painel mostra "Nenhuma despesa dividida neste mês"
    E o painel não mostra "Na prática neste mês"

  Cenário: Todos os membros veem o histórico de regras
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    Quando Lucas abre o Acerto de "2026-10"
    E Lucas abre o histórico de regras de divisão
    Então vê 3 regras no histórico com o percentual e a data de vigência
    E não vê o botão "Alterar regra"

  Cenário: Números homologados permanecem
    Dado despesas comuns de outubro de "R$ 3.169,90" e regra igual
    Quando Lucas abre o Acerto de "2026-10"
    Então a cota de Mariana é "R$ 1.584,95" e a de Lucas é "R$ 1.584,95"
    E o rótulo da divisão é "Divisão igual (50% / 50%)"

  Cenário: Falha ao carregar o histórico de regras
    Dado que o serviço está indisponível para o histórico de regras
    Quando Lucas abre o Acerto de "2026-10"
    E Lucas abre o histórico de regras de divisão
    Então vê "Não foi possível carregar a regra de divisão" com o botão "Tentar de novo"
