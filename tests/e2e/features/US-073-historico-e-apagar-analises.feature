# language: pt
Funcionalidade: Histórico das análises
  # DEV-58: relógio fixo em 04/10/2026; as análises salvas são de ago/2026 e set/2026.

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o provedor de LLM em modo simulado
    E que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E duas análises salvas de "ago/2026" e "set/2026"

  Cenário: Lista de análises anteriores
    Quando Lucas abre o "Histórico" da análise
    Então vê as análises "set/2026" e "ago/2026" com data de geração

  Cenário: Ver o que foi enviado
    Quando Lucas abre a análise de "set/2026" no histórico e toca em "O que foi enviado"
    Então vê os totais por categoria e os valores recorrentes enviados
    E não vê nomes de pessoas nem dados de conta no que foi enviado

  Cenário: Apagar uma análise
    Quando Lucas abre o "Histórico" da análise
    E apaga a análise de "ago/2026" e confirma
    Então a análise de "ago/2026" some do histórico
    E a análise de "set/2026" continua no histórico

  Cenário: Apagar todo o histórico
    Dado que Lucas descartou "Streaming X"
    Quando Lucas abre o "Histórico" da análise
    E toca em "Apagar todo o histórico" e confirma
    Então o histórico fica vazio
    E as sugestões descartadas continuam salvas

  @integration
  Cenário: Apagar não afeta lançamentos
    Quando Lucas abre o "Histórico" da análise
    E toca em "Apagar todo o histórico" e confirma
    Então todos os lançamentos continuam presentes
