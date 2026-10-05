# US-013b — Desfazer transferência/acerto e aviso de mês já acertado

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho | Should · 2,3 · 3 |
| Status | Especificada (SDD-001) · fatia **13b** da US-013 · **cortável** sem quebrar a R1 (primeira a cortar) |
| Depende de | [US-013a](US-013-corrigir-ou-estornar-lancamento.md), US-010, US-011 |
| Rastreabilidade | NEED-001 · NEED-007 · ADR-001, ADR-006, ADR-007 |

## História
Como **membro da família**, quero **desfazer uma transferência ou um acerto registrado por engano** e ser **avisado ao editar um mês já quitado**, para **manter saldos e acertos corretos sem perder o histórico**.

## Regras de negócio aplicáveis
- Editar despesa de um mês **já acertado** exibe aviso antes de salvar.
- Lançamentos de **transferência e acerto** não são editáveis; só podem ser **desfeitos** (estorno completo das duas pernas), com trilha de auditoria.
- Demais regras: as da [US-013a](US-013-corrigir-ou-estornar-lancamento.md).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Desfazer transferência/acerto e aviso de mês acertado

  Cenário: Aviso em mês já acertado
    Dado que outubro foi quitado
    Quando edito o valor de uma despesa comum de outubro
    Então vejo "Este mês já foi acertado. O saldo do acerto será recalculado." e posso confirmar

  Cenário: Desfazer um acerto
    Dado um acerto registrado de "R$ 400,00"
    Quando escolho "Desfazer acerto" e confirmo
    Então as duas pernas são estornadas e o painel volta a exibir "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana"

  Cenário: Transferência não é editável
    Quando abro o detalhe de uma transferência
    Então não há "Editar", apenas "Desfazer transferência"
```

## Experiência
Aviso em diálogo de confirmação no salvamento; no detalhe de transferência/acerto, apenas "Desfazer" (com confirmação).

## Fora de escopo
O mesmo da US-013a.

## Nota de corte
Primeira fatia a ser cortada se o prazo apertar (ordem: 13b, 9b, 13a). Sem ela, a R1 ainda permite corrigir/excluir lançamentos; transferências e acertos errados ficam sem remédio na UI (registrar como débito conhecido).

## Histórico
- 2026-10-04 — **Cenário atualizado (D-PO-41, SDD-011 §9, US-028):** "Desfazer um acerto" com o texto neutro do herói; valores inalterados.
