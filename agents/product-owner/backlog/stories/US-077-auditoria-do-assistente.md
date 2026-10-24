# US-077 — Ver o que o meu assistente leu e lançou (auditoria)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (proposta)** · fatia 4/4 |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Could · 1,2 · 3 |
| Status | Refinada (PO) |
| Depende de | EN-006 (grava a auditoria), US-074; deve sair **junto ou antes da US-076** |
| Corte | Cortável com o bloco; **a US-076 não vai sem ela** |
| Rastreabilidade | **NEED-025** (RN-025.6) · RF43 · D-PO-66 |

## História
Como **membro da família**, quero **consultar o que meu assistente leu e gravou**, para **confiar no acesso e perceber uso indevido**.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Auditoria do assistente

  Contexto:
    Dado a "Família Silva" com "Mariana" como Administradora e "Lucas" como membro
    E o assistente "Meu Claude" de Lucas com 3 consultas e 1 lançamento nesta semana
    E Lucas está autenticado

  Cenário: Lista de atividade do assistente
    Quando Lucas abre "Assistente de IA" e "Atividade"
    Então vê 4 registros com data, ferramenta e resultado

  Cenário: Registro não mostra o conteúdo devolvido
    Quando Lucas abre um registro de consulta
    Então vê a ferramenta e o período consultado
    E não vê os valores devolvidos

  Cenário: Lançamento aparece com atalho
    Quando Lucas abre o registro do lançamento
    Então vê "Lançou Farmácia R$ 80,00"
    E vê o link "Ver no Extrato"

  Cenário: Filtrar por assistente e por período
    Quando Lucas filtra a atividade por "Meu Claude" e "últimos 7 dias"
    Então vê só os registros desse assistente nesse período

  Cenário: Membro vê só a própria atividade
    Quando Mariana abre "Assistente de IA" e "Atividade"
    Então não vê registros de Lucas

  Cenário: Revogar a partir da atividade
    Quando Lucas toca em "Revogar este assistente" na tela de atividade e confirma
    Então o assistente "Meu Claude" aparece como "Revogado"
```

## Histórico
- 2026-10-24 — Criada (D-PO-66).
