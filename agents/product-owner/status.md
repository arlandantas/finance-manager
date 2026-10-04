# Status do Product Owner

*Atualizado: 2026-10-04 (após decisões D-GES-01..08)*

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

## Decisões do Gestor incorporadas (D-GES-01..08, 2026-10-04)
| Decisão | Efeito no backlog |
| :-- | :-- |
| D-GES-01 | Divisão **R1 (EN-001, US-001..013) / R2 (US-014..019)** ratificada; homologação de valor após a R1 |
| D-GES-03 | **Q-13**: US-013 segue *Should*, dentro da R1; último a ser cortado |
| D-GES-04 | **Q-17**: US-017 (pagar fatura) *Should* em R2 |
| D-GES-05 | D-PO-01, D-PO-02, D-PO-03 aprovadas; **validadas pelo Stakeholder** em 2026-10-04 (obs.: período como função de `cutDay`) |
| D-GES-06 | **Q-01**: dependentes sem login fora do MVP (US-021) |
| D-GES-07 | **Q-03**: convite vale **7 dias** |
| D-GES-08 | **Q-08**: regra de divisão com **vigência por data** (cenário BDD acrescentado à US-008) |
| D-GES-11 | Login de teste em dev (cenários acrescentados à US-001); sem mudança de escopo da R1 |

Todas as perguntas abertas do PO (Q-01, Q-03, Q-08, Q-13, Q-17) estão **respondidas**. Escopo da R1 inalterado. O Stakeholder já atualizou `cronograma-e-releases.md` (NEED-007 no AP0).

## Próximas histórias para o time técnico (ordem de execução, diretriz do Gestor)
1. **EN-001** (pode começar já) → **US-001** → **US-002** → **US-004** → **US-005** → **US-006** → **US-007** → **US-003** (Incremento 1)
2. **US-008** → **US-009** → **US-010** → **US-011** → **US-012** → **US-013** (Incremento 2)

Nenhuma história inicia sem SDD que a cubra.

## Pedidos ao Tech Lead (para liberar o Dev)
1. **Revisar o SDD-001** — GAP-1: falta `accountId`; GAP-2: unificar nomes com o ADR-006 (`isSharedExpense`, `payerMemberId`) e incluir autor e `version` na edição. Mapear para US-005/006/013.
2. **SDD-002 (split)** — cobre US-008, US-009, US-011. Pontos: **vigência da regra por data (D-GES-08)**, maior resto e desempate, algoritmo de sugestão para N > 2, exclusão de acertos/transferências dos totais.
3. **SDD de Auth, Família e Convite** (US-001..003) e **SDD de Contas e ledger** (US-004, US-010): lançamento de abertura, transferência atômica com par vinculado, **provedor de login de teste (D-GES-11)**, convite de 7 dias com e-mail via Mailpit.
4. Projetar o período como função de `cutDay` (padrão 1), conforme D-PO-03 aprovada.
5. Estimar em pontos todas as histórias (o tamanho do PO é preliminar).

## Pendências com outros agentes
- **Dev & QA**: reescrever `tasks-board.md` a partir da ordem do PO (D-GES-09): TASK-001 = EN-001; TASK-002 referenciava a antiga US-001 e agora é **US-005** (e US-006/007).
- **Tech Lead**: ajustar `ambiente-local.md` às portas de D-GES-10.
- **Gestor**: reestimar o cronograma da R1 com base nas estimativas do TL/Dev.
