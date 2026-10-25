# INDEX de agentes: leia só o necessário

Regra de ouro: comece por `agents/estado/<área>.md` (estado vigente, denso). Decisões, tarefas, relatórios, SDD/US são HISTÓRICO: só abra para rastrear origem (IDs citados no arquivo de estado).

## Estado vigente por área
| Área | Arquivo |
| :-- | :-- |
| "Só meu" (propriedade e controle) | [estado/so-meu.md](estado/so-meu.md) |
| Cartões e faturas | a migrar |
| Parcelamento | a migrar |
| Previstas e séries | a migrar |
| Acerto / divisão | a migrar |
| IA e assistente (MCP) | a migrar |
| Privacidade / LGPD | a migrar |
| Segurança (achados, riscos aceitos) | a migrar |
| Família, convites, sessões | a migrar |

Área "a migrar" (exceção à regra de não ler histórico): leia o SDD/US/README do papel e as decisões em `manager/decisoes-do-gestor.md`; o código e os testes vencem os docs.

## Para tarefa X, leia Y
| Papel | Tarefa | Leia |
| :-- | :-- | :-- |
| Gestor | Operar, delegar, escalar | `manager/README.md`, `manager/decisoes-para-o-usuario.md`, `estado/<área>.md` |
| Gestor | Registrar decisão | `manager/decisoes-do-gestor.md` (append; cite o arquivo de estado) |
| Stakeholder | Validar valor/dor | `estado/<área>.md` §a (Resumo), `stakeholder/requisitos-negocio.md` |
| PO | Escrever/ajustar história | `estado/<área>.md`, `product-owner/backlog/backlog.md`, a US em `backlog/stories/` |
| TL | Especificar/ADR | `estado/<área>.md`, SDD da área em `tech-lead/sdd/`, `tech-lead/adrs/` |
| Dev & QA | Implementar/corrigir | `estado/<área>.md` §b (Regras) e §f (Fontes: código e testes), depois o SDD indicado |
| Segurança | Auditar/reteste | `estado/<área>.md` §c (Invariantes) e §d (Riscos aceitos), `security/README.md`, `security/relatorios/` |

## Histórico (não ler por padrão)
`manager/decisoes-do-gestor.md`, `developer/tasks/`, `security/relatorios/`, `product-owner/backlog/decisoes-*.md`, `tech-lead/respostas-*.md`, `stakeholder/historico-alinhamentos.md` e `homologacao-*`. Futuro: `agents/_historico/` (ainda não existe; nada foi movido).

## REGRA DE MANUTENÇÃO
1. Toda mudança de regra atualiza `agents/estado/<área>.md` no MESMO commit (regra vigente, divergências, pendências).
2. Decisões (D-GES/D-PO), tarefas (TASK/DEV), relatórios (SEC) e retestes são histórico: registram o que ocorreu e CITAM o arquivo de estado; não são fonte da regra vigente.
3. Divergência docs x código: o código e os testes vencem; corrija o arquivo de estado e liste a divergência.
4. Arquivo de estado: máx. ~1500 palavras, tabelas e IDs estáveis, sem narrativa.
