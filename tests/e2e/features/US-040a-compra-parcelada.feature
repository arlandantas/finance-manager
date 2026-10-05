# language: pt
Funcionalidade: Compra parcelada no cartão (US-040a)

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E os membros "Mariana" e "Lucas"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Prévia das parcelas
    Quando Lucas abre a despesa no cartão, digita "R$ 2.500,00" e escolhe "10x" parcelas
    Então vê a prévia "10x de R$ 250,00 · 1ª na fatura de nov/2026"

  Cenário: Compra parcelada gera uma parcela por fatura
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x" na categoria "Outros"
    Então a fatura de nov/2026 mostra "Notebook 1/10 R$ 250,00"
    E a fatura de dez/2026 mostra "Notebook 2/10 R$ 250,00"
    E a fatura de ago/2027 mostra "Notebook 10/10 R$ 250,00"

  Cenário: Limite consumido pelo total
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x"
    Então o limite do cartão "Nubank Lucas" passa a "R$ 2.500,00"

  Cenário: Centavos de arredondamento vão para a primeira parcela
    Quando Lucas lança "Presente" de "R$ 1.000,01" em "3x"
    Então as parcelas são "R$ 333,35" e "R$ 333,33" e "R$ 333,33"
    E a soma das parcelas é "R$ 1.000,01"

  Cenário: Compra à vista continua como antes
    Quando Lucas lança "Mercado" de "R$ 90,00" em "1x"
    Então a fatura de nov/2026 mostra "Mercado R$ 90,00" sem rótulo de parcela

  Cenário: Compra depois do fechamento começa na fatura seguinte
    Dado que hoje é 28/11/2026
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x"
    Então a prévia mostrou "1ª na fatura de dez/2026"
    E a fatura de dez/2026 mostra "Notebook 1/10 R$ 250,00"

  Cenário: Parcela cai no mesmo dia dos meses seguintes ajustando o fim do mês
    Dado que hoje é 31/01/2027
    Quando Lucas lança "Curso" de "R$ 600,00" em "3x"
    Então a parcela 2 tem data 28/02/2027
    E a parcela 3 tem data 31/03/2027

  Cenário: Cada parcela cai numa fatura diferente com fechamento no dia 28
    Dado o cartão "Visa Silva" com fechamento dia 28 e vencimento dia 10
    E que hoje é 31/01/2027
    Quando Lucas lança "Curso" de "R$ 600,00" em "3x" no cartão "Visa Silva"
    Então a parcela 1 está na fatura de fev/2027
    E a parcela 2 está na fatura de mar/2027
    E a parcela 3 está na fatura de abr/2027

  Cenário: Pagar a fatura libera só a parcela paga
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 foi fechada e paga
    Quando Lucas abre a lista de cartões
    Então o limite do cartão "Nubank Lucas" passa a "R$ 2.750,00"

  Cenário: Total acima do limite avisa e deixa confirmar
    Quando Lucas tenta salvar "Viagem" de "R$ 6.000,00" em "12x"
    Então vê o aviso de limite "Esta compra passa do limite disponível" com o botão "Confirmar mesmo assim"

  Cenário: Parcelas futuras na fatura e no cartão
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre a fatura de nov/2026 do cartão
    Então a fatura mostra "Parcelas futuras: R$ 2.250,00"
    E o cartão "Nubank Lucas" mostra "Parcelas futuras" de "R$ 2.250,00"

  @integration
  Cenário: Número de parcelas inválido
    Quando Lucas informa "25" parcelas
    Então vê "Escolha de 1 a 24 parcelas"

  Cenário: Compra parcelada fica Só meu até a divisão estar disponível
    Dado que a divisão de compras parceladas ainda não foi liberada
    Quando Lucas escolhe "3x" parcelas
    Então o campo "Dividir com a família" mostra "Disponível em breve para compras parceladas"

  Cenário: Duplo clique não cria duas compras
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa" com "R$ 2.500,00" em "10x"
    Então existe uma única compra parcelada com 10 parcelas

  Cenário: Falha de rede
    Dado que não há conexão
    Quando Lucas confirma a compra parcelada
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E nenhuma compra parcelada é registrada

  @integration
  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Lucas tenta lançar uma compra parcelada no cartão "Visa Souza" por endereço direto
    Então vê "Não encontrado"
