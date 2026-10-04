# Status do Tech Lead

*Atualizado: 2026-10-04*

## Decisões vigentes
| Item | Decisão | Documento |
| :--- | :--- | :--- |
| Stack de aplicação | Aceita (Next.js + TS + Postgres/Prisma + Auth.js + pg-boss) | [ADR-001](adrs/ADR-001-stack-tecnologica.md) |
| Autenticação | Google via Auth.js, sessão em banco | [ADR-002](adrs/ADR-002-autenticacao-google.md) |
| Jobs | pg-boss | [ADR-003](adrs/ADR-003-jobs-e-agendamento.md) |
| Escrita offline | Adiada (PWA somente leitura) | [ADR-004](adrs/ADR-004-escrita-offline-adiada.md) |
| Produção/hospedagem | Adiada | [ADR-005](adrs/ADR-005-hospedagem-producao-adiada.md) |
| Split familiar | No MVP | [ADR-006](adrs/ADR-006-split-familiar-no-mvp.md) |

## Foco atual
Ambiente local rodando: [`architecture/ambiente-local.md`](architecture/ambiente-local.md).

## Próximos passos
1. Scaffold do ambiente local (Dockerfile/compose, Next, Prisma, Auth.js, scripts, hooks), a cargo do Desenvolvedor & QA seguindo a especificação.
2. `SDD-002` do split familiar (ADR-006).
3. Revisar SDD-001 (transações) para incluir `isSharedExpense`, `splitRule` e pagador efetivo.

## Pendências com outros agentes
- Stakeholder/PO: refletir NEED-007 no AP0 em `cronograma-e-releases.md` e no backlog.
- Gestor: reestimar o AP0 e decidir produção (ADR-005) quando oportuno.
