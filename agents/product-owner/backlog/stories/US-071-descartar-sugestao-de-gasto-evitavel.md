# US-071 — Descartar uma sugestão ("este gasto é importante para nós")

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 · **R4-C (proposta)** · fatia 2/4 da análise |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,9 · 3 |
| Status | Implementada (TASK-061, aguardando validação do Gestor) |
| Depende de | US-070 |
| Corte | Cortável; sem ela a análise repete sugestões já recusadas |
| Rastreabilidade | **NEED-027** (RN-027.6) · RF45 · FLUXO-017 · D-PO-65 |

## História
Como **membro da família**, quero **dizer que um gasto apontado como evitável é importante para nós**, para **a análise parar de insistir nele nas próximas vezes**.

## Regras de negócio aplicáveis
- Cada sugestão de gasto evitável tem a ação "Importante para nós" (com motivo opcional curto).
- O descarte é **da família** (qualquer membro; registra quem), vale para a **categoria + estabelecimento/descrição normalizada** e entra nas próximas análises como "já avaliado: manter" (o app envia o descarte como regra, sem texto livre do motivo).
- É reversível: lista "Sugestões descartadas" com "Voltar a sugerir".
- Descartar **não** altera lançamentos nem categorias.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Descartar sugestão de gasto evitável

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E uma análise de "out/2026" com o gasto evitável "Streaming X"
    E Lucas está autenticado

  Cenário: Descartar uma sugestão
    Quando Lucas toca em "Importante para nós" em "Streaming X"
    Então "Streaming X" sai da lista de possíveis gastos evitáveis
    E vê "Combinado. Não vamos sugerir de novo. Desfazer"

  Cenário: Próxima análise respeita o descarte
    Dado que Lucas descartou "Streaming X"
    Quando a análise de "nov/2026" é gerada
    Então "Streaming X" não aparece como possível gasto evitável

  Cenário: Descarte vale para toda a família
    Dado que Lucas descartou "Streaming X"
    Quando Mariana abre a análise de "out/2026"
    Então "Streaming X" aparece em "Sugestões descartadas"

  Cenário: Voltar a sugerir
    Dado que "Streaming X" está em "Sugestões descartadas"
    Quando Mariana toca em "Voltar a sugerir"
    Então a análise seguinte pode apontar "Streaming X" de novo

  Cenário: Descartar não altera lançamentos
    Quando Lucas toca em "Importante para nós" em "Streaming X"
    Então os lançamentos de "Streaming X" continuam no Extrato sem alteração
```

## Histórico
- 2026-10-24 — Criada (D-PO-65).
