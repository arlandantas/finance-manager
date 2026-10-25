# Respostas do Tech Lead — R4-D v2 (Vercel, alternativas ao OAuth, lançamento direto, POC com Claude)

*Atualizado: 2026-10-24 · De: Agente Tech Lead · Para: Gestor e Product Owner · Cópia: Stakeholder, Dev & QA*
*Responde a **D-GES-36** (a–d) e aos refinamentos do Gestor (dev em Docker / produção na Vercel; POC com um cliente; limites configuráveis pelo membro, inclusive "sem limite"). Substitui as partes correspondentes de [`respostas-r4d.md`](respostas-r4d.md) (que fica como histórico).*

## 1. Resumo
| Tema | Resposta | Onde |
| :-- | :-- | :-- |
| **Hospedagem** | Novo **[ADR-031](../../tech-lead/adrs/ADR-031-producao-vercel-prisma-postgres.md)**: produção = **Vercel + Prisma Postgres**; **dev continua em Docker** (`db`, `db-test`, `mailpit`; `Dockerfile` mantido para ensaio local); `railway.json` sai. App usa URL *pooled*, CLI/backup usam a **direta**; `prisma migrate deploy` no `vercel-build` só em produção; *pool* `max 3` + `attachDatabasePool`; região da função = região do banco; travas do ADR-026 passam a valer também por `VERCEL_ENV`; expurgos por **Vercel Cron diário** com `CRON_SECRET`; backup `pg_dump` segue no GitHub Actions (URL direta). Nova enabler **EN-007 (5 pts)**. | ADR-031, [`producao.md`](../../tech-lead/architecture/producao.md) |
| **Riscos de produção já hoje** (inferidos do repo) | (1) **`APP_DEPLOY_ENV` provavelmente ausente** ⇒ travas contra login de teste desligadas; (2) **não se sabe se as migrações foram aplicadas** (sem `migrate deploy` no *build*); (3) **pode não haver backup nenhum** (Prisma Free não tem *snapshot*; `backup.yml` aponta para Railway); (4) `DATABASE_URL` pode ser a direta (conexões); (5) *previews* podem enxergar o banco de produção. | ADR-031 §12 |
| **Alternativas ao OAuth** | **Nenhuma atende mais chatbots hospedados**: Claude.ai e ChatGPT só aceitam credencial por pessoa via OAuth (Claude tem cabeçalho estático só em *beta* restrito e como credencial da organização). **Token pessoal (PAT)** soma IDEs/CLIs/agentes (Claude Code, Cursor, VS Code, Gemini CLI, Antigravity, Mistral Le Chat). Recomendo oferecê-lo **além** do OAuth, **depois do POC** (US-074b, 3 pts): por membro, 30/90 dias, mostrado uma vez, SHA-256, revogável, `read` por padrão. Ponte stdio e GPT Actions: não. | ADR-030 §2-R2, SDD-024 §11.4, SDD-025 §8.4 |
| **Lançamento direto** | Ferramenta `lancar_despesa` grava na hora (despesa à vista "Só meu", conta/cartão, até 60 dias atrás), idempotente (chave + duplicata natural de 10 min com `allowDuplicate`), autor = membro, `origin = ASSISTANT`, **selo "via assistente"**, **filtro Origem** no Extrato, **cartão de conferência na Home** com Excluir/Desfazer (já existentes), auditoria. Escopo `write` à parte, desmarcado, com segundo "Entendi". **Limites configuráveis pelo membro** (sugeridos R$ 500/lançamento, 10/dia, 5/hora; cada um pode virar "sem limite" com aviso de risco e registro na auditoria). Modo "exigir confirmação" vira *backlog* (US-076c). Risco residual registrado (ADR-030 §6-R2). | SDD-027 rev. 2, SDD-025 §8 |
| **POC** | **Claude** (web/Desktop/mobile; Claude Code junto): conector por URL inclusive no plano Free (1 conector), OAuth por **CIMD** bem documentado, mesmo AS para todas as superfícies. POC dispensa DCR (−1 pt). ChatGPT entra na ampliação (+2: DCR e homologação). | SDD-024 §11.2 |
| **Prazos** | Aprovados (D-GES-36 d): conexão 30/90 dias, acesso 60 min, auditoria 12 meses. Proposta de 30 min deixa de existir (só no modo opcional futuro). | — |

## 2. Estimativas e ordem de execução
| Ordem | Item | Pts TL | SDD/ADR | Depende de | Observação |
| :-: | :-- | :-: | :-- | :-- | :-- |
| 0 | **Ações do usuário já** (sem código): `APP_DEPLOY_ENV=production`; conferir escopo das variáveis; informar plano/região do Prisma; `prisma migrate status` com o Dev | — | ADR-031 §12 | — | Fecha os riscos 1–3 enquanto a EN-007 não sai |
| 1 | **EN-007** Ajuste da hospedagem (travas por `VERCEL_ENV`, *pool*, `DIRECT_URL`, `vercel-build`, *cron* de expurgo, backup, limpeza Railway) | **5** | ADR-031 §11 | 0 | Independe do MCP; **antes de tudo** (backup e travas) |
| 2 | *Spike* do SDK (era 2025-11-25 *stateless* num Route Handler na Vercel + Claude Code) | (em 006b) | SDD-024 §10 | 1 | 0,5 dia |
| 3 | **EN-006a** AS OAuth — POC (CIMD, sem DCR) | **7** | SDD-024 §2–§4, §11 | 1 | Opus |
| 4 | **EN-006b** `/api/mcp`, contexto, taxa, auditoria, cliente de teste | **5** | SDD-024 §5–§8 | 3 | |
| 5 | **US-074** Conectar/revogar/bloquear (aba Claude) | **5** | SDD-025 + §8 | 4 | |
| 6 | **US-075** 7 ferramentas de leitura (+ `origin`) | **5** | SDD-026 | 5 | **Marco POC-1: Claude consultando** (= 27 pts) |
| 7 | **US-077** Atividade | **3** | SDD-027 §5 + §R2.6 | 6 | |
| 8 | **US-076a** Lançamento direto | **5** | SDD-027 §R2 | 7 | Sai **junto** com a 076b |
| 9 | **US-076b** Limites configuráveis + avisos | **3** | SDD-027 §R2.3, SDD-025 §8.2 | 8 | **Marco POC-2: Claude lançando** (POC total = **38**) |
| | **POC (Claude)** | **38** | | | |
| A1 | DCR + ChatGPT (CIMD `chatgpt.com`, aba de instruções, homologação) | **2** | SDD-024 §11.2 | POC | Primeira ampliação |
| A2 | **US-074b** Token pessoal (PAT) | **3** | SDD-024 §11.4, SDD-025 §8.4 | POC | Se o usuário aprovar (TL-42) |
| A3 | **US-076c** Modo "exigir confirmação" por conexão | **3** | SDD-027 rev. 1 | POC | Opcional |
| A4 | Gemini app (quando liberado no Brasil): homologar | **1** | — | A1 | Sem data |
| | **Ampliação** | **9** | | | |
| | **Total** | **47** | | | Antes: 31 (+3 se Vercel). Diferença: EN-007 real (5 em vez de 3), salvaguardas do lançamento direto (076b), PAT e modo de confirmação no *backlog* |

Regra de liberação: `MCP_ENABLED=true` em produção só após EN-007 pronta, checklist SDD-024 §9 (`/security-review` incluído) e **ensaio de *restore*** feito (o lançamento direto grava dados reais).

## 3. Exige decisão do usuário (⚠)
| ID | Tema | Recomendação do TL | Bloqueia |
| :-- | :-- | :-- | :-- |
| **TL-42** ⚠ | Token pessoal (PAT) no *backlog* pós-POC? Com `write` permitido? | Sim, depois do POC; `read` por padrão, `write` opcional com os mesmos limites | Só A2 |
| **TL-44** ⚠ | *Previews* da Vercel: desligar × banco próprio de *preview* | **Desligar** no alpha; variáveis só em *Production* | EN-007 |
| **TL-45** ⚠ | Domínio definitivo (`verbus-finance.vercel.app` × próprio) **antes** de ligar o MCP (trocar depois derruba as conexões) | Ficar com `verbus-finance.vercel.app` se não houver plano de domínio | US-074 em produção |
| **TL-46** ⚠ | Plano do Prisma Postgres: Free (sem *snapshot*) + backup diário no GitHub × Starter (*snapshots* de 7 dias) | Pelo menos o backup **diário** criptografado; Starter se o custo for aceitável | EN-007 |
| **TL-47** ⚠ | Padrões sugeridos dos limites (R$ 500,00 · 10/dia · 5/hora) e janela de data de 60 dias | Como está (o membro muda depois) | US-076b |
| **TL-49** (informação, não decisão) | Informar: plano e região do Prisma, se `DATABASE_URL` é *pooled* ou direta, como o *schema* de produção foi criado | — | EN-007 |
Resolvidos neste ciclo: **TL-35** (Vercel), **TL-36** (POC com Claude; ChatGPT na ampliação; Gemini app quando liberado), **TL-37** (lançamento direto), **TL-38** (prazos). Informativo: os limites **de transporte** (60 chamadas/min, 1.000/dia por conexão) não são configuráveis — protegem o serviço; "sem limite" remove só os limites de lançamento.

## 4. O que o PO deve ajustar no BDD (TL-39, revisto)
1. **US-076 ⇒ fatiar** em **076a** (lançar direto), **076b** (limites configuráveis) e **076c** (modo exigir confirmação, *backlog*). Trocar "Pedido cria só proposta / Confirmar / Recusar / Expira" por: "Pedido grava direto com selo 'via assistente'"; "Leitura não lança"; "Pedido repetido não duplica (chave e duplicata em 10 min)"; "Acima do limite por valor/dia/hora é bloqueado com mensagem"; "Membro remove um limite e vê o aviso de risco"; "Lançamento aparece no cartão de conferência da Home e pode ser excluído e desfeito"; "Filtro Origem no Extrato"; "Data de mais de 60 dias é recusada".
2. **RN-025.4** (duas etapas) ⇒ nova regra "lançamento direto, opt-in explícito, limites do membro, reversível" — pedir validação do Stakeholder.
3. **US-074**: permissão "Lançar despesas em seu nome (sem confirmação)" com segunda ciência; instruções do POC só para o Claude; nova **US-074b** (token pessoal) no *backlog*.
4. **US-077**: um registro por lançamento (não mais proposta + confirmação); registros de alteração de limites; resultado "Bloqueado pelo seu limite".
5. **EN-006**: POC com Claude; DCR e ChatGPT na ampliação. **Nova EN-007** (hospedagem Vercel) no *backlog*, prioridade 1.
6. FLUXO-008/016: incluir o caminho "via assistente" (lançamento direto → cartão de conferência → excluir/desfazer) e a tela de limites.
7. Os ajustes antigos do TL-39 que continuam: sem "credencial mostrada uma vez" no OAuth; cenário "Poupança só para Mariana" ⇒ outra família/ex-membro; bloqueio da família revoga.

## 5. Riscos técnicos (atualizados)
| Risco | Mitigação |
| :-- | :-- |
| Produção sem travas/backup/migração conferida (hoje) | Item 0 + EN-007 antes do MCP |
| Injeção/erro da LLM gravando dados | Opt-in reforçado, capacidade mínima, limites do membro, idempotência, cartão de conferência, Excluir/Desfazer, auditoria; **risco residual aceito** (ADR-030 §6-R2) |
| Membro escolhe "sem limite" | Aviso + confirmação + auditoria `LIMITS_CHANGED`; limites de transporte fixos |
| Migração na Vercel servindo versão antiga com *schema* novo | Migrações compatíveis com a versão anterior (expandir ⇒ contrair) |
| Conexões esgotadas no Prisma Free | URL *pooled*, `max 3`, `attachDatabasePool` |
| *Cold start* em `/token` (Claude corta em 10 s) | Medir na EN-007; mesma região do banco |
| AS OAuth próprio | Escopo mínimo, testes de segurança SDD-024 §8, `/security-review`, Opus |

## 6. Rastreabilidade
NEED-025 (RN-025.1..7; RN-025.4 a revisar) ⇒ EN-006 (POC Claude), EN-007 (nova), US-074/074b, US-075, US-076a/b/c, US-077 ⇒ FLUXO-008, FLUXO-016 ⇒ SDD-024..027 (rev. 2) ⇒ ADR-030 (rev. 2), **ADR-031** (substitui ADR-026 em produção) ⇒ TASKs a criar pelo Dev.

## 7. Escolha de modelo (AGENTS.md regra 6)
Este ciclo: modelo avançado (hospedagem crítica, segurança, salvaguardas). Implementação: **Sonnet** para EN-007, EN-006b, US-074..077; **Opus** para EN-006a, revisão das travas/migração (EN-007 §3–§4) e do *enforcement* de limites/idempotência (US-076a/b); **Haiku** para documentação/status.
