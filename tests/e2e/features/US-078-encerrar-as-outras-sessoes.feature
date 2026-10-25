# language: pt
Funcionalidade: Encerrar as outras sessões
  # DEV-90: não existe tela "Perfil"; a ação vive no menu do usuário (canto superior direito).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas está autenticado
    E que Lucas só tem a sessão deste aparelho

  Cenário: Encerrar as outras sessões mantém só a atual
    Dado que Lucas também está conectado em outro aparelho
    Quando Lucas abre o menu do usuário e toca em "Encerrar as outras sessões"
    Então a confirmação diz "Você continuará conectado só neste aparelho."
    Quando Lucas confirma encerrar
    Então vê o aviso de sessões "1 sessão encerrada"
    E o outro aparelho do Lucas não tem mais sessão
    E este aparelho continua conectado

  Cenário: Cancelar não encerra nada
    Dado que Lucas também está conectado em outro aparelho
    Quando Lucas abre o menu do usuário e toca em "Encerrar as outras sessões"
    E Lucas cancela o encerramento
    Então o outro aparelho do Lucas continua com sessão

  Cenário: Sem outras sessões
    Quando Lucas abre o menu do usuário e toca em "Encerrar as outras sessões"
    E Lucas confirma encerrar
    Então vê o aviso de sessões "0 sessões encerradas"
    E este aparelho continua conectado

  Cenário: Não afeta a sessão de outra pessoa
    Dado que Mariana está conectada no próprio aparelho
    Quando Lucas abre o menu do usuário e toca em "Encerrar as outras sessões"
    E Lucas confirma encerrar
    Então a sessão da Mariana continua ativa
