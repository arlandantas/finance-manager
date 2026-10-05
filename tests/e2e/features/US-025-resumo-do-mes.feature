# language: pt
Funcionalidade: Resumo do Mês na Home

  Contexto:
    Dado contas do resumo "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50) e hoje 12/10/2026

  Cenário: Resumo do mês corrente com os cinco números
    Dado receita de "R$ 5.000,00" e despesa de "R$ 1.200,00" em outubro
    E previstas de "R$ 650,00" e "R$ 129,90" com vencimento em outubro
    E uma fatura de "R$ 479,00" com vencimento em 15/10/2026
    Quando abro a Home do resumo
    Então o resumo mostra receitas "R$ 5.000,00" e despesas "R$ 1.200,00"
    E o resumo mostra resultado "R$ 3.800,00" e a pagar "R$ 1.258,90"
    E o resumo mostra saldo previsto "R$ 9.890,60"
    E o resumo mostra a linha de faturas "R$ 479,00"
    E vê junto ao saldo previsto "Saldo atual menos o que ainda vai pagar neste mês"

  Cenário: Saldo alto não esconde conta a pagar
    Dado receita de "R$ 0,00" e despesa de "R$ 0,00" em outubro
    E previstas de "R$ 9.000,00" e "R$ 129,90" com vencimento em outubro
    Quando abro a Home do resumo
    Então o resumo mostra saldo previsto "-R$ 1.780,40" em atenção com "Seu saldo não cobre o que falta pagar"

  Cenário: Itens atrasados são destacados
    Dado receita de "R$ 0,00" e despesa de "R$ 0,00" em outubro
    E previstas de "R$ 129,90" e "R$ 10,00" com vencimento em 04/10/2026
    Quando abro a Home do resumo
    Então o resumo mostra "2 atrasadas" com o selo "Atrasada"

  Cenário: Navegar para o mês anterior e para um mês sem movimento
    Dado receita de "R$ 0,00" e despesa de "R$ 900,00" em setembro
    Quando abro a Home do resumo
    E navego para o mês anterior no resumo
    Então o título do resumo é "Setembro de 2026" e despesas "R$ 900,00"
    Quando navego duas vezes para o mês seguinte no resumo
    Então o título do resumo é "Novembro de 2026" e vê "Nada lançado neste mês ainda"

  Cenário: Erro ao carregar o resumo mantém o botão de lançar
    Dado que o serviço da Home está indisponível
    Quando abro a Home do resumo
    Então vê o erro do resumo com o botão "Tentar de novo" e o botão "Novo lançamento" disponível
