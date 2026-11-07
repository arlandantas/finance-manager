# language: pt
Funcionalidade: Convidar o membro sem acesso ao app

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" (Administradora) e "Lucas" (Membro) para o cadastro
    E Mariana está autenticada na tela Família

  Cenário: Administrador convida o membro sem acesso
    Dado que existe o membro "Ana" com o e-mail cadastrado "ana@exemplo.com"
    Quando Mariana convida "Ana" pelo menu
    Então vê o aviso do convite "Quem aceitar assume o histórico de Ana."
    E o campo e-mail já vem com "ana@exemplo.com"
    Quando Mariana envia o convite vinculado
    Então "Ana" mostra o selo "Convite pendente" com "Reenviar e-mail", "Copiar link" e "Cancelar convite"

  Cenário: Cancelar o convite permite convidar de novo
    Dado que existe o membro "Ana" com o e-mail cadastrado "ana@exemplo.com"
    E Mariana já convidou "Ana"
    Quando Mariana cancela o convite de "Ana"
    Então "Ana" não mostra mais o selo "Convite pendente"
    E "Ana" volta a ter a ação "Convidar" no menu
