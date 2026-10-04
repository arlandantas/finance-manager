# language: pt
Funcionalidade: Login com Google

  Cenário: Primeiro acesso de pessoa sem família nem convite
    Dado que "mariana@exemplo.com" nunca acessou o sistema
    E não existe convite pendente para esse e-mail
    Quando ela clica em "Entrar com o Google" e autoriza
    Então uma conta de usuário é criada com o nome, o e-mail e a foto do Google
    E ela é levada ao onboarding para criar a família

  Cenário: Acesso de membro que já tem família
    Dado que "lucas@exemplo.com" já pertence à "Família Silva"
    Quando ele entra com o Google
    Então ele chega à Home da "Família Silva"
    E vê seu nome e sua foto no cabeçalho

  Cenário: Sessão persistente
    Dado que Lucas entrou ontem e não saiu
    Quando ele reabre o navegador e acessa o sistema
    Então ele continua autenticado, sem tela de login

  Cenário: Rota protegida sem sessão
    Dado que não há sessão ativa
    Quando acesso diretamente a tela "Contas"
    Então sou redirecionado ao login
    E após entrar, volto para a tela "Contas"

  Cenário: Usuário cancela no Google
    Dado que estou na tela de login
    Quando clico em "Entrar com o Google" e cancelo na janela do Google
    Então volto ao login com a mensagem "Não foi possível entrar. Tente novamente."
    E nenhuma conta é criada

  Cenário: E-mail Google não verificado
    Dado uma conta Google cujo e-mail não está verificado
    Quando tento entrar
    Então o acesso é negado com mensagem clara
    E nenhuma conta é criada

  Cenário: Login de teste em desenvolvimento local
    Dado que o ambiente é local com "AUTH_DEV_LOGIN=true"
    Quando escolho um usuário de teste na tela de login
    Então sou autenticado sem passar pelo Google
    E o fluxo seguinte (família ou convite) é o mesmo do login Google

  @integration
  Cenário: Login de teste indisponível em produção
    Dado que o ambiente é de produção ("NODE_ENV=production")
    Então a opção de login de teste não é exibida
    E tentativas diretas de usá-la são rejeitadas

  Cenário: Sair do sistema
    Dado que estou autenticado
    Quando clico em "Sair"
    Então a sessão é encerrada
    E sou levado à tela de login
