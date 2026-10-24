# US-077 — Ver o que o meu assistente leu e lançou (auditoria)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-24 Acesso por Assistente (MCP) · **R4-D (POC)** · fatia 4/4 |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Could · 1,2 · 3 |
| Status | Refinada (PO) |
| Depende de | EN-006b (grava a auditoria), US-074; deve sair **antes da US-076a/b** |
| Corte | Cortável com o bloco; **a US-076a/b não vai sem ela** |
| Rastreabilidade | **NEED-025** (RN-025.6) · RF43 · D-PO-66, D-PO-76 |

## História
Como **membro da família**, quero **consultar o que meu assistente leu e gravou**, para **confiar no acesso e perceber uso indevido**.

## Regras de negócio aplicáveis
- **Um registro por lançamento**: cada lançamento do assistente gera um único item (não há mais o par "proposta + confirmação").
- Lançamento bloqueado por limite aparece como **"Bloqueado pelo seu limite"**; alteração de limites gera registro próprio.
- Se o lançamento foi excluído depois, o item mostra "excluído depois".
- Auditoria guardada por 12 meses (D-GES-36 d).

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

  Cenário: Um lançamento gera um único registro
    Dado que o assistente de Lucas lançou "Farmácia" de "R$ 80,00"
    Quando Lucas abre "Atividade"
    Então vê um único registro desse lançamento
    E não vê registros de proposta ou de confirmação

  Cenário: Lançamento excluído continua na atividade
    Dado que Lucas excluiu o lançamento "Farmácia" de "R$ 80,00"
    Quando Lucas abre o registro do lançamento
    Então vê "Lançou Farmácia R$ 80,00 · excluído depois"

  Cenário: Lançamento bloqueado pelo limite
    Dado que o assistente de Lucas teve um lançamento de "R$ 600,00" bloqueado pelo limite
    Quando Lucas abre "Atividade"
    Então vê o resultado "Bloqueado pelo seu limite"

  Cenário: Alteração de limites é registrada
    Dado que Lucas mudou o limite por lançamento de "R$ 500,00" para "Sem limite"
    Quando Lucas abre "Atividade"
    Então vê "Você alterou o limite por lançamento: R$ 500,00 para sem limite"

  Cenário: Filtrar por assistente e por período
    Quando Lucas filtra a atividade por "Meu Claude" e "últimos 7 dias"
    Então vê só os registros desse assistente nesse período

  Cenário: Membro vê só a própria atividade
    Quando Mariana abre "Assistente de IA" e "Atividade"
    Então não vê registros de Lucas

  Cenário: Revogar a partir da atividade
    Dado que Lucas está na tela de atividade de "Meu Claude"
    Quando Lucas toca em "Revogar este assistente" na tela de atividade e confirma
    Então o assistente "Meu Claude" aparece como "Revogado"
```

## Histórico
- 2026-10-24 — Criada (D-PO-66).
- 2026-10-24 — Revisão 2 (D-PO-76): um registro por lançamento; bloqueio por limite; registros de alteração de limites.
