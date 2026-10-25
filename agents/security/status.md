# Status — Agente de Segurança da Informação

**Última atualização:** 2026-10-25 · **Estágio:** reteste final das rodadas 3 e 4 entregue; aguardando o Gestor (SEC-038..041).

## Entregas
| Data | Entrega | Resultado |
| :-- | :-- | :-- |
| 2026-10-24 | [Levantamento completo](relatorios/levantamento-2026-10-24.md) (commit analisado `bdeef19`) | 24 achados: 0 Crítica, 2 Alta, 6 Média, 12 Baixa, 4 Informativa |
| 2026-10-25 | [Reteste das correções](relatorios/reteste-2026-10-25.md) (`ae290d1`..`93d78f2` + Grupo A) | 14 Corrigidos, 7 Parciais, 0 Não corrigidos; 4 achados novos (SEC-025..028) |
| 2026-10-25 | [Revisão dedicada de LGPD](relatorios/revisao-lgpd-2026-10-25.md) (`3fc271d`..`41b8d9f`) | Sem IDOR/BOLA nem bypass de trava; 9 achados novos: 4 Baixa (SEC-029..032), 5 Informativa (SEC-033..037) |
| 2026-10-25 | [Reteste final](relatorios/reteste-final-2026-10-25.md) (`b494e0c`..`849008c`) | 14 Corrigidos, 1 Parcial (SEC-026), 0 Não corrigidos, 0 regressões em achados antigos; 4 novos: SEC-038, 039 (Baixa), SEC-040, 041 (Info); suítes 359/359 |

## Quadro consolidado (estado final após o reteste final de 2026-10-25)
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
| **038** | Baixa | **Aberto** | captura de prevista/série dividida como "Só meu" |
| **039** | Baixa | **Aberto** | limpeza de idempotência por trecho de nome atinge outras famílias |
| **040** | Info | **Aberto** | limite de convites contornável recriando a família |
| **041** | Info | **Aberto** | balde de falhas do `/token` não freia tentativas |

## Pendências e bloqueios
- Perguntas do reteste final (§1): SEC-038 (regra nas previstas), "Só meu" na conta de outro dono, limite de convites por pessoa (SEC-040).
- Retestar SEC-038..041 quando o Gestor promover as correções.
- Perguntas ao usuário na seção 1 do reteste: regra do "Só meu" para SEC-025/026, risco residual da SEC-011, visão pública do health (SEC-022).
- Perguntas P1..P3 da revisão de LGPD (regra do ex-membro, janela de 24 h na idempotência, reautenticação).
- Retestar SEC-029..036 quando o Gestor promover as correções.
- Reteste da fase 2 da SEC-018 quando o Gestor a promover.
- Não verificado (sem acesso permitido): Vercel/produção (cabeçalhos de IP, HSTS, variáveis de deploy), claude.ai (`state`), Google real, Claude real com injeção.

## Log
- 2026-10-24 — Leitura de código, inventário de 112 handlers de rota, páginas e 8 ferramentas MCP, `pnpm audit`, varredura de segredos, exploração local em `127.0.0.1:3190` com banco descartável `finance_sec` (apagado). `tsconfig.json` alterado pelo `next dev` foi revertido; `.next-sec/` apagada. Sem commit (regra da tarefa).
- 2026-10-25 — Reteste: revisão dos diffs, exploração local em `127.0.0.1:3190` com os bancos descartáveis `finance_sec_rt` e `finance_sec_rt2` no `db-test` (os dois apagados), integração de segurança 162/162. `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. O Dev commitou SEC-017b e trabalhava na 017c durante a sessão (não revisados). Sem commit (regra da tarefa).
- 2026-10-25 — Revisão dedicada de LGPD (`3fc271d`..`41b8d9f`): leitura de código, exploração local em `127.0.0.1:3190` com banco descartável `finance_sec_lgpd` e suíte `sec017*` (50/50) em `finance_sec_lgpd2` no `db-test` (os dois apagados). `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. Havia mudanças não commitadas do Dev (rodada 3) na árvore; não foram tocadas. Sem commit (regra da tarefa).
- 2026-10-25 — Reteste final (`b494e0c`..`849008c`): revisão dos diffs, exploração local em `127.0.0.1:3190` com o banco descartável `finance_sec_final` e as suítes (28 arquivos, 359/359) em `finance_sec_final2` no `db-test` (os dois apagados). `tsconfig.json` e `AGENTS.md` reescritos pelo `next dev` foram revertidos; `.next-sec/` apagada. Sem commit (regra da tarefa).
