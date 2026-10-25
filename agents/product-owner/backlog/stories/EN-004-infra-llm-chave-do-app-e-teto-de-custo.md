# EN-004 — Infra de LLM: chave Anthropic do app, cliente único e teto de custo (Habilitadora)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-B (proposta)**, antes de qualquer história de LLM |
| Tipo | **Habilitadora** (sem tela de negócio; entrega mínima de "Consumo" em Configurações do Administrador) |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Must · 2,8 · 8 |
| Status | Refinada (PO) · **depende do ADR do Tech Lead** (integração LLM) e da resposta Q-U08/Q-U10 |
| Depende de | nenhuma história; EN-005 (opt-in) sempre antes do primeiro envio real |
| Corte | Não cortar (US-066 e US-070 dependem dela) |
| Rastreabilidade | NEED-026 (§4, Q-U08, Q-U10), NEED-027 (RN-027.7) · RF44, RF45 · RN15, RN16 · D-PO-57 |

## Justificativa
Importação de fatura e análise de gastos usam o mesmo provedor, a mesma chave e o mesmo controle de custo. Para não repetir isso em cada história, esta habilitadora entrega o **mecanismo único**; as histórias só descrevem o comportamento visível ao usuário.

## O que a habilitadora entrega (verificável)
- Chave da API Anthropic **do app**, guardada só em variável de ambiente do servidor (nunca no navegador, nunca em log; Q-U08, hipótese).
- **Cliente único de LLM** com tempo-limite, nova tentativa limitada e erros traduzidos para mensagens neutras ao usuário.
- **Teto mensal de custo por família** (valor definido pelo dono do produto; Q-U10) e **estimativa antes** de processar, com bloqueio educado ao atingir o teto.
- **Registro de consumo** por família e finalidade (importação, análise): data, finalidade, tokens/custo estimado, resultado; **sem conteúdo** da fatura ou dos lançamentos.
- Modo **simulado** (provedor falso) para desenvolvimento e testes: nenhuma chamada real à API na suíte.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Infra comum de LLM

  Contexto:
    Dado a "Família Silva" com o teto mensal de IA de "R$ 10,00"
    E o provedor de LLM em modo simulado

  Cenário: Chamada dentro do teto é registrada sem conteúdo
    Dado que o consumo do mês da família é "R$ 2,00"
    Quando uma importação de fatura usa "R$ 0,40" de IA
    Então o consumo do mês da família passa a "R$ 2,40"
    E o registro de consumo não contém a descrição de nenhum lançamento

  Cenário: Teto atingido bloqueia nova chamada
    Dado que o consumo do mês da família é "R$ 10,00"
    Quando um membro tenta usar um recurso de IA
    Então vê "O limite de uso de IA deste mês foi atingido. Volta a liberar em 01/12/2026"
    E nenhuma chamada ao provedor é feita

  Cenário: Estimativa maior que o saldo do teto bloqueia antes de enviar
    Dado que o consumo do mês da família é "R$ 9,80"
    Quando uma importação estimada em "R$ 0,50" é solicitada
    Então vê o aviso de que a estimativa excede o limite do mês
    E nenhuma chamada ao provedor é feita

  Cenário: Falha do provedor vira mensagem neutra
    Dado que o provedor simulado responde com erro de indisponibilidade
    Quando um membro usa um recurso de IA
    Então vê "Não foi possível usar a IA agora. Tente novamente em instantes"
    E nada é gravado nos dados financeiros

  Cenário: Administrador vê o consumo do mês
    Dado que o consumo do mês da família é "R$ 2,40" de "R$ 10,00"
    Quando o Administrador abre "Configurações" e "IA e privacidade"
    Então vê "R$ 2,40 de R$ 10,00 usados neste mês"

  Cenário: Membro comum não vê o teto nem a chave
    Dado que Lucas é membro sem papel de Administrador
    Quando Lucas abre "Configurações"
    Então não vê o valor do teto mensal de IA
    E em nenhuma tela aparece a chave da API
```

## Fora de escopo
Chave por família (alternativa da Q-U08); cobrança do consumo à família; painel de custos detalhado.

## Pontos para o Tech Lead
Ver [`_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md`](../../../_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md) §1 e §4.

## Histórico
- 2026-10-24 — Criada (D-PO-57).
