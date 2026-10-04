# language: pt
Funcionalidade: Extrato de lançamentos

  Contexto:
    Dado que em outubro há: despesa comum de "R$ 150,50" de Lucas em "Supermercado"
    E despesa pessoal de "R$ 80,00" de Mariana em "Lazer e restaurantes"
    E receita de "R$ 5.000,00" de Mariana em "Salário"

  Cenário: Extrato padrão
    Quando abro o extrato
    Então vejo os três lançamentos de outubro do mais recente ao mais antigo
    E cada linha mostra valor, categoria, conta, avatar de quem pagou e marcador comum ou pessoal

  Cenário: Filtrar por membro
    Quando filtro por "Lucas"
    Então vejo apenas os lançamentos em que Lucas pagou, recebeu ou foi o autor

  Cenário: Filtrar por categoria e tipo
    Quando filtro por categoria "Supermercado" e tipo "Despesa"
    Então vejo apenas a despesa de "R$ 150,50"
    E o total de despesas do filtro é "R$ 150,50"

  Cenário: Filtrar por período
    Quando seleciono o mês anterior
    Então vejo somente lançamentos desse mês

  Cenário: Detalhe mostra o autor
    Dado que Lucas registrou a despesa em nome de Mariana
    Quando abro o detalhe do lançamento
    Então vejo "Registrado por Lucas" e "Pago por Mariana"

  Cenário: Estado vazio com filtro
    Quando aplico um filtro sem resultados
    Então vejo "Nenhum lançamento encontrado" e a ação "Limpar filtros"

  Cenário: Estado vazio sem lançamentos
    Dado uma família sem nenhum lançamento
    Quando abro o extrato
    Então vejo um convite para fazer o primeiro lançamento

  Cenário: Novo lançamento aparece sem recarregar
    Dado que estou no extrato
    Quando registro uma despesa pelo botão "+"
    Então ela aparece no topo da lista sem recarregar a página

  Cenário: Isolamento entre famílias
    Quando um usuário de outra família abre o extrato
    Então não vê nenhum lançamento da "Família Silva"
