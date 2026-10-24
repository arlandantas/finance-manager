# language: pt
Funcionalidade: Opt-in de privacidade para IA
  # Na R4 a única finalidade é "Análise de gastos"; "Importar faturas" volta na R5 (D-GES-28, SDD-022 §9).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o provedor de LLM em modo simulado

  Cenário: Recursos de IA nascem desligados
    Quando a Administradora abre "Família" e "IA e privacidade"
    Então o interruptor "Análise de gastos" está desligado

  Cenário: Ligar exige ler e confirmar o que é enviado
    Quando a Administradora abre "Família" e "IA e privacidade"
    E toca no interruptor "Análise de gastos"
    Então vê o texto de consentimento "apenas totais por categoria dos últimos meses"
    E vê o texto de consentimento "empresa fora do Brasil"
    E vê o botão "Entendi e quero ligar"
    E o interruptor "Análise de gastos" está desligado
    Quando fecha o diálogo sem confirmar
    Então o interruptor "Análise de gastos" está desligado
    Quando toca no interruptor "Análise de gastos"
    E expande "Ver como tratamos seus dados"
    Então vê o texto de consentimento "nomes e e-mails de membros"
    Quando toca em "Entendi e quero ligar"
    Então o interruptor "Análise de gastos" está ligado

  Cenário: Consentimento registra quem e quando
    Dado que a "Análise de gastos" foi ligada pela Administradora
    Quando a Administradora abre "Família" e "IA e privacidade"
    Então vê o registro "Ligado por Mariana Silva em 04/10/2026"

  Cenário: Membro comum não altera
    Dado que a "Análise de gastos" foi ligada pela Administradora
    Quando o Membro abre "Família" e "IA e privacidade"
    Então o interruptor "Análise de gastos" está desabilitado
    E vê o aviso de IA "Só o Administrador pode ligar ou desligar"

  Cenário: Desligar vale na hora e não apaga dados
    Dado que a "Análise de gastos" foi ligada pela Administradora
    Quando a Administradora abre "Família" e "IA e privacidade"
    E toca no interruptor "Análise de gastos"
    E toca em "Desligar"
    Então o interruptor "Análise de gastos" está desligado
    E vê o registro "Desligado por Mariana Silva em 04/10/2026"

  @integration
  Cenário: Recurso desligado bloqueia o envio
    # Coberto em tests/integration/en005-consentimento.int.test.ts (AI_DISABLED, zero chamadas ao provedor)
    Dado que a "Análise de gastos" está desligada
    Quando Lucas tenta analisar os gastos
    Então vê "A análise por IA está desligada nesta família"

  @integration
  Cenário: Mudança no texto exige novo consentimento
    # Coberto em tests/integration/en005-consentimento.int.test.ts (texto v2 injetado => NEEDS_RECONSENT)
    Dado que a "Análise de gastos" foi ligada com a versão 1 do texto
    Quando a versão 2 do texto de consentimento é publicada
    Então "Análise de gastos" fica desligada até Mariana confirmar de novo
