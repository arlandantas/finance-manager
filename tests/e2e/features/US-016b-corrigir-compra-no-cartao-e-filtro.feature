# language: pt
Funcionalidade: Corrigir compra no cartão e filtrar por cartão

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E uma compra de "R$ 300,00" no cartão "Nubank Mariana" em 15/10/2026
    E hoje é 20/10/2026
    E Mariana está autenticada

  Cenário: Corrigir o valor da compra
    Quando Mariana edita a compra para "R$ 250,00"
    Então o detalhe mostra "Editado por Mariana"
    E o total da fatura "out/2026" passa a "R$ 250,00"
    E o limite disponível passa a "R$ 4.750,00"

  Cenário: Mudar a data para depois do fechamento muda a fatura
    Dado que hoje é 28/10/2026
    Quando Mariana edita a data da compra para 27/10/2026
    Então a compra passa para a fatura de "nov/2026"
    E o total da fatura "out/2026" passa a "R$ 0,00"

  Cenário: Excluir libera o limite
    Quando Mariana exclui a compra
    Então o limite disponível volta a "R$ 5.000,00"
    E a compra some da fatura e do extrato padrão

  Cenário: Restaurar a compra excluída
    Dado que Mariana excluiu a compra
    Quando ela restaura a compra
    Então o limite disponível volta a "R$ 4.700,00"
    E a compra volta à fatura de "out/2026"

  Cenário: Forma de pagamento não é editável
    Quando Mariana abre a edição da compra
    Então o campo "Pagar com" aparece desabilitado com a dica "Para mudar a forma de pagamento, exclua e lance novamente"

  Cenário: Conflito de edição da compra
    Dado que Mariana e Lucas abriram a edição da compra
    Quando Mariana salva um novo valor
    E Lucas tenta salvar outro valor
    Então Lucas vê "Este lançamento foi alterado por Mariana. Recarregue para continuar."

  Cenário: Filtrar o extrato por cartão
    Dado também uma despesa de "R$ 80,00" na conta "Itaú Lucas"
    Quando filtro o extrato pelo cartão "Nubank Mariana"
    Então vejo apenas a compra de "R$ 300,00"
    E o total de despesas do filtro é "R$ 300,00"

  Cenário: Filtrar por conta não mostra compras de cartão
    Quando filtro o extrato pela conta "Itaú Lucas"
    Então a compra no cartão não aparece

  Cenário: Detalhe da compra mostra cartão e fatura
    Quando Mariana abre o detalhe da compra
    Então vê o cartão "Nubank Mariana" e a fatura "out/2026"
    E vejo "Registrado por" e "Pago por"

  Cenário: Acerto recalculado ao excluir compra compartilhada
    Dado a regra de divisão "igualitária" e que a compra de "R$ 300,00" é de Mariana e compartilhada
    Quando Mariana exclui a compra
    Então o acerto de outubro deixa de mostrar dívida por essa compra
