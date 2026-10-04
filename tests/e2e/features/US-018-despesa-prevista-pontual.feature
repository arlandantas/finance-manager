# language: pt
Funcionalidade: Despesa prevista

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E os membros "Mariana" e "Lucas"
    E Lucas está autenticado
    E hoje é 28/10/2026

  Cenário: Cadastrar despesa prevista
    Quando Lucas cadastra "Condomínio" de "R$ 650,00" com vencimento em 10/11/2026, categoria "Moradia" e responsável "Lucas"
    Então a despesa prevista aparece em "Contas a pagar" de novembro com estado "Previsto"
    E aparece o aviso "Despesa prevista cadastrada!"

  Cenário: Responsável padrão
    Quando Lucas cadastra uma despesa prevista sem escolher o responsável
    Então o responsável é "Lucas"

  Cenário: Registrar em nome de outro responsável
    Quando Lucas cadastra "Escola" de "R$ 1.200,00" com responsável "Mariana"
    Então o responsável pelo pagamento é "Mariana" e o autor é "Lucas"

  Cenário: Previsão não mexe no saldo, extrato, totais nem acerto
    Quando Lucas cadastra "Condomínio" de "R$ 650,00" com vencimento em 10/11/2026
    Então o saldo de "Itaú Lucas" continua "R$ 3.000,00"
    E a despesa não aparece no extrato
    E o total de despesas do mês não muda
    E o acerto de contas não muda

  Cenário: Vencimento passado fica atrasado
    Quando Lucas cadastra "Internet" de "R$ 120,00" com vencimento em 20/10/2026
    Então o item aparece com o destaque "Atrasada" e continua com estado "Previsto"

  Cenário: Campos obrigatórios
    Quando Lucas tenta salvar sem descrição, sem valor e sem categoria
    Então vê "Informe a descrição"
    E vê "Informe um valor maior que zero"
    E vê "Escolha uma categoria"
    E nada é cadastrado

  Cenário: Descrição muito curta
    Quando Lucas informa a descrição "A"
    Então vê "A descrição deve ter no mínimo 2 caracteres"

  Cenário: Editar despesa prevista
    Dado a despesa prevista "Condomínio" de "R$ 650,00"
    Quando Lucas altera o valor para "R$ 680,00" e o vencimento para 12/11/2026
    Então a previsão mostra "R$ 680,00" com vencimento em 12/11/2026

  Cenário: Excluir despesa prevista
    Dado a despesa prevista "Condomínio" de "R$ 650,00"
    Quando Lucas toca em "Excluir" e confirma "Excluir despesa prevista?"
    Então ela some de "Contas a pagar"

  Cenário: Conflito de edição
    Dado que Lucas e Mariana abriram a edição da previsão "Condomínio"
    Quando Mariana salva um novo valor
    E Lucas tenta salvar outro valor
    Então Lucas vê "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar."

  Cenário: Lista por mês de vencimento com total
    Dado as previsões "Condomínio" de "R$ 650,00" em 10/11/2026 e "Escola" de "R$ 1.200,00" em 05/11/2026
    Quando Lucas abre "Contas a pagar" de novembro
    Então vê "Escola" antes de "Condomínio"
    E vê o total a pagar "R$ 1.850,00"

  Cenário: Bloco "A pagar" na Home
    Dado a previsão "Internet" de "R$ 120,00" atrasada, "Luz" de "R$ 200,00" com vencimento em 30/10/2026 e "Condomínio" de "R$ 650,00" em 10/11/2026
    Quando Lucas abre a Home
    Então o bloco "A pagar" mostra "Internet" como atrasada e "Luz" vencendo em 30/10
    E não mostra "Condomínio", que vence depois de 7 dias

  Cenário: Faturas fechadas aparecem em "A pagar"
    Dado a fatura "out/2026" do cartão "Nubank Mariana" fechada com total "R$ 400,00" e vencimento 05/11/2026
    Quando Lucas abre "Contas a pagar" de novembro
    Então vê o item "Fatura Nubank Mariana" de "R$ 400,00" vencendo em 05/11

  Cenário: Dividir com a família desligado
    Quando Lucas cadastra a previsão "Plano de saúde de Lucas" de "R$ 300,00" com "Dividir com a família" desligado
    Então a previsão fica marcada como "Pessoal"

  Cenário: Nenhuma despesa prevista
    Dado que a família não tem despesas previstas
    Quando Lucas abre "Contas a pagar"
    Então vê "Nenhuma conta a pagar neste mês" com o botão "Nova despesa prevista"

  Cenário: Duplo clique não duplica
    Quando Lucas toca duas vezes rapidamente em "Salvar" na nova previsão
    Então apenas uma previsão é cadastrada

  Cenário: Membro comum também cadastra
    Dado que Lucas é "Membro" e não "Administrador"
    Quando Lucas cadastra uma despesa prevista
    Então ela é cadastrada

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar" na nova previsão
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a previsão "Aluguel"
    Quando Lucas abre "Contas a pagar"
    Então não vê a previsão "Aluguel"
