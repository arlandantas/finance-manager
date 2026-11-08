# language: pt
Funcionalidade: Token pessoal para clientes sem OAuth
  # Regras (limites, revogação, chave do Administrador, e-mail de limite) ficam em integração
  # (tests/integration/us074b-pat.int.test.ts e us074c-pat-tela.int.test.ts, ADR-039).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas está autenticado

  @mobile
  Cenário: O valor do token aparece uma vez
    Dado que a família permite o token pessoal
    Quando Lucas abre "Configurações" e "Assistente de IA"
    E gera o token pessoal "Cursor" com validade padrão
    Então vê o valor do token pessoal com o aviso "não será mostrado de novo"
    Quando Lucas fecha o token com "Já copiei"
    Então o valor do token pessoal não está mais na tela
    E vê o token pessoal "Cursor" na lista sem o valor
    Quando Lucas recarrega a tela do assistente
    Então vê o token pessoal "Cursor" na lista sem o valor

  Cenário: Lançamento exige a segunda ciência e nasce com confirmação
    Dado que a família permite o token pessoal
    Quando Lucas abre "Configurações" e "Assistente de IA"
    E Lucas abre o diálogo de gerar token pessoal com o nome "Script"
    E Lucas marca "Permitir lançamento"
    Então o botão "Gerar token" está desabilitado
    Quando Lucas marca "Entendi que o assistente pode lançar sem minha confirmação"
    Então o botão "Gerar token" está habilitado
    Quando Lucas gera o token e toca em "Já copiei"
    Então vê a conexão "Script · Consulta e lançamento · expira em 03/11/2026"
    E o token pessoal "Script" exige confirmação no app

  Cenário: Chave da família desligada esconde o botão e mostra o motivo
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então não há botão "Gerar token pessoal"
    E vê "Token pessoal desligado pelo Administrador da família." no assistente

  Cenário: Administrador liga a chave do token pessoal
    Quando Mariana abre "Configurações" e "Assistente de IA"
    E Mariana liga "Permitir token pessoal"
    Então há botão "Gerar token pessoal"
