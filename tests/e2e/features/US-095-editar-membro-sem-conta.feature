# language: pt
Funcionalidade: Editar o membro sem acesso ao app

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" (Administradora) e "Lucas" (Membro) para o cadastro
    E Mariana está autenticada na tela Família

  Cenário: Administrador renomeia o membro sem acesso
    Dado que existe o membro "Ana" sem e-mail para editar
    Quando Mariana edita "Ana" trocando o nome para "Ana Paula"
    Então a lista da família mostra "Ana Paula" com o selo "Sem acesso ao app"
    E a lista da família não mostra mais "Ana" como membro

  Cenário: Administrador remove o e-mail do membro sem acesso
    Dado que existe o membro "Bia" com o e-mail para editar "bia@exemplo.com"
    Quando Mariana edita "Bia" removendo o e-mail
    Então "Bia" continua na lista sem mostrar o e-mail
