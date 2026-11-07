# language: pt
Funcionalidade: Filtrar o Extrato por tag (US-047)

  Contexto:
    Dado a família Silva com lançamentos de julho de 2026 e as tags da viagem
    E Lucas está autenticado no Extrato de julho de 2026

  Cenário: Filtrar por uma tag
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então a lista mostra "Hotel", "Restaurante" e "Passagem"
    E a lista não mostra "Mercado"

  Cenário: Total do filtro
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então o total de despesas do filtro é "R$ 1.650,00"

  @integration
  Cenário: Duas tags contam cada lançamento uma vez
    Quando Lucas filtra pelas tags "viagem-nordeste" e "ferias"
    Então a lista mostra "Passagem" uma única vez
    E o total de despesas do filtro é "R$ 1.650,00"

  @integration
  Cenário: Combinar tag com categoria
    Quando Lucas filtra pela tag "viagem-nordeste"
    E Lucas filtra pela categoria "Transporte"
    Então a lista mostra apenas "Passagem"

  Cenário: Tag sem lançamentos no período
    Quando Lucas filtra pela tag "ferias" no Extrato de agosto de 2026
    Então vê a mensagem do filtro "Nenhum lançamento com essa tag neste período"

  @integration
  Cenário: Excluído não entra no total
    Dado que "Hotel" foi excluído
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então o total de despesas do filtro é "R$ 850,00"

  Cenário: Filtro na URL
    Quando Lucas filtra pela tag "viagem-nordeste" e recarrega a página
    Então o filtro de tag "viagem-nordeste" continua aplicado

  Cenário: Chip Sem tag vindo da Análise
    Quando Lucas abre o Extrato pelo link de "Sem tag" de julho de 2026
    Então a lista mostra apenas "Mercado"
    E o chip "Sem tag" está aplicado

  @integration
  Cenário: Sem tag não combina com uma tag escolhida
    Dado que Lucas abriu o Extrato pelo link de "Sem tag"
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então vê a mensagem do filtro "Use tags ou \"sem tag\", não os dois"

  Cenário: Limpar o filtro de tag
    Dado que Lucas filtrou pela tag "viagem-nordeste"
    Quando Lucas toca em "Limpar filtros" do Extrato
    Então a lista mostra "Mercado" de novo
