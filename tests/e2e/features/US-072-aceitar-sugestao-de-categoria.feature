# language: pt
Funcionalidade: Aceitar sugestões de categoria
  # Regra LOCAL, sem IA (SDD-023 §4.6). DEV-58: relógio fixo em 04/10/2026.

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E 9 lançamentos de "Droga Raia" na categoria "Saúde"
    E o lançamento de "Droga Raia" na categoria "Lazer e restaurantes" em set/2026

  Cenário: Cada sugestão mostra o porquê
    Quando Lucas abre as "Sugestões de categoria"
    Então vê a sugestão "Droga Raia: de Lazer e restaurantes para Saúde"
    E vê a explicação da sugestão "9 de 10 lançamentos"

  Cenário: Aceitar altera só a categoria
    Quando Lucas abre as "Sugestões de categoria"
    E aceita a sugestão de "Droga Raia"
    Então o lançamento de "Droga Raia" passa a ter a categoria "Saúde"
    E o valor, a data e a divisão do lançamento não mudam
    E vê o aviso de categoria "Categoria alterada"

  Cenário: Não existe aceitar tudo
    Quando Lucas abre as "Sugestões de categoria"
    Então não vê o botão "Aceitar todas" nas sugestões

  Cenário: Recusar descarta a sugestão
    Quando Lucas abre as "Sugestões de categoria"
    E recusa a sugestão de "Droga Raia"
    Então a sugestão some
    E a categoria do lançamento continua "Lazer e restaurantes"

  Cenário: Aceite fica no histórico do lançamento
    Dado que Lucas aceitou a sugestão de "Droga Raia"
    Quando Mariana abre o histórico do lançamento de "Droga Raia" em set/2026
    Então vê no histórico "Categoria alterada de Lazer e restaurantes para Saúde por Lucas (sugestão da análise)"

  Cenário: Desfazer devolve a categoria anterior
    Quando Lucas abre as "Sugestões de categoria"
    E aceita a sugestão de "Droga Raia"
    E toca em "Desfazer" no aviso de categoria
    Então o lançamento de "Droga Raia" volta à categoria "Lazer e restaurantes"

  @integration
  Cenário: Fatura paga não impede mudar categoria
    Dado que a compra "Droga Raia" está em uma fatura paga
    Quando Lucas abre as "Sugestões de categoria"
    E aceita a sugestão de "Droga Raia"
    Então o lançamento de "Droga Raia" passa a ter a categoria "Saúde"
