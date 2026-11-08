# language: pt
Funcionalidade: Confirmar no app o que o assistente propõe
  # O "assistente" é o cliente MCP de teste falando com o /api/mcp real do servidor de E2E (sem LLM, sem rede).
  # Regras de borda (limites, concorrência, expiração gravada, isolamento) ficam na integração
  # (tests/integration/us076c-*.int.test.ts).

  Contexto:
    Dado a família da gestão com Mariana Administradora e Lucas Membro
    E Lucas com o assistente "Meu Claude" conectado com a permissão de lançar despesas
    E o cartão "Nubank Lucas" e a categoria "Saúde" ativos
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Ligar a confirmação, propor e confirmar no app
    Quando Lucas liga "Exigir confirmação no app" na conexão "Meu Claude"
    E o assistente de Lucas propõe "Farmácia" de "R$ 80,00" no cartão "Nubank Lucas" na categoria "Saúde"
    Então nenhum lançamento é criado pelo assistente
    Quando Lucas abre a proposta do assistente
    Então a proposta mostra "Farmácia" e "R$ 80,00"
    Quando Lucas toca em "Confirmar lançamento" na proposta
    Então a proposta aparece como "Proposta confirmada"
    Quando Lucas abre o Extrato de novembro/2026
    Então o Extrato de novembro mostra "Farmácia" com "R$ 80,00"
    E o lançamento "Farmácia" tem o selo "via assistente"

  Cenário: Recusar descarta a proposta
    Dado que a conexão "Meu Claude" exige confirmação
    E que o assistente de Lucas propôs "Farmácia" de "R$ 80,00"
    Quando Lucas abre a proposta do assistente
    E Lucas toca em "Recusar" na proposta
    Então a proposta aparece como "Proposta recusada"
    E nenhum lançamento é criado pelo assistente

  Cenário: Proposta vencida não pode ser confirmada
    Dado que a conexão "Meu Claude" exige confirmação
    E que o assistente de Lucas propôs "Farmácia" de "R$ 80,00"
    E que a proposta do assistente passou de 30 minutos
    Quando Lucas abre a proposta do assistente
    Então a proposta aparece como "A proposta expirou"
    E nenhum lançamento é criado pelo assistente

  @integration
  Cenário: Outra conexão, sem o modo ligado, continua lançando direto
    Quando o assistente de Lucas lança "Farmácia" de "R$ 80,00" no cartão "Nubank Lucas" na categoria "Saúde"
    Então apenas o lançamento de "R$ 80,00" é criado
