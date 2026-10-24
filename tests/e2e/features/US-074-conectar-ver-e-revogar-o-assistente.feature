# language: pt
Funcionalidade: Conectar e revogar acesso do assistente
  # Ajustes de Gherkin registrados como DEV-81: a ciência de privacidade, o "Lançar despesas" e a segunda
  # ciência vivem na tela de autorização que o Claude abre (OAuth, SDD-025 §4.1/§8.1), não no botão
  # "Conectar um assistente" das configurações (que só mostra a URL e os passos).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o acesso por assistente permitido pela família
    E Lucas está autenticado

  Cenário: Nasce desligado
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então vê "Nenhum assistente conectado" no assistente

  Cenário: Conexão não mostra credencial
    Quando Lucas abre "Configurações" e "Assistente de IA"
    E toca em "Conectar um assistente" nas configurações
    Então vê a URL do servidor do app para colar no Claude
    E não vê nenhuma senha, chave ou código para guardar

  Cenário: Instruções são só do Claude
    Quando Lucas abre "Configurações" e "Assistente de IA"
    E toca em "Conectar um assistente" nas configurações
    Então vê os passos para o Claude na web, no Desktop, no celular e no Claude Code
    E não vê passos para outros assistentes

  Cenário: Autorizar exige ciência do risco de privacidade
    Dado que o Claude pediu acesso para consultar e lançar
    Quando Lucas abre a tela de autorização do Claude
    Então vê o aviso de autorização "Os dados que o assistente consultar serão enviados ao provedor da IA que você usa, fora do controle do app"
    E o botão de autorização "Permitir" está desabilitado
    Quando Lucas marca "Entendi"
    Então o botão de autorização "Permitir" está habilitado

  Cenário: Lançar despesas vem desmarcado
    Dado que o Claude pediu acesso para consultar e lançar
    Quando Lucas abre a tela de autorização do Claude
    Então a opção "Lançar despesas em seu nome (sem confirmação)" aparece desmarcada

  Cenário: Marcar o lançamento exige segunda ciência
    Dado que o Claude pediu acesso para consultar e lançar
    Quando Lucas abre a tela de autorização do Claude
    E Lucas marca "Entendi"
    E Lucas marca "Lançar despesas em seu nome (sem confirmação)"
    Então vê o aviso de autorização "O assistente grava lançamentos direto, sem pedir sua confirmação. Você poderá excluí-los depois"
    E o botão de autorização "Permitir" está desabilitado
    Quando Lucas marca "Entendi que o assistente pode lançar sem minha confirmação"
    Então o botão de autorização "Permitir" está habilitado

  Cenário: Conexão mostra o que foi permitido
    Dado que Lucas tem o assistente "Meu Claude" conectado com consulta e lançamento até 23/11/2026
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então vê a conexão "Meu Claude · Consulta e lançamento · expira em 23/11/2026"

  Cenário: Revogar na hora
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Lucas abre "Configurações" e "Assistente de IA"
    E toca em "Revogar" na conexão "Meu Claude" e confirma
    Então a conexão "Meu Claude" aparece como "Revogado"
    E o assistente "Meu Claude" de Lucas deixa de funcionar

  Cenário: Cada membro vê só as suas conexões
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana abre "Configurações" e "Assistente de IA"
    Então não vê o assistente "Meu Claude" na lista

  Cenário: Administrador bloqueia o recurso para a família
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana desliga "Permitir acesso por assistente" e confirma
    Então o assistente "Meu Claude" de Lucas deixa de funcionar
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então vê o aviso de bloqueio "O Administrador bloqueou o acesso por assistente"

  Cenário: Membro comum não altera a chave da família
    Quando Lucas abre "Configurações" e "Assistente de IA"
    Então não vê a chave "Permitir acesso por assistente" editável

  @integration
  Cenário: Membro removido perde as conexões
    # Coberto em tests/integration/en006a-oauth.int.test.ts (remoção na mesma transação, SDD-025 §5).
    Dado que Lucas tem o assistente "Meu Claude" conectado
    Quando Mariana remove Lucas da família
    Então o assistente de Lucas deixa de funcionar
