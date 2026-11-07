# language: pt
Funcionalidade: Dividir no lançamento: Só meu, Pela regra ou De outro jeito

  Contexto:
    Dado a família Silva do "Só meu" com a conta "Nubank Conjunta" e Lucas autenticado
    E a família grava o rateio por lançamento

  Cenário: Seletor mostra os três modos e o De outro jeito grava 100% / 0%
    Quando Lucas abre o formulário de despesa do "Só meu"
    Então o seletor "Dividir com a família" oferece "Só meu", "Pela regra da família (50% / 50%)" e "De outro jeito"
    E o seletor "Dividir com a família" marca "Só meu"
    Quando Lucas escolhe "De outro jeito" com Lucas "60" e Mariana "30"
    Então vê "Os percentuais precisam somar 100%" e não consegue salvar
    Quando Lucas corrige para Lucas "100" e Mariana "0" e salva "R$ 200,00" em "Supermercado"
    Então a despesa mais recente é "De outro jeito" e a cota de Lucas é "R$ 200,00" e a de Mariana "R$ 0,00"
