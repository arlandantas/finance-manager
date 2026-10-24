# US-075 — Consultar saldos, gastos e extrato pelo assistente (somente leitura)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (proposta)** · fatia 2/4 |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,7 · 5 |
| Status | Refinada (PO) · aguarda SDD do TL (contratos das ferramentas) |
| Depende de | EN-006, US-074, US-025 (Resumo do Mês), US-007 (Extrato), US-048 (visão sintética) |
| Corte | Cortável com o bloco MCP; é a **primeira fatia a entregar valor** do bloco |
| Rastreabilidade | **NEED-025** (RN-025.2, 025.3, 025.7; Q-U05) · RF43 · D-PO-66 |

## História
Como **membro da família**, quero **perguntar à minha LLM "quanto gastamos em mercado este mês?" e receber os números do app**, para **consultar sem abrir o aplicativo**.

## Regras de negócio aplicáveis
- Ferramentas **fechadas e somente leitura**: saldos por conta, resumo do mês (a pagar, previstas, saldo previsto), gastos por categoria/período, faturas dos cartões e limite, lista de lançamentos (com filtros do Extrato), previstas do mês.
- Os valores são **idênticos aos das telas** (fonte única; RN-025.7). O MCP é ação explícita do membro: **não** aplica o "ocultar valores" visual (D-PO-66, hipótese).
- Respeita o escopo do membro (RN-025.2) e o tamanho máximo da resposta (paginação).
- Resultados incluem competência/moeda explícitas ("nov/2026, R$"); valores em centavos exatos.
- Dados de outra família nunca aparecem.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Consultas pelo assistente

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Lucas com um assistente de escopo de leitura conectado
    E em nov/2026 os gastos em "Mercado" somam "R$ 1.250,00" no Resumo do Mês

  Cenário: Gastos por categoria batem com o app
    Quando o assistente de Lucas consulta os gastos de "Mercado" em nov/2026
    Então recebe "R$ 1.250,00"

  Cenário: Saldos por conta
    Dado que a conta "Itaú Lucas" tem saldo de "R$ 1.000,00"
    Quando o assistente de Lucas consulta os saldos
    Então recebe a conta "Itaú Lucas" com "R$ 1.000,00"

  Cenário: Resumo do mês igual ao da tela
    Quando o assistente de Lucas consulta o resumo de nov/2026
    Então recebe os mesmos valores de "A pagar", "Previstas" e "Saldo previsto" da tela Resumo do Mês

  Cenário: Fatura e limite do cartão
    Quando o assistente de Lucas consulta o cartão "Nubank Lucas"
    Então recebe o total da fatura aberta, o vencimento e o limite disponível

  Cenário: Extrato com filtros
    Quando o assistente de Lucas consulta lançamentos de nov/2026 da categoria "Mercado"
    Então recebe só lançamentos de "Mercado" de nov/2026
    E a resposta é paginada quando passa do tamanho máximo

  Cenário: Não vê dados de outra família
    Dado que existe a "Família Souza" com lançamentos em "Mercado"
    Quando o assistente de Lucas consulta os gastos de "Mercado"
    Então a resposta não contém lançamentos da "Família Souza"

  Cenário: Não há ferramenta de escrita neste escopo
    Quando o assistente de Lucas lista as ferramentas disponíveis
    Então não vê ferramentas para criar, editar ou excluir lançamentos

  Cenário: Consulta fica auditada
    Quando o assistente de Lucas consulta os saldos
    Então a consulta aparece na auditoria de Lucas
```

## Histórico
- 2026-10-24 — Criada (D-PO-66).
