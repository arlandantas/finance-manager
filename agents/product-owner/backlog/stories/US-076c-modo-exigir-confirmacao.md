# US-076c — Modo opcional "exigir confirmação" por conexão (backlog)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **ampliação (backlog)** |
| MoSCoW · Tamanho (TL) | Could · **3** |
| Status | Refinada (PO) · **fora do POC** · SDD-027 (rev. 1, proposta + confirmação) reaproveitado |
| Depende de | US-076a/b |
| Corte | Opcional |
| Rastreabilidade | **NEED-025** (RN-025.4 original, agora opcional) · D-GES-36 (c) · D-PO-72 |

## História
Como **membro da família**, quero **escolher, por conexão, que os lançamentos do assistente fiquem pendentes até eu confirmar**, para **ter o controle de duas etapas quando preferir mais segurança**.

## Regras de negócio aplicáveis
- Opção **por conexão**, desligada por padrão; ligada, o pedido do assistente cria só uma **proposta** que expira em 30 minutos e só vira lançamento quando o membro **confirma no app**.
- Proposta recusada ou expirada não gera lançamento. Selo "via assistente", idempotência e limites da US-076b continuam valendo para o que for confirmado.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Modo exigir confirmação

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Lucas com o assistente "Meu Claude" conectado com a permissão de lançar despesas
    E a conexão "Meu Claude" com "Exigir minha confirmação" ligado
    E o cartão "Nubank Lucas" e a categoria "Saúde" ativos

  Cenário: Pedido cria só uma proposta
    Quando o assistente de Lucas lança "Farmácia" de "R$ 80,00" no cartão "Nubank Lucas"
    Então nenhum lançamento é criado ainda
    E Lucas vê a proposta "Farmácia R$ 80,00" para confirmar

  Cenário: Confirmar grava o lançamento
    Dado que existe a proposta "Farmácia" de "R$ 80,00"
    Quando Lucas confirma a proposta
    Então o Extrato mostra "Farmácia R$ 80,00" com o selo "via assistente"

  Cenário: Recusar descarta a proposta
    Dado que existe a proposta "Farmácia" de "R$ 80,00"
    Quando Lucas recusa a proposta
    Então nenhum lançamento é criado

  Cenário: Proposta não confirmada expira
    Dado que existe a proposta "Farmácia" de "R$ 80,00" criada há mais de 30 minutos
    Quando Lucas tenta confirmar
    Então vê "Esta proposta expirou"
    E nenhum lançamento é criado

  Cenário: Outra conexão continua direta
    Dado que Lucas tem a conexão "Outro Claude" sem o modo de confirmação
    Quando o assistente "Outro Claude" lança "Farmácia" de "R$ 80,00"
    Então o Extrato mostra "Farmácia R$ 80,00"
```

## Histórico
- 2026-10-24 — Criada (D-PO-72).
