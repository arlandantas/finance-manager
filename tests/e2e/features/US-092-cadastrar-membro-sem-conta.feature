# language: pt
Funcionalidade: Cadastrar membro sem conta ativa

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" (Administradora) e "Lucas" (Membro) para o cadastro
    E Mariana está autenticada na tela Família

  Cenário: Administrador cadastra membro só com o nome
    Quando Mariana cadastra o membro "Ana"
    Então vê "Ana" na lista de membros com o selo "Sem acesso ao app"
    E "Ana" não recebe nenhum e-mail

  Cenário: Membro cadastrado aparece nos seletores de pessoa
    Dado que Mariana cadastrou o membro "Ana"
    Quando Mariana abre o formulário "Nova despesa" para ver as pessoas
    Então "Ana" aparece em "Quem pagou?" e em "Responsável pelo pagamento"

  Cenário: E-mail é opcional
    Quando Mariana cadastra o membro "Ana" com o e-mail "ana@exemplo.com"
    Então "Ana" é cadastrada com o e-mail guardado só para o convite

  Cenário: Só o Administrador cadastra
    Dado que Lucas está autenticado
    Quando Lucas abre a tela "Família" para o cadastro
    Então não vê a ação de cadastro "Cadastrar membro"

  Cenário: Nome repetido
    Dado que existe o membro "Ana"
    Quando Mariana cadastra o membro "ana"
    Então vê "Já existe um membro com este nome"

  @integration
  Cenário: E-mail que já é de outro membro
    Dado que "Lucas" usa o e-mail "lucas@exemplo.com"
    Quando Mariana cadastra o membro "Lucas Filho" com o e-mail "lucas@exemplo.com"
    Então vê "Este e-mail já pertence a outro membro"

  @integration
  Cenário: Membro sem conta nunca é Administrador
    Dado que Mariana cadastrou o membro "Ana"
    Quando Mariana abre o menu de "Ana"
    Então a ação "Tornar Administrador" não está disponível no menu do membro

  Cenário: Registro no histórico
    Quando Mariana cadastra o membro "Ana"
    Então o histórico da família mostra "Mariana cadastrou Ana (sem acesso ao app)"

  Cenário: Aviso de divisão igual no cadastro
    Quando Mariana abre o cadastro de membro
    E digita o nome "Ana"
    Então vê o aviso de divisão "A divisão igual passará a incluir Ana nas despesas novas"
