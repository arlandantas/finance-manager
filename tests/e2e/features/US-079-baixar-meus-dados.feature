# language: pt
Funcionalidade: Baixar meus dados
  # DEV-101: não havia tela "Perfil"; ela nasce em /perfil (item "Perfil e meus dados" do menu do usuário).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas está autenticado

  Cenário: Baixar o arquivo
    Quando Lucas abre o Perfil e toca em "Baixar meus dados"
    Então o navegador baixa o arquivo "meus-dados-2026-10-04.json"

  @integration
  Cenário: Conteúdo do arquivo de um membro ativo
    Dado que Lucas fez um lançamento de "R$ 150,50" na conta "Itaú Lucas"
    Quando Lucas abre o Perfil e toca em "Baixar meus dados"
    Então o arquivo baixado traz o perfil de "Lucas Silva" e a família "Família Silva"
    E o lançamento de "R$ 150,50" aparece como 15050 centavos

  @integration
  Cenário: Limite de três downloads por dia
    Dado que Lucas já baixou os dados 3 vezes hoje
    Quando Lucas abre o Perfil e toca em "Baixar meus dados"
    Então vê a mensagem de dados "Você já baixou seus dados 3 vezes hoje. Tente de novo amanhã."

  Cenário: Falha de rede
    Quando Lucas abre o Perfil sem conexão e toca em "Baixar meus dados"
    Então vê a mensagem de dados "Sem conexão. Tente de novo."

  @valores-ocultos @integration
  Cenário: Valores ocultos não mascaram o arquivo
    Dado que Lucas fez um lançamento de "R$ 150,50" na conta "Itaú Lucas"
    Quando Lucas abre o Perfil e toca em "Baixar meus dados"
    Então o lançamento de "R$ 150,50" aparece como 15050 centavos
