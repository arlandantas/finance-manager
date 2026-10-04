# language: pt
Funcionalidade: Gerenciar categorias

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a família tem as 8 categorias de despesa e as 3 de receita padrão
    E Lucas está autenticado

  Cenário: Criar categoria de despesa
    Quando Lucas abre "Categorias", escolhe "Despesa", toca em "Nova categoria", informa "Pet", escolhe o ícone de patinha e salva
    Então a categoria "Pet" aparece na lista de despesas
    E aparece como última opção na grade do drawer de nova despesa

  Cenário: Usar a categoria nova em um lançamento
    Dado a categoria de despesa "Pet"
    Quando Lucas lança "R$ 120,00" na categoria "Pet"
    Então a despesa é registrada na categoria "Pet"

  Cenário: Mesmo nome em tipos diferentes
    Dado a categoria de despesa "Presentes"
    Quando Lucas cria a categoria de receita "Presentes"
    Então as duas categorias existem, cada uma no seu tipo

  Cenário: Nome duplicado no mesmo tipo
    Dado a categoria de despesa "Supermercado"
    Quando Lucas tenta criar a categoria de despesa " supermercado "
    Então vê "Já existe uma categoria com este nome"
    E nada é criado

  Cenário: Nome igual ao de uma categoria arquivada
    Dado a categoria de despesa "Pet" arquivada
    Quando Lucas tenta criar a categoria de despesa "Pet"
    Então vê "Já existe uma categoria arquivada com este nome" com a ação "Reativar"

  Cenário: Nome muito curto
    Quando Lucas tenta criar uma categoria de despesa com o nome "A"
    Então vê "Informe um nome com ao menos 2 caracteres"

  Cenário: Nome muito longo
    Quando Lucas tenta criar uma categoria com 31 caracteres
    Então vê "O nome deve ter no máximo 30 caracteres"

  Cenário: Renomear preserva o histórico
    Dado uma despesa de "R$ 150,50" na categoria "Supermercado"
    Quando Lucas renomeia a categoria "Supermercado" para "Mercado"
    Então a despesa de "R$ 150,50" passa a aparecer na categoria "Mercado"
    E o total gasto na categoria não muda

  Cenário: Arquivar categoria em uso
    Dado uma despesa de "R$ 80,00" na categoria "Lazer e restaurantes"
    Quando Lucas arquiva a categoria "Lazer e restaurantes"
    Então ela some da grade do drawer de nova despesa
    E a despesa de "R$ 80,00" continua no extrato com a categoria "Lazer e restaurantes"
    E o filtro de categoria do extrato ainda lista "Lazer e restaurantes (arquivada)"

  Cenário: Reativar categoria arquivada
    Dado a categoria de despesa "Lazer e restaurantes" arquivada
    Quando Lucas reativa a categoria
    Então ela volta à grade do drawer de nova despesa

  Cenário: Não arquivar a última categoria ativa do tipo
    Dado que só resta a categoria de receita "Salário" ativa
    Quando Lucas tenta arquivá-la
    Então vê "Mantenha ao menos uma categoria de receita ativa"
    E a categoria continua ativa

  Cenário: Limite de categorias por tipo
    Dado que a família tem 40 categorias de despesa
    Quando Lucas tenta criar mais uma
    Então vê "Limite de 40 categorias por tipo atingido"

  Cenário: Conflito de edição
    Dado que Lucas e Mariana abriram a edição da categoria "Transporte"
    Quando Mariana renomeia para "Locomoção" e salva
    E Lucas tenta renomear para "Carro" e salvar
    Então Lucas vê "Esta categoria foi alterada por Mariana. Recarregue para continuar."

  Cenário: Membro comum também gerencia
    Dado que Lucas é "Membro" e não "Administrador"
    Quando Lucas cria a categoria de despesa "Pet"
    Então a categoria é criada

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar" na nova categoria
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a categoria "Pet"
    Quando Lucas abre "Categorias"
    Então não vê a categoria "Pet" da outra família
