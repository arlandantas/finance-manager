# language: pt
Funcionalidade: Parcelamento com parcelas já pagas (US-065)

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com fechamento dia 25, vencimento dia 5 e limite de "R$ 5.000,00"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Campo de parcelas já pagas aparece só com parcelamento
    Dado que Lucas abre "Nova despesa" e escolhe o cartão "Nubank Lucas"
    Quando Lucas escolhe "10x" parcelas
    Então vê o campo "Parcelas já pagas" com valor 0

  Cenário: Campo não aparece em compra à vista
    Dado que Lucas abre "Nova despesa" e escolhe o cartão "Nubank Lucas"
    Quando Lucas escolhe "1x" parcela
    Então não vê o campo "Parcelas já pagas"

  Cenário: Prévia mostra o saldo restante
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    Quando Lucas informa "4" parcelas já pagas
    Então vê a prévia "Restam 6 parcelas de R$ 250,00 · a próxima (5/10) na fatura de nov/2026"

  Cenário: Só as parcelas restantes viram lançamentos
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    E informa "4" parcelas já pagas
    Quando Lucas salva a despesa
    Então a fatura de nov/2026 mostra "Sofá 5/10 R$ 250,00"
    E a fatura de abr/2027 mostra "Sofá 10/10 R$ 250,00"

  Cenário: Nada é criado em meses passados
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas abre o Extrato de out/2026
    Então não vê nenhuma linha "Sofá"

  Cenário: Saldos das contas não mudam
    Dado que a conta "Itaú Lucas" tem saldo de "R$ 1.000,00"
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Então o saldo da conta "Itaú Lucas" continua "R$ 1.000,00"

  Cenário: Limite consumido só pelo saldo restante
    Dado que o limite disponível do cartão "Nubank Lucas" é "R$ 5.000,00"
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Então o limite disponível do cartão "Nubank Lucas" é "R$ 3.500,00"

  Cenário: Pagas não podem ser todas as parcelas
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    Quando Lucas informa "10" parcelas já pagas
    Então vê o erro "Informe menos parcelas pagas do que o total do parcelamento"
    E o botão de salvar fica desabilitado

  Cenário: Ver compra identifica as parcelas anteriores ao app
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas abre "Ver compra" na parcela "5/10"
    Então vê "Parcelas 1 a 4: anteriores ao app (já pagas)"
    E vê as parcelas "5/10" a "10/10" com suas faturas

  Cenário: Excluir a compra remove só as restantes
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas escolhe "Excluir compra parcelada" e confirma
    Então a fatura de nov/2026 não mostra mais "Sofá"
    E o limite disponível do cartão "Nubank Lucas" volta a "R$ 5.000,00"

  Cenário: Parcelado com parcelas pagas fica fora do acerto enquanto for Só meu
    Dado que o acerto de contas está ligado
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas sem dividir
    Então o acerto de nov/2026 não muda

  @depende-us-042 @skip
  Cenário: Restantes entram no acerto e as pagas não
    Dado que o acerto de contas está ligado e a regra de divisão é igual
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas dividindo com a família
    Então o acerto de nov/2026 considera "R$ 250,00" pago por Lucas
    E o acerto de out/2026 não muda
