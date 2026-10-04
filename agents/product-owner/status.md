# Status do Product Owner

*Atualizado: 2026-10-04*

## Entregue neste ciclo
| Artefato | Conteúdo |
| :--- | :--- |
| [`backlog/working-agreement.md`](backlog/working-agreement.md) | Método (story map, INVEST, MoSCoW, WSJF, BDD), DoR/DoD, template e glossário |
| [`backlog/backlog.md`](backlog/backlog.md) | Épicos, mapa da jornada, backlog ordenado com WSJF, plano de releases, decisões e perguntas |
| [`backlog/mvp-definition.md`](backlog/mvp-definition.md) | MVP revisado: R1 *Fechar o mês em casal* e R2 *AP0 completo* |
| [`backlog/stories/`](backlog/stories) | EN-001 e US-001..013 refinadas em BDD; US-014..019 como esboço |
| [`flows/`](flows) | FLUXO-001 (rev. 2), FLUXO-002 (onboarding/convite), FLUXO-003 (acerto de contas) |

## Próximas histórias para o time técnico (ordem de execução)
1. **EN-001** → **US-001** → **US-002** → **US-004** → **US-005** → **US-006** → **US-007** → **US-003** (Incremento 1, walking skeleton)
2. **US-008** → **US-009** → **US-010** → **US-011** → **US-012** → **US-013** (Incremento 2)

## Pedidos ao Tech Lead (para liberar o Dev)
1. **Revisar o SDD-001** — GAP-1: falta `accountId`; GAP-2: unificar nomes com o ADR-006 (`isSharedExpense`, `payerMemberId`) e incluir autor e `version` na edição. Mapear para US-005/006/013.
2. **SDD-002 (split)** — cobre US-008, US-009, US-011. Pontos: vigência da regra (Q-08), maior resto e desempate, algoritmo de sugestão para N > 2, exclusão de acertos/transferências dos totais.
3. **SDD de Auth, Família e Convite** (US-001..003) e **SDD de Contas e ledger** (US-004, US-010): lançamento de abertura, transferência atômica com par vinculado, provedor de login de teste.
4. Confirmar **D-PO-03**: período como função de `cutDay` (padrão 1), para o AP1 não exigir refatoração.
5. Estimar em pontos todas as histórias (o tamanho do PO é preliminar).

## Pendências com outros agentes
- **Gestor**: ratificar a divisão R1/R2 (e Q-13, Q-17); reestimar o AP0.
- **Stakeholder**: validar D-PO-01, D-PO-02, Q-01; atualizar `cronograma-e-releases.md` com NEED-007 no AP0 (ADR-006).
- **Dev & QA**: `tasks-board.md` ainda referencia a antiga US-001 em TASK-002 → agora é **US-005** (e US-006/007); TASK-001 equivale ao **EN-001**.
