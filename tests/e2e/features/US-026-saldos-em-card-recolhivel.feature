# language: pt
@valores-ocultos
Funcionalidade: Card de saldos das contas

  Contexto:
    Dado contas do resumo "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50) e hoje 12/10/2026
    E os valores dos saldos estão visíveis

  Cenário: Card começa recolhido com o total
    Quando abro a Home do resumo
    Então o card de saldos está recolhido com o total "R$ 7.349,50" e sem lista de contas

  Cenário: Expandir e recolher
    Quando abro a Home do resumo
    E toco no card de saldos
    Então o card de saldos lista "Itaú Mariana" "R$ 6.500,00" e "Nubank Conjunta" "R$ 849,50"
    Quando toco no card de saldos
    Então o card de saldos está recolhido com o total "R$ 7.349,50" e sem lista de contas

  Cenário: A escolha é lembrada no dispositivo e não vale para outro
    Quando abro a Home do resumo
    E toco no card de saldos
    E recarrego a Home do resumo
    Então o card de saldos está expandido
    Quando abro a Home em um celular que nunca usou
    Então o card de saldos está recolhido no outro dispositivo

  Cenário: Teclado com Enter alterna e anuncia o estado
    Quando abro a Home do resumo
    E foco o card de saldos e pressiono Enter
    Então o card de saldos está expandido
