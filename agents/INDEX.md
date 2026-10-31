# INDEX de agentes: leia só o necessário

Regra de ouro: comece por `agents/estado/<área>.md` (estado vigente, denso). Decisões, tarefas, relatórios, SDD/US são HISTÓRICO: só abra para rastrear origem (IDs citados no arquivo de estado).

## Estado vigente por área
| Área | Arquivo |
| :-- | :-- |
| "Só meu" (propriedade e controle) | [estado/so-meu.md](estado/so-meu.md) |
| Cartões e faturas | [estado/cartoes-faturas.md](estado/cartoes-faturas.md) |
| Parcelamento | [estado/parcelamento.md](estado/parcelamento.md) |
| Previstas e séries | [estado/previstas-series.md](estado/previstas-series.md) |
| Acerto / divisão | [estado/acerto-divisao.md](estado/acerto-divisao.md) |
| IA e assistente (MCP) | [estado/ia-assistente-mcp.md](estado/ia-assistente-mcp.md) |
| Privacidade / LGPD | [estado/privacidade-lgpd.md](estado/privacidade-lgpd.md) |
| Segurança (achados, riscos aceitos) | [estado/seguranca.md](estado/seguranca.md) |
| Família, convites, sessões | [estado/familia-convites-sessoes.md](estado/familia-convites-sessoes.md) |
| Lançamentos, contas, extrato e base | [estado/lancamentos-contas-extrato.md](estado/lancamentos-contas-extrato.md) |
| Hospedagem e produção (Vercel, Prisma, backup, cron, travas) | [estado/hospedagem-producao.md](estado/hospedagem-producao.md) |

Todas as áreas estão migradas. Divergência docs x código: o código e os testes vencem.

## Para tarefa X, leia Y
| Papel | Tarefa | Leia |
| :-- | :-- | :-- |
| Gestor | Operar, delegar, escalar | `manager/README.md`, `manager/decisoes-para-o-usuario.md`, `estado/<área>.md` |
| Gestor | Registrar decisão | `manager/decisoes-do-gestor.md` (append; cite o arquivo de estado) |
| Stakeholder | Validar valor/dor | `estado/<área>.md` §a (Resumo), `stakeholder/requisitos-negocio.md` |
| PO | Escrever/ajustar história | `estado/<área>.md`, `product-owner/backlog/backlog.md`, a US em `backlog/stories/` |
| TL | Especificar/ADR | `estado/<área>.md`, SDD da área em `tech-lead/sdd/`, `tech-lead/adrs/` |
| Dev | Implementar/corrigir | `estado/<área>.md` §b (Regras) e §f (Fontes: código e testes), depois o SDD indicado |
| QA executor / exploratório | Rodar suítes e E2E / verificar UI no navegador | `developer/README.md` (seções de QA), brief do Gestor |
| Segurança | Auditar/reteste | `estado/<área>.md` §c (Invariantes) e §d (Riscos aceitos), `security/README.md`, `security/status.md`, `_historico/security/relatorios/` |

## Histórico (não ler por padrão)
`_historico/` guarda o que está fechado (relatórios de segurança, QA, respostas do TL, decisões e pedidos do PO, homologações do Stakeholder), com a subestrutura original. IDs preservados. Também histórico: `manager/decisoes-do-gestor.md` (append) e `developer/tasks/` (exceto `tasks-board.md`).

## REGRA DE MANUTENÇÃO
1. Toda mudança de regra atualiza `agents/estado/<área>.md` no MESMO commit (regra vigente, divergências, pendências).
2. Decisões (D-GES/D-PO), tarefas (TASK/DEV), relatórios (SEC) e retestes são histórico: registram o que ocorreu e CITAM o arquivo de estado; não são fonte da regra vigente.
3. Divergência docs x código: o código e os testes vencem; corrija o arquivo de estado e liste a divergência.
4. Arquivo de estado: máx. ~1500 palavras, tabelas e IDs estáveis, sem narrativa.
