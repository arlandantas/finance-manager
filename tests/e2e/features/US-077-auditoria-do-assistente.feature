# language: pt
Funcionalidade: Auditoria do assistente
  # Ajuste de Gherkin (DEV-81): "abre um registro" vira a leitura do próprio item da lista (a atividade já
  # mostra ferramenta, período e resultado no item; não há tela de detalhe).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o assistente "Meu Claude" de Lucas com 3 consultas e 1 lançamento nesta semana
    E Lucas está autenticado

  Cenário: Lista de atividade do assistente
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê 4 registros de atividade com data, ferramenta e resultado

  Cenário: Registro não mostra o conteúdo devolvido
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então o registro "Consultou gastos por categoria" mostra o período "out/2026"
    E nenhum registro de consulta mostra valores devolvidos

  Cenário: Lançamento aparece com atalho
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o registro de atividade "Lançou Farmácia R$ 80,00" com o link "Ver no Extrato"

  Cenário: Um lançamento gera um único registro
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê um único registro do lançamento "Farmácia"
    E não vê registros de proposta ou de confirmação

  Cenário: Lançamento excluído continua na atividade
    Dado que Lucas excluiu o lançamento "Farmácia" de "R$ 80,00"
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o registro de atividade "Lançou Farmácia R$ 80,00 · excluído depois" sem o link "Ver no Extrato"

  Cenário: Lançamento bloqueado pelo limite
    Dado que o assistente de Lucas teve um lançamento de "R$ 600,00" bloqueado pelo limite
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o resultado "Bloqueado pelo seu limite"

  Cenário: Alteração de limites é registrada
    Dado que Lucas mudou o limite por lançamento de "R$ 500,00" para "Sem limite"
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê o registro de atividade "Você alterou o limite por lançamento: R$ 500,00 para sem limite"

  Cenário: Filtrar por assistente e por período
    Dado que existe outro assistente "Claude do trabalho" de Lucas com 1 consulta nesta semana e 1 consulta antiga
    Quando Lucas abre "Assistente de IA" e "Atividade"
    E Lucas filtra a atividade por "Meu Claude" e "Últimos 7 dias"
    Então vê só 4 registros do assistente "Meu Claude"

  Cenário: Membro vê só a própria atividade
    Quando Mariana abre "Assistente de IA" e "Atividade"
    Então não vê registros de atividade de Lucas

  Cenário: Revogar a partir da atividade
    Quando Lucas abre "Assistente de IA" e "Atividade"
    E Lucas filtra a atividade por "Meu Claude" e "Últimos 30 dias"
    E toca em "Revogar este assistente" na atividade e confirma
    Então o assistente "Meu Claude" de Lucas deixa de funcionar
