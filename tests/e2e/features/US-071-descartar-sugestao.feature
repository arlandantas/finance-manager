# language: pt
Funcionalidade: Descartar sugestão de gasto evitável
  # DEV-58: relógio fixo em 04/10/2026; a análise é de set/2026.

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o provedor de LLM em modo simulado
    E que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E uma análise de "set/2026" feita por Lucas com o gasto evitável "Streaming X"

  Cenário: Descartar uma sugestão
    Quando Lucas abre a análise feita e toca em "Importante para nós" em "Streaming X"
    Então "Streaming X" sai da lista de possíveis gastos evitáveis
    E vê o aviso de descarte "Combinado. Não vamos sugerir de novo."
    E o aviso de descarte oferece "Desfazer"

  Cenário: Desfazer o descarte
    Quando Lucas abre a análise feita e toca em "Importante para nós" em "Streaming X"
    E toca em "Desfazer" no aviso de descarte
    Então o gasto evitável "Streaming X" volta à lista

  @integration
  Cenário: Próxima análise respeita o descarte
    Dado que Lucas descartou "Streaming X"
    Quando Lucas envia a análise de "set/2026"
    Então "Streaming X" não aparece como possível gasto evitável

  @integration
  Cenário: Descarte vale para toda a família
    Dado que Lucas descartou "Streaming X"
    Quando Mariana abre a análise feita
    Então "Streaming X" aparece em "Sugestões descartadas" das descartadas

  @integration
  Cenário: Voltar a sugerir
    Dado que Lucas descartou "Streaming X"
    Quando Mariana abre a análise feita e toca em "Voltar a sugerir" em "Streaming X"
    Então o gasto evitável "Streaming X" volta à lista
    E a análise seguinte pode apontar "Streaming X" de novo

  @integration
  Cenário: Descartar não altera lançamentos
    Quando Lucas abre a análise feita e toca em "Importante para nós" em "Streaming X"
    Então os lançamentos de "Streaming X" continuam no Extrato sem alteração
