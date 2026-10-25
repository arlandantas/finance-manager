# Status — Agente de Segurança da Informação

**Última atualização:** 2026-10-26 · **Estágio:** ciclo do "Só meu" encerrado (D-GES-61); sem tarefa de segurança em aberto. Estado vigente dos achados, proteções e riscos aceitos: [../estado/seguranca.md](../estado/seguranca.md) (fonte de verdade; este arquivo é o quadro histórico).

## Entregas
| Data | Entrega | Resultado |
| :-- | :-- | :-- |
| 2026-10-24 | [Levantamento completo](../_historico/security/relatorios/levantamento-2026-10-24.md) (commit analisado `bdeef19`) | 24 achados: 0 Crítica, 2 Alta, 6 Média, 12 Baixa, 4 Informativa |
| 2026-10-25 | [Reteste das correções](../_historico/security/relatorios/reteste-2026-10-25.md) (`ae290d1`..`93d78f2` + Grupo A) | 14 Corrigidos, 7 Parciais, 0 Não corrigidos; 4 achados novos (SEC-025..028) |
| 2026-10-25 | [Revisão dedicada de LGPD](../_historico/security/relatorios/revisao-lgpd-2026-10-25.md) (`3fc271d`..`41b8d9f`) | Sem IDOR/BOLA nem bypass de trava; 9 achados novos: 4 Baixa (SEC-029..032), 5 Informativa (SEC-033..037) |
| 2026-10-25 | [Reteste do "Só meu" ampliado](../_historico/security/relatorios/reteste-so-meu-2026-10-25.md) (`bdd9ed1`..`672ea70`, D-GES-50/51) | Núcleo da regra, IDOR, ex-membro, exportação e MCP sem furo; 5 achados novos: SEC-042 (Média), 043, 044, 045 (Baixa), 046 (Info); suítes 47/47 |
| 2026-10-26 | [Reteste da rodada 6 + D-GES-55](../_historico/security/relatorios/reteste-rodada6-2026-10-26.md) (`adc6946`..`ac946e9`) | SEC-042..045 Corrigidos, 046 Corrigido (aviso); D-GES-52..55 conformes; 4 novos: SEC-047, 048, 049 (Baixa), 050 (Info); suítes 100/100 |
| 2026-10-26 | [Reteste da rodada 7](../_historico/security/relatorios/reteste-rodada7-2026-10-26.md) (`20bfdfe`..`0d33261`, D-GES-57/58) | SEC-047, 049, 050 Corrigidos; SEC-048 Corrigido no passo único, contornável em dois (SEC-051); resíduo DEV-132 quantificado (Admin +V·(n−1)/n); 3 novos: SEC-051 (Baixa), 052, 053 (Info); int 1094/1094 (1 skip) |
| 2026-10-26 | [Reteste da rodada 8](../_historico/security/relatorios/reteste-rodada8-2026-10-26.md) (`55c46b5`..`a0415d6`, D-GES-59/60) | SEC-051 e resíduo DEV-132 Corrigidos no `PATCH`; DEV-135 conforme; SEC-049/050 mantidos; 4 novos: SEC-054, 055, 056 (Baixa), 057 (Info); int 1106/1106 (1 skip) |
| 2026-10-25 | [Reteste final](../_historico/security/relatorios/reteste-final-2026-10-25.md) (`b494e0c`..`849008c`) | 14 Corrigidos, 1 Parcial (SEC-026), 0 Não corrigidos, 0 regressões em achados antigos; 4 novos: SEC-038, 039 (Baixa), SEC-040, 041 (Info); suítes 359/359 |

## Quadro consolidado (SEC-001..057; estado após D-GES-61)
| SEC | Sev. | Estado final | Nota |
| :-- | :-- | :-- | :-- |
| 001 | — | Risco aceito | D-GES-40 |
| 002 | Alta | Corrigido | Next 16.4.3, `/_next/image` 404 |
| 003 | Média | Corrigido | redirect aberto: varredura sem regressão |
| 004 | Média | Corrigido | aceite de convite alheio 404 |
| 005 | Média | Corrigido¹ | ¹ depende da Vercel sobrescrever `x-real-ip` |
| 006 | Média | Parcial | CSP de scripts só Report-Only |
| 007 | Média | Corrigido | 413 |
| 008 | — | Risco aceito | D-GES-40 |
| 009 | Baixa | Corrigido (mitigação) | heurística contornável por paráfrase |
| 010 | Baixa | Corrigido | — |
| 011 | Baixa | Risco aceito (condicionado) | homologar com claude.ai (D-GES-45) |
| 012 | Baixa | Corrigido | — |
| 013 | Baixa | Corrigido | — |
| 014 | Baixa | Corrigido | assunto sem nome da família; resíduos ⇒ SEC-040 |
| 015 | — | Risco aceito | D-GES-40 |
| 016 | — | Risco aceito | D-GES-40 |
| 017a | Baixa | Corrigido | — |
| 017b..e | — | Revisados | achados derivados SEC-029..037 |
| 018 | Baixa | Parcial | fase 2 pendente (token legado em texto) |
| 019 | Baixa | Parcial | transitivas sem correção (11 avisos `--prod`) |
| 020 | Baixa | Corrigido | — |
| 021 | Info | Corrigido | regras complementares nas SEC-025/026/038 |
| 022 | Info | Corrigido | visão pública só `status`/`timestamp` |
| 023 | Info | Corrigido | DoS por limite por segredo resolvido na SEC-028 |
| 024 | Info | Corrigido | — |
| U6 | — | Corrigido | — |
| 025 | Baixa | Corrigido | residuais da regra ratificada (reteste final §5) |
| 026 | Baixa | Parcial | bypass nas previstas/séries ⇒ SEC-038 |
| 027 | Baixa | Corrigido | 30 paralelos ⇒ 5 criados |
| 028 | Info | Corrigido | troca legítima nunca barrada |
| 029 | Baixa | Corrigido | — |
| 030 | Baixa | Corrigido | sessão, login de teste, MCP e refresh recusados |
| 031 | Baixa | Corrigido | sem resíduo; regressão ⇒ SEC-039 |
| 032 | Baixa | Corrigido | 33,5 mil lançamentos ⇒ 200; stream no backlog |
| 033 | Info | Corrigido | — |
| 034 | Info | Corrigido | — |
| 035 | Info | Risco aceito | D-GES-46 |
| 036 | Info | Corrigido | role dona das tabelas em produção não verificada |
| 037 | Info | Corrigido (aviso) / Em análise (reauth) | pergunta ao usuário |
| us-016a | — | Corrigido | lock do cartão sem deadlock; corridas coerentes |
| 038 | Baixa | Corrigido | D-GES-49 (rodada 5) |
| 039 | Baixa | Corrigido | D-GES-49: limpeza por identificadores/escopo |
| 040 | Info | Corrigido | D-GES-49: limite por pessoa |
| 041 | Info | Risco aceito | D-GES-49: segredos de 256 bits |
| 042 | Média | Corrigido | Membro comum 403; resíduo do Admin ⇒ SEC-047 |
| 043 | Baixa | Corrigido | D-GES-53 |
| 044 | Baixa | Corrigido | (a)..(d) 403 |
| 045 | Baixa | Corrigido | `endSeries` preserva |
| 046 | Info | Corrigido (aviso) | `reassignNotice` |
| 047 | Baixa | Corrigido | só o titular troca; via remoção ⇒ SEC-052 |
| 048 | Baixa | Corrigido | dois passos e resíduo DEV-132 fechados no D-GES-59 |
| 049 | Baixa | Corrigido | acerto em duas linhas ⇒ SEC-053 |
| 050 | Info | Corrigido | pagador fixo (D-GES-59): a nota não volta |
| 051 | Baixa | Corrigido | D-GES-59; contornos por excluir/estornar ⇒ SEC-054/055 |
| 052 | Info | Risco aceito | D-GES-59 |
| 053 | Info | Risco aceito | D-GES-59 |
| 054 | Baixa | Risco aceito (D-GES-61; sujeito a veto do usuário) | excluir e relançar a dividida do ex-membro move o crédito (qualquer membro) |
| 055 | Baixa | Risco aceito (D-GES-61; sujeito a veto do usuário) | estornar a baixa paga pelo ex-membro e dar nova baixa move o crédito (Admin: resíduo DEV-132) |
| 056 | Baixa | Risco aceito (D-GES-61; sujeito a veto do usuário) | acerto com ex-membro credor aceita qualquer conta de destino da família |
| 057 | Info | Registrado (D-GES-61) | série do removido fica com ele; editar a série desfaz a reatribuição |

## Pendências e bloqueios
- Perguntas ao usuário vigentes (veto a SEC-054/055/056, SEC-037 reautenticação, texto LGPD): ver [../estado/seguranca.md](../estado/seguranca.md) §a e §e. As perguntas antigas dos retestes (Só meu SEC-025/026, SEC-011, health SEC-022, P1..P3 da LGPD, SEC-038..041, SEC-054..057) foram respondidas ou decididas (D-GES-40..61).
- Retestar a fase 2 da SEC-018 quando o Gestor a promover.
- Não verificado (sem acesso permitido): Vercel/produção (cabeçalhos de IP, HSTS, variáveis de deploy), claude.ai (`state`), Google real, Claude real com injeção, UI das rodadas 6 a 8 no navegador.

## Log
- 2026-10-24 — Leitura de código, inventário de 112 handlers de rota, páginas e 8 ferramentas MCP, `pnpm audit`, varredura de segredos, exploração local em `127.0.0.1:3190` com banco descartável `finance_sec` (apagado). `tsconfig.json` alterado pelo `next dev` foi revertido; `.next-sec/` apagada. Sem commit (regra da tarefa).
- 2026-10-25 — Reteste: revisão dos diffs, exploração local em `127.0.0.1:3190` com os bancos descartáveis `finance_sec_rt` e `finance_sec_rt2` no `db-test` (os dois apagados), integração de segurança 162/162. `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. O Dev commitou SEC-017b e trabalhava na 017c durante a sessão (não revisados). Sem commit (regra da tarefa).
- 2026-10-25 — Revisão dedicada de LGPD (`3fc271d`..`41b8d9f`): leitura de código, exploração local em `127.0.0.1:3190` com banco descartável `finance_sec_lgpd` e suíte `sec017*` (50/50) em `finance_sec_lgpd2` no `db-test` (os dois apagados). `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. Havia mudanças não commitadas do Dev (rodada 3) na árvore; não foram tocadas. Sem commit (regra da tarefa).
- 2026-10-25 — Reteste final (`b494e0c`..`849008c`): revisão dos diffs, exploração local em `127.0.0.1:3190` com o banco descartável `finance_sec_final` e as suítes (28 arquivos, 359/359) em `finance_sec_final2` no `db-test` (os dois apagados). `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. Sem commit (regra da tarefa).
- 2026-10-25 — Reteste do "Só meu" ampliado (`bdd9ed1`..`672ea70`): leitura de código, 19 cenários de prova (handlers em processo, arquivo só no scratchpad) e suítes `sec021`/`sec025-026`/`sec038`/`us-030`/`us084` (47/47) no banco descartável `finance_sec_somu` no `db-test` (apagado). Sem `next dev` (nada a reverter). Relatório e status commitados (regra do README).
- 2026-10-26 — Reteste da rodada 6 + D-GES-55 (`adc6946`..`ac946e9`): revisão do diff, suítes do projeto (8 arquivos, 100/100) e 9 cenários de prova (só no scratchpad) no banco descartável `finance_sec_r6` no `db-test` (apagado). Sem `next dev` (nada a reverter). Relatório e status commitados (regra do README).
