# language: pt
Funcionalidade: Lista de assinaturas e total mensal

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E o cartão "Itaú Lucas" de Lucas com fechamento dia 20 e vencimento dia 28
    E hoje é 05/11/2026
    E a família tem as assinaturas ativas "Netflix" de "R$ 55,90" (Mariana, Nubank Mariana), "Spotify" de "R$ 21,90" (Lucas, Nubank Mariana) e "Hulu" de "R$ 39,90" (Lucas, Itaú Lucas)
    E outra família tem a assinatura "Disney" de "R$ 99,90"
    E Lucas está autenticado

  Cenário: Total mensal, total por cartão e uma linha por assinatura
    Quando Lucas abre a lista de assinaturas
    Então o total por mês é "R$ 117,70"
    E a lista tem as assinaturas "Netflix", "Hulu" e "Spotify"
    E o cartão "Nubank Mariana" soma "R$ 77,80" e o cartão "Itaú Lucas" soma "R$ 39,90"
    E a lista de assinaturas não mostra "Disney"

  Cenário: Filtrar por quem gastou recorta lista e totais
    Quando Lucas abre a lista de assinaturas
    E Lucas filtra por quem gastou "Lucas Silva"
    Então o total por mês é "R$ 61,80"
    E a lista tem as assinaturas "Hulu" e "Spotify"

  Cenário: Segundo membro vê tudo, mas edita só o que controla
    Quando Lucas abre a lista de assinaturas
    Então a assinatura "Netflix" não tem ação de editar
    E a assinatura "Spotify" tem ação de editar

  Cenário: Encerradas ficam em outra aba, somente leitura
    Dado a assinatura "Netflix" foi encerrada em 04/11/2026
    Quando Lucas abre a lista de assinaturas
    Então o total por mês é "R$ 61,80"
    Quando Lucas abre a aba "Encerradas"
    Então a lista tem as assinaturas "Netflix"
    E a assinatura "Netflix" mostra "Encerrada em 04/11/2026" sem ação de editar

  Cenário: Sem assinaturas orienta o cadastro
    Dado a família não tem assinaturas
    Quando Lucas abre a lista de assinaturas
    Então a lista de assinaturas mostra "Nenhuma assinatura. Cadastre a primeira"

  Cenário: Valores ocultos mascaram totais e linhas
    Quando Lucas abre a lista de assinaturas
    E Lucas oculta os valores
    Então o total por mês é "R$ •••••"
    E nenhuma linha da lista mostra valor

  Cenário: A lista cabe em 375 px no tema escuro
    Dado a tela tem 375 por 800 pixels
    E o tema do sistema é escuro
    Quando Lucas abre a lista de assinaturas
    Então a lista não tem rolagem horizontal e não há erros no console
