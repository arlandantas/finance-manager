# language: pt
Funcionalidade: Limites de lançamento do assistente
  # Ajustes de Gherkin (DEV-81): (1) mudar o limite para MAIS que o padrão também exige "Entendi o risco"
  # (SDD-027 §R2.3, RISK_NOT_ACKNOWLEDGED); (2) a alteração auditada nasce de um salvamento real via API.

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas com o assistente "Meu Claude" conectado com a permissão de lançar despesas
    E o cartão "Nubank Lucas" e a categoria "Saúde" ativos
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Limites padrão já valem
    Quando Lucas abre "Assistente de IA" e "Limites de lançamento"
    Então vê o limite "R$ 500,00 por lançamento"
    E vê o limite "10 lançamentos por dia"
    E vê o limite "5 lançamentos por hora"

  Cenário: Valor acima do limite é bloqueado
    Quando o assistente de Lucas lança "Eletrônicos" de "R$ 600,00"
    Então o assistente recebe a resposta "Valor acima do seu limite por lançamento pelo assistente (R$ 500,00)"
    E nenhum lançamento é criado pelo assistente

  Cenário: Limite diário bloqueia o 11º lançamento
    Dado que o assistente de Lucas já fez 10 lançamentos hoje
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então o assistente recebe a resposta "Limite diário de lançamentos pelo assistente atingido"
    E continuam existindo 10 lançamentos do assistente

  Cenário: Limite por hora bloqueia o 6º lançamento
    Dado que o assistente de Lucas já fez 5 lançamentos na última hora
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então o assistente recebe a resposta "Limite de lançamentos por hora pelo assistente atingido"
    E continuam existindo 5 lançamentos do assistente

  Cenário: Excluir não devolve a cota
    Dado que o assistente de Lucas já fez 10 lançamentos hoje
    E Lucas excluiu um deles
    Quando o assistente de Lucas lança "Padaria" de "R$ 10,00"
    Então o assistente recebe a resposta "Limite diário de lançamentos pelo assistente atingido"

  Cenário: Membro muda um limite
    Dado que Lucas abre "Assistente de IA" e "Limites de lançamento"
    Quando Lucas altera o limite por lançamento para "R$ 1.000,00", marca "Entendi o risco" e salva
    Então o assistente de Lucas passa a poder lançar "Eletrônicos" de "R$ 600,00"

  Cenário: Remover um limite mostra o aviso de risco
    Dado que Lucas abre "Assistente de IA" e "Limites de lançamento"
    Quando Lucas escolhe "Sem limite" no limite por lançamento
    Então vê o aviso de risco "Sem limite, um erro ou uma instrução maliciosa da IA pode gerar muitos lançamentos indevidos"
    E vê o aviso de risco "Este app não movimenta dinheiro em bancos reais, os lançamentos só alteram os registros do app"
    E o botão "Remover limite" só habilita depois de marcar "Entendi o risco"

  Cenário: Sem limite depois de confirmar o risco
    Dado que Lucas abre "Assistente de IA" e "Limites de lançamento"
    E Lucas escolhe "Sem limite" no limite por lançamento
    E Lucas confirma o risco e salva
    Quando o assistente de Lucas lança "Eletrônicos" de "R$ 5.000,00"
    Então o assistente de Lucas passa a poder lançar "Eletrônicos" de "R$ 5.000,00"

  Cenário: Cancelar o aviso mantém o limite
    Dado que Lucas abre "Assistente de IA" e "Limites de lançamento"
    E Lucas escolhe "Sem limite" no limite por lançamento
    Quando Lucas cancela o aviso
    Então o limite por lançamento continua "R$ 500,00"

  Cenário: Alteração de limite fica auditada
    Dado que Lucas salvou o limite por lançamento como "Sem limite" (era "R$ 500,00")
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o registro de atividade "Você alterou o limite por lançamento: R$ 500,00 para sem limite"

  Cenário: Cada membro tem os seus limites
    Dado que Lucas salvou o limite por lançamento como "Sem limite" (era "R$ 500,00")
    Quando Mariana abre "Assistente de IA" e "Limites de lançamento"
    Então vê o limite "R$ 500,00 por lançamento"
    E vê o limite "10 lançamentos por dia"

  Cenário: Bloqueio aparece na Atividade
    Dado que o assistente de Lucas lançou "Eletrônicos" de "R$ 600,00" e foi bloqueado pelo limite
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o resultado "Bloqueado pelo seu limite"
