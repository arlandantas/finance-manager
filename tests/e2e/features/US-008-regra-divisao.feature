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
    E o painel de acerto passa a usar 60% / 40%

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

  Cenário: Novo membro entra na família
    Dado a regra proporcional 60% / 40% e um terceiro membro convidado que aceita
    Então o sistema solicita ao Administrador que redefina os percentuais
    E enquanto isso o acerto exibe aviso "Regra de divisão desatualizada"

  Cenário: Mudança de regra não altera meses passados
    Dado o acerto de setembro calculado com a regra 50% / 50%
    Quando o Administrador define 60% / 40% com vigência a partir de outubro
    Então o acerto de setembro continua calculado com 50% / 50%
    E os lançamentos de outubro em diante usam 60% / 40%
