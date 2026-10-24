# language: pt
Funcionalidade: Gastos que parecem evitáveis (recorrentes)
  # DEV-58: relógio fixo em 04/10/2026; 4 meses de jun a set/2026.

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o provedor de LLM em modo simulado
    E que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise

  Cenário: Gasto recorrente tem valor mensal e anual
    Quando Lucas envia a análise de "set/2026"
    Então vê o gasto evitável "Streaming X" com "R$ 55,90 por mês · R$ 670,80 por ano"

  Cenário: O nome do estabelecimento não vai para a IA
    Quando Lucas abre os "Gastos evitáveis" da análise
    E toca em "Analisar" na análise
    Então o que será enviado lista um valor recorrente sem o nome
    E o que será enviado não contém "Streaming"

  Cenário: Ver lançamentos abre o Extrato filtrado
    Quando Lucas envia a análise de "set/2026"
    E abre "Ver lançamentos" do gasto evitável "Streaming X"
    Então o Extrato mostra o lançamento "Streaming X"
