# language: pt
Funcionalidade: Dividir por padrão na categoria e revisar "Só meu" no fechamento do mês (US-044)

  Contexto:
    Dado a família Silva do "Só meu" com a conta "Nubank Conjunta" e Lucas autenticado
    E a família grava o rateio por lançamento

  Cenário: Supermercado já nasce dividido e a escolha manual vale mais que a categoria
    Quando Lucas marca a categoria "Supermercado" para dividir por padrão
    Então vê "Categoria atualizada"
    Quando Lucas abre o formulário de despesa do "Só meu"
    E Lucas escolhe a categoria "Supermercado" no formulário
    Então o seletor "Dividir com a família" marca "Pela regra da família (50% / 50%)"
    Quando Lucas escolhe a categoria "Transporte" no formulário
    Então o seletor "Dividir com a família" marca "Só meu"
    Quando Lucas escolhe a opção "Só meu" do seletor e a categoria "Supermercado" no formulário
    Então o seletor "Dividir com a família" marca "Só meu"

  Cenário: Mês encerrado avisa sobre despesas Só meu, divide um item e dispensa o aviso
    Dado que hoje é 10/11/2026
    E Lucas tem as despesas "Só meu" "Feira" de "R$ 80,00" e "Padaria" de "R$ 45,00" em out/2026
    Quando Lucas abre o acerto de out/2026
    Então o card de revisão diz "2 despesas Só meu neste mês. Revisar?"
    Quando Lucas toca em "Revisar" e divide "Padaria"
    Então a "Padaria" tem cota de "R$ 22,50" para cada membro
    E o card de revisão diz "1 despesa Só meu neste mês. Revisar?"
    Quando Lucas dispensa o aviso com "Não perguntar de novo para este mês"
    Então o aviso de revisão some
