# language: pt
Funcionalidade: Atribuir contas e lançamentos ao membro sem conta (093a e 093b)

  Contexto:
    Dado a "Família Silva" com "Mariana" (Administradora), "Lucas" (Membro) e o membro sem conta "Ana" para a atribuição
    E Mariana está autenticada para a atribuição

  Cenário: Conta com titular sem conta
    Quando Mariana cadastra a conta "Poupança Ana" com titular "Ana"
    Então a conta "Poupança Ana" mostra o titular "Ana" com o selo "Sem acesso ao app"

  Cenário: Cartão com titular sem conta
    Quando Mariana cadastra o cartão "Itaú Ana" com titular "Ana"
    Então o cartão "Itaú Ana" mostra o titular "Ana" com o selo "Sem acesso ao app"

  Cenário: Despesa paga por quem ainda não tem conta
    Dado a conta "Poupança Ana" de "Ana" para a atribuição
    Quando Mariana lança "Mercado" de "R$ 200,00" pela conta "Poupança Ana" com "Quem pagou?: Ana" e dividida entre os três
    Então "Ana" aparece como pagadora no detalhe do Extrato
    E o autor registrado é "Mariana"

  Cenário: Membro sem conta entra no acerto
    Dado uma despesa dividida de "R$ 300,00" paga por "Ana" entre "Mariana", "Lucas" e "Ana"
    Quando Mariana abre o Acerto para a atribuição
    Então "Ana" aparece com crédito de "R$ 200,00" e o selo "Sem acesso ao app"
    E "Mariana" e "Lucas" aparecem devendo "R$ 100,00" cada

  @integration
  Cenário: Acerto desligado não inclui ninguém
    Dado uma despesa dividida de "R$ 300,00" paga por "Ana" entre "Mariana", "Lucas" e "Ana"
    E que o acerto de contas está desligado para a atribuição
    Quando Mariana abre a Home para a atribuição
    Então não aparece linha de acerto com "Ana"

  Cenário: Prevista com responsável sem conta
    Quando Mariana cadastra a prevista "Mesada" de "R$ 100,00" com responsável "Ana"
    Então a prevista "Mesada" mostra o responsável "Ana" com o selo "Sem acesso ao app"

  Cenário: Filtro por quem pagou inclui o membro sem conta
    Quando Mariana abre o filtro de pessoa no Extrato
    Então "Ana · sem acesso ao app" aparece como opção

  @integration
  Cenário: Só meu de membro sem conta é controlado por quem lançou
    Dado que Mariana lançou uma despesa "Só meu" com pagador "Ana"
    Quando Lucas tenta excluir essa despesa
    Então vê que apenas quem controla pode alterar
    E Mariana consegue excluí-la

  @integration
  Cenário: Pagador sem conta só pelo lançador ou Administrador
    Dado que Lucas lançou uma despesa
    Quando Lucas tenta definir "Ana" como pagadora de uma despesa lançada por Mariana
    Então vê a dica de pagador "Apenas quem lançou ou o Administrador pode definir este pagador"
