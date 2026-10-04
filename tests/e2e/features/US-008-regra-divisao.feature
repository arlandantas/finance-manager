# language: pt
Funcionalidade: Regra de divisão familiar

  Cenário: Padrão igualitário
    Dado uma família recém-criada com Mariana e Lucas
    Quando abro "Regra de divisão"
    Então vejo "Dividir igualmente (50% / 50%)" selecionado

  Cenário: Definir divisão proporcional
    Dado que sou Administrador
    Quando escolho "Proporcional" e informo Mariana "60%" e Lucas "40%"
    Então a regra é salva

  Cenário: Percentuais não somam 100%
    Dado que sou Administrador na tela "Regra de divisão"
    Quando informo Mariana "60%" e Lucas "30%" e tento salvar
    Então vejo "Os percentuais precisam somar 100%"
    E a regra anterior é mantida

  Cenário: Percentual inválido
    Dado que sou Administrador na tela "Regra de divisão"
    Quando informo "-10%" ou "110%" para um membro
    Então vejo "Informe um percentual entre 0% e 100%"

  Cenário: Membro sem permissão
    Dado que Lucas tem papel "Membro"
    Quando ele abre "Regra de divisão"
    Então vê a regra em modo somente leitura
