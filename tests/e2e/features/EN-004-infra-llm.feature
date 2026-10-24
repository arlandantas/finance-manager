# language: pt
Funcionalidade: Infra comum de LLM (consumo do mês)

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E o teto mensal de IA da família de "R$ 10,00"
    E o provedor de LLM em modo simulado

  Cenário: Administrador vê o consumo do mês
    Dado que o consumo de IA do mês da família é "R$ 2,40"
    Quando a Administradora abre "Família" e "IA e privacidade"
    Então vê "R$ 2,40 de R$ 10,00 usados neste mês"
    E vê "Volta a zerar em 01/11/2026"

  Cenário: Membro comum não vê o teto nem a chave
    Dado que o consumo de IA do mês da família é "R$ 2,40"
    Quando o Membro abre "Família" e "IA e privacidade"
    Então não vê o bloco "Consumo do mês" nem o valor do teto
    E em nenhuma tela aparece a chave da API
