# language: pt
Funcionalidade: Polimento da homologação

  Contexto:
    Dado a família do polimento com Mariana Administradora e Lucas Membro

  Cenário: Erro de valor some ao corrigir sem saltar o layout
    Quando Mariana tenta transferir "R$ 0,00" e vê "Informe um valor maior que zero"
    E anota a posição do campo abaixo do valor
    E Mariana digita "R$ 200,00" no valor da transferência
    Então a mensagem "Informe um valor maior que zero" desaparece
    E a posição do campo abaixo do valor não muda

  Cenário: Categorias no menu de configurações
    Quando Mariana abre o menu do avatar do polimento
    Então vê "Configurações" e dentro dele "Categorias"

  Cenário: Copiar link rotaciona o token e avisa
    Dado um convite pendente do polimento para "vovo@example.com"
    Quando Mariana toca em "Copiar link" no convite do polimento
    Então vê o aviso "Link copiado" com "O link anterior deixa de valer."
    E o link anterior não abre mais o convite

  Cenário: Reenviar e-mail e limite de reenvios
    Dado um convite pendente do polimento para "vovo@example.com"
    Quando Mariana toca em "Reenviar e-mail" no convite do polimento
    Então vê o aviso "E-mail reenviado" com "O link anterior deixa de valer."
    Dado que o convite já foi reenviado 3 vezes
    Quando Mariana recarrega a tela Família e toca em "Reenviar e-mail" no convite do polimento
    Então vê o erro de convite "Limite de reenvios atingido. Cancele e crie um novo convite."

  Cenário: Convite vencido não é copiado
    Dado um convite pendente do polimento para "vovo@example.com" vencido
    Quando Mariana abre a tela Família do polimento
    Então o botão do convite "Copiar link" fica desabilitado

  Cenário: Aviso da conta Google no formulário de convite
    Quando Mariana abre o formulário de convite do polimento
    Então vê "A pessoa precisa entrar com a conta Google do mesmo e-mail"

  Cenário: Membro não reenvia convite
    Dado um convite pendente do polimento para "vovo@example.com"
    Quando Lucas abre a tela Família do polimento
    Então não vê "Reenviar e-mail" nem "Copiar link"

  Cenário: Limpar filtros só aparece com filtro ativo
    Quando Mariana abre o Extrato do polimento
    Então não vê o botão "Limpar filtros"
    Quando Mariana filtra o Extrato por membro "Lucas"
    Então o filtro de membro anuncia "Membro: Lucas" e o botão "Limpar filtros" aparece
    Quando Mariana toca em "Limpar filtros" do Extrato
    Então o filtro de membro anuncia "Membro: todos" e o botão "Limpar filtros" some
