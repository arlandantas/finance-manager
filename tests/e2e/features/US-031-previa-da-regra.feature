# language: pt
Funcionalidade: Prévia da regra de divisão

  Contexto:
    Dado a família da prévia com Mariana Administradora e Lucas e hoje 12/10/2026

  Cenário: Prévia mostra vigência e impacto no mês corrente
    Dado uma despesa comum da prévia de "R$ 1.000,00" paga por Lucas em 10/10/2026
    E uma despesa comum da prévia de "R$ 500,00" paga por Lucas em 12/10/2026
    Quando Mariana informa os percentuais "58" e "42" sem salvar
    Então a prévia mostra "Vale a partir de 12/10/2026. Lançamentos anteriores não mudam."
    E a prévia mostra "Impacto no acerto de outubro: R$ 40,00"

  Cenário: Sem lançamentos a partir da vigência o impacto é zero
    Dado uma despesa comum da prévia de "R$ 1.000,00" paga por Lucas em 10/10/2026
    Quando Mariana informa os percentuais "58" e "42" sem salvar
    Então a prévia mostra "Impacto no acerto de outubro: R$ 0,00"

  Cenário: Sugestão pela renda e edição manual
    Quando Mariana sugere pela renda "R$ 6.500,00" e "R$ 4.800,00"
    Então os percentuais ficam "58" e "42"
    E vê a nota "As rendas informadas não são guardadas"
    Quando Mariana informa os percentuais "60" e "40" sem salvar
    Então os percentuais ficam "60" e "40"

  Cenário: Percentuais que não somam cem desabilitam o salvar
    Quando Mariana informa os percentuais "60" e "50" sem salvar
    Então vê o erro "Os percentuais precisam somar 100%" e o botão "Salvar regra" desabilitado

  Cenário: Salvar volta ao painel e o botão de lançar não cobre o salvar
    Dado a tela de regra em 375 px
    Quando Mariana informa os percentuais "58" e "42" sem salvar
    Então o botão "Novo lançamento" não aparece e "Salvar regra" está visível
    Quando Mariana salva a regra
    Então volta ao painel de Acerto com o aviso "Regra de divisão atualizada"
