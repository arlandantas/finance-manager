# language: pt
Funcionalidade: Análise de gastos evitáveis
  # DEV-58: o relógio do E2E é fixo em 04/10/2026; o último mês fechado é set/2026 (4 meses: jun a set/2026).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o provedor de LLM em modo simulado

  Cenário: Pedir a análise mostra antes o que será enviado
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    Quando Lucas abre os "Gastos evitáveis" da análise
    E toca em "Analisar" na análise
    Então vê na análise "O que será enviado: totais por categoria dos últimos 4 meses e valores recorrentes, sem nomes de pessoas nem dados de conta"
    E precisa tocar em "Enviar para análise" para continuar
    E nenhuma análise foi salva

  Cenário: Resultado classifica as categorias com o porquê
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    Quando Lucas envia a análise de "set/2026"
    Então a categoria "Moradia" aparece no grupo "Essencial"
    E a categoria "Lazer" aparece no grupo "Supérfluo"
    E cada categoria tem uma explicação curta
    E vê o selo "Gerada por IA: confira os números"

  Cenário: Números vêm do sistema
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    Quando Lucas envia a análise de "set/2026"
    Então o valor de "Lazer" mostrado é "R$ 480,00"

  Cenário: Texto da IA com número é substituído pelo texto do sistema
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E o provedor simulado devolve texto com número
    Quando Lucas envia a análise de "set/2026"
    Então o valor de "Lazer" mostrado é "R$ 480,00"
    E a análise não mostra "999"

  Cenário: Análise não aponta pessoas
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E o provedor simulado devolve texto com nome de membro
    Quando Lucas envia a análise de "set/2026"
    Então o texto da análise não contém o nome "Mariana" nem "Lucas"
    E vê o aviso fixo da análise "Análise educativa. Não substitui um profissional. Nenhum dado foi alterado."
    E nenhum lançamento ou categoria foi alterado

  Cenário: Poucos dados
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E apenas 1 mês de lançamentos para a análise
    Quando Lucas abre os "Gastos evitáveis" da análise
    Então vê na análise "Precisa de pelo menos 2 meses com lançamentos para analisar"
    E o botão "Analisar" está desabilitado na análise

  Cenário: IA desligada
    Dado 4 meses de lançamentos categorizados até set/2026 para a análise
    Quando Lucas abre os "Gastos evitáveis" da análise
    Então vê na análise "A análise por IA está desligada nesta família"
    E não há botão "Analisar" na análise

  Cenário: Erro do provedor
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E o provedor simulado responde com erro
    Quando Lucas envia a análise de "set/2026"
    Então vê o erro da análise "Não foi possível analisar agora. Tente novamente em instantes"
    E nenhuma análise foi salva

  Cenário: Teto de uso estourado
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E o teto mensal de IA da família de "R$ 0,00"
    Quando Lucas envia a análise de "set/2026"
    Então vê o erro da análise "O limite de uso de IA deste mês foi atingido. Volta a liberar em 01/11/2026"
    E nenhuma análise foi salva

  Cenário: Cancelar durante a análise não salva nada
    Dado que a "Análise de gastos" foi ligada pela Administradora
    E 4 meses de lançamentos categorizados até set/2026 para a análise
    E o provedor simulado está lento
    Quando Lucas envia a análise de "set/2026" sem esperar
    E toca em "Cancelar" na análise
    Então a análise deixa de aparecer como em andamento
    E nenhuma análise foi salva
