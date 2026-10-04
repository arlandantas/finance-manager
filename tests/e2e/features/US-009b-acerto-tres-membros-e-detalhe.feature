# language: pt
Funcionalidade: Acerto de contas com três membros e detalhe

  Cenário: Três membros
    Dado três membros e regra igualitária com total comum de "R$ 900,00" pago só por Mariana
    Quando abro o painel de acerto
    Então a cota de cada um é "R$ 300,00"
    E as sugestões são duas transferências de "R$ 300,00" para Mariana

  Cenário: Ver as despesas que compõem o cálculo
    Dado despesas comuns de "R$ 600,00" por Mariana e "R$ 300,00" por Lucas
    Quando abro o painel de acerto
    E expando "Ver despesas comuns do período"
    Então vejo a lista com quem pagou e valor, cuja soma é o total comum
