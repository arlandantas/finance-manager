# Respostas do Tech Lead ao pedido do PO — R2.1 e R3

*Atualizado: 2026-10-04 · De: Agente Tech Lead · Para: Product Owner · Cópia: Gestor*
*Responde a [`pedidos-ao-tech-lead-r21-r3.md`](../product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md). Decisões do Gestor aplicadas: D-GES-14..20.*

## 1. Resumo (uma tela)

| Item | Resposta |
| :-- | :-- |
| **Pontos confirmados** | **R2.1 = 67** (PO: 60) · Must 40 · Should 17 · Could 10. **R3 = 67** (PO: 56) · Must 11 · Should 48 · Could 8 (EN-003 já entregue neste ciclo: **65 pendentes**). |
| **Onde o TL discorda do PO** | US-032 (+2), US-033 (+1), US-035 (+3), US-024 (+1: busca `q`), **US-040 (+3)**, **EN-002 (+8)**. Todas as demais: confirmadas. |
| **Parcelamento na R2.1?** | **Não.** US-040 = **8** (> 5) e a US-042 depende da EN-002 (D-GES-17, 3ª condição). Fica como **1ª entrega da R3**. ([ADR-017](adrs/ADR-017-parcelamento-no-cartao-e-competencia.md)) |
| **Assimetria D-PO-26** | **Viável e consistente** se **toda** consulta por período usar um único predicado (`competenceOn` na R3; `ledger-where.ts` já na R2.1). Não toca números homologados. Custo: +2 pts na US-040. Alternativa mais barata documentada, dependente de aceite do Stakeholder. |
| **Migração do acerto (EN-002)** | Estratégia segura e reversível em [ADR-016](adrs/ADR-016-percentual-gravado-por-lancamento.md): rateio por membro **em centavos**, motor LEGACY congelado, snapshot, *gate* de 1 centavo que falha o deploy, idempotente, retomável, rollback testado. **Achado novo:** o arredondamento por lançamento (RN-018.3) **difere** do por grupo (hoje) em centavos; por isso o modelo grava **centavos**, não só o percentual. |
| **Spike de grupos (EN-003)** | **Concluído**: [ADR-018](adrs/ADR-018-multiplos-grupos-spike.md). N:N **estrutural já existe** (`Member`); só `UNIQUE(userId)` e 4 leituras por `userId` impõem 1:1. Pessoa em 2 grupos = **13 pts**; conta privada = **13–21 pts**. **Não construir agora**; preparar na R2.1/US-035 a custo ≈ 0. |
| **SDDs entregues** | SDD-010..013 (R2.1, **prontos para o Dev**); SDD-014..017 (R3, **esboços**); ADR-016..019; modelo de dados §8–§9. |

## 2. Respostas às perguntas prioritárias

### P1 — Parcelamento (US-040/042) e assimetria
- **Estimativa**: US-040 **8** (fatiável em 040a = modelo, criação atômica, faturas futuras, limite = 5; 040b = competência em Extrato/Resumo/Acerto/Análise, "Ver compra", exclusão da compra inteira = 3); US-042 **3** (depois da EN-002; **5** se tivesse de usar uma âncora de regra sem a EN-002, descartado).
- **O que derruba a US-040 para 5**: (a) apurar a parcela por `occurredOn` (sem `competenceOn`; −2; exige aceite do Stakeholder, pois parcelas de compras **depois do fechamento** contariam um mês antes do mês da fatura) e (b) deixar "excluir compra inteira" para a US-041 (−1). Sem o 24x não muda a estimativa (limite só afeta validação).
- **Pontos que mais pesam**: `competenceOn` tocando todas as consultas por período; N faturas travadas em ordem (até 24); `occurredOn` futura no ledger (Home `recent`, `defaults`); faturas futuras no cartão (`nextRef`, `isFuture`); trava de edição das parcelas até a US-041.
- **Recomendação ao PO**: mover a **exclusão da compra parcelada inteira** (+ Desfazer) para a US-040: sem ela, um erro de digitação em um Must é irrecuperável.
- **Assimetria D-PO-26**: ver [ADR-017 §3](adrs/ADR-017-parcelamento-no-cartao-e-competencia.md). Resumo do Mês e Extrato **não divergem do acerto** porque os quatro lugares (+ Análise) leem o mesmo predicado, garantido por teste de propriedade e por `check:imports`. Visível ao usuário: a parcela datada 28/11 (fatura de dez) aparece no Extrato **de dezembro** com a etiqueta "Fatura dez/2026 · 1/10". A compra à vista de 28/11 continua em novembro.

### P2 — Spike de grupos (EN-003)
Ver [ADR-018](adrs/ADR-018-multiplos-grupos-spike.md): inventário de pontos que assumem 1:1 (4 leituras por `userId`, gate, `MeDTO` singular, convite que retorna `NONE`, cache sem escopo), isolamento (o que ADR-013 cobre e as 3 lacunas: 17 pontos de SQL cru, sem RLS, sem teste estrutural), custos (a = 13; RLS = 5; b = 13..21), impacto em D-PO-02/US-020/"ocultar valores", e a lista de preparações já embutidas nos SDDs (`findActiveMembership`, índices parciais, predicado único com gancho `visibleTo`, teste canário).

### P3 — Migração do acerto com regressão (EN-002)
Ver [ADR-016 §5](adrs/ADR-016-percentual-gravado-por-lancamento.md) e [SDD-015 §5](sdd/SDD-015-percentual-por-lancamento-e-migracao-esboco.md): instantâneo antes/depois automatizado de **todos os meses de todas as famílias de teste**, critério de falhar o deploy a qualquer centavo, reaproveitamento dos vetores **S1..S13** (e novos S14..S16 do SDD-012), casos nomeados dos valores homologados (3.169,90 / 1.584,95 / 1.149,95; 717,00 / 358,50 / 260,50; 780,00 / 620,00), idempotência, atomicidade por família, rollback testado e **release em duas etapas** (motor STORED com interface inalterada ➜ depois a US-043).

### P4 — Modelo do percentual por lançamento
**Opção B refinada** (tabela de rateio por membro, com `bps` **e** `amountInCents`) + `splitMode` + `splitRuleVersionId`. Sobra de centavo **ao pagador** (se participa; senão maior resto), 0%/100% sem tratamento especial, N membros e **ex-membros** por FK, parcelas com rateio próprio herdado da compra, edição em mês acertado pela US-013b. A `SplitRuleVersion` continua só para **sugerir** o percentual, `stale` e histórico. **Rótulo ponderado**: nasce na R2.1 por vigência e continua igual por rateio gravado (as cotas são idênticas pelo *gate*; teste de propriedade compara as duas fontes).

## 3. Respostas por história (perguntas não bloqueantes)

| Hist. | Resposta (detalhe no SDD indicado) |
| :-- | :-- |
| US-022 | **Sim**: `SettlementDTO.splitExplanation` (trechos + ponderado `apportion(1000, quotas)`) da **mesma fonte** das cotas; `GET /split-rule/history`. (SDD-011 §4.1) |
| US-023 | **No cliente**, por função pura compartilhada (valor muda ao vivo); "mais usada" = contagem de 90 dias por conta do membro logado em `AccountDTO.usageCountByMe` (sem tabela). (SDD-013 §1, §4.1) |
| US-024 | O servidor **já** aplica "vazio = categoria" (Q-05); é só interface. **Faltava a busca por descrição** (`q`) no Extrato: +1 ponto. Mensagem única "A descrição precisa ter entre 2 e 100 caracteres". (SDD-013) |
| US-025 | Agregado único `getMonthSummary` sobre as **mesmas** `ledgerTotals`/`paidByMember` do Extrato; propriedade "resumo = Extrato". Definições de "A pagar" (previstas + faturas **não pagas**, abertas ou fechadas, por vencimento; atrasadas de meses anteriores só no corrente) e "saldo previsto" em meses passados/futuros em SDD-010 §4.2. Limitação: em mês **futuro** o saldo previsto usa o saldo **atual** e só os vencimentos daquele mês (TL-09). |
| US-026 | **Sim**, mesmo mecanismo (`usePref`, `localStorage` por usuário e dispositivo). (SDD-010) |
| US-027 | `localStorage` por **usuário e dispositivo**; ausente ⇒ oculto; troca de usuário no mesmo dispositivo ⇒ oculto; valores só renderizam **após** o carregamento (sem *flash*); **um** componente `Money`; regra de CI proíbe `formatBRL` fora dele; mensagens de servidor com valor passam por `maskMoneyInText`. Gráficos futuros herdam. (SDD-010 §1, §4.4) |
| US-028 | Coluna `Family.settlementEnabled`; API devolve **`409 SETTLEMENT_DISABLED`** nas rotas de acerto/regra (desfazer acerto e Extrato seguem); religar **não recalcula nada** (teste de *checksum*). (SDD-011) |
| US-029 | Função única `pendingSettlementMonths`; Home usa **janela de 12 meses**; a confirmação de desligar (US-028) usa **todos os meses** (teto 120). Custo: 1 leitura + cálculo puro por mês; sem cache além de 30 s. |
| US-030 | **Confirmado**: `computeSettlement` não muda. Muda o **contrato**: default de `isSharedExpense` (despesa e previsão) passa a `false`: lista de testes R1/R2 a ajustar em SDD-011 §9. |
| US-031 | `POST /split-rule/preview` sem gravar, reaproveitando `computeSettlement` duas vezes; impacto = `Σ|Δ saldo|/2`; renda **nunca sai do navegador**. (SDD-011 §4.6) |
| US-032/033 | `archivedAt` como em categorias; **"excluir" = exclusão lógica terminal** (o ledger não aceita `DELETE` e toda conta tem `OPENING`); "nunca teve movimentação" e "fatura aberta com compras" definidos; **lock anti-corrida** (`FOR UPDATE` no arquivar × `FOR SHARE` na postagem). (SDD-012 §1, §4.1) |
| US-034/035 | **ADR-019**: `Member` nunca é apagado (`removedAt`), unicidade só entre ativos, reconvite = novo `Member`, acesso encerrado por `403 NO_FAMILY` imediato (+ aviso único), último Administrador por *advisory lock*, reatribuição em lote atômica. (SDD-012 §4.3) |
| US-036 | Estado + `?tx=<id>` (sem rotas paralelas); componente único `TransactionDetail`; "Ver no Extrato" com parâmetro de UI `highlight`. (SDD-010 §4.6) |
| US-037 | Script inline em `<head>` + variáveis CSS do Tailwind 4 invertidas em `[data-theme="dark"]` (sem tocar cada componente); auditoria de cores fixas e teste de contraste AA. (SDD-010 §4.5) |
| US-038 | Container único `max-w-[960px]` em `(app)/layout`; drawer independente da largura (Dialog em portal); FAB ancorado ao container. |
| US-039 | **Copiar link/Reenviar exigem rotação do token** (só existe o hash): o link anterior deixa de valer; limite 3 reenvios; validação reativa com altura reservada. (SDD-013 §1) |
| US-041 | Versão do **plano** + versão da parcela; "esta e as próximas" só em faturas **abertas**; parcelas somente leitura até lá (`INSTALLMENT_NOT_EDITABLE`). (ADR-017 §7) |
| US-044 | `Category.defaultSplit boolean`; revisão por `GET /settlement/review`; dispensa por mês em tabela própria. (SDD-015 §6) |
| US-045..047 | `nameKey` normalizado (NFD, minúsculas) único por família; N:N `transaction_tags`; mesclagem atômica e idempotente; filtro por `EXISTS` (não duplica linhas nem totais). (SDD-016 §1) |
| US-048/049 | Consulta única `analyze()` sobre o predicado do Extrato; propriedade "soma da Análise = soma do Extrato"; tags pelo `LEFT JOIN` só na quebra (total vem de consulta sem junção). |
| US-050 | Enum de 10 cores; migração determinística por `createdAt`. (SDD-017 §1) |
| US-051 | **Reaproveitar `PlannedExpense` com `kind`** (ADR-015 §7); `/previstas` ganha abas; "A pagar" inalterada. (SDD-017 §2) |

## 4. Estimativas e ordem técnica

### 4.1 R2.1 (ordem técnica recomendada)
Dependência **dura** prevalece; mudança em relação à ordem do PO (D-PO-12): **US-027 passa para o início** (todo valor das telas seguintes já nasce em `Money`). Não bloqueante: se mantida a ordem do PO, as US-022..024 precisam ser retrabalhadas para `Money` depois.
| Ordem | História | PO | **TL** | SDD | Depende tecnicamente de | Dados / migração | Risco e observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- | :-- |
| 1 | US-027 | 5 | **5** | 010 | — | nenhuma | Auditoria de **todas** as telas; regra de CI |
| 2 | US-022 | 3 | **3** | 011 | US-008/009a | nenhuma | Regressão S1..S13 e homologados **antes e depois** |
| 3 | US-023 | 3 | **3** | 013 | US-017b, US-019 (cenário "arquivada" liga com US-032) | nenhuma | — |
| 4 | US-024 | 2 | **3** | 013 | US-005/006/016a | nenhuma | **+busca `q`** |
| 5 | US-025 | 5 | **5** | 010 | US-012, US-017a, US-018, US-007 | nenhuma | Limite superior; `HomeDTO` muda (contrato interno) |
| 6 | US-026 | 2 | **2** | 010 | US-025 | nenhuma | — |
| 7 | US-028 | 5 | **5** | 011 | US-009a/011/012 | **`r21_familia_configuracoes`** (colunas + `family_events`; famílias existentes ligadas) | Guarda `409` nas rotas de acerto |
| 8 | US-029 | 3 | **3** | 011 | US-028, US-025 | nenhuma | Janela de 12 meses |
| 9 | US-030 | 3 | **3** | 011 | US-028 | default de coluna de `planned_expenses` | **Muda contrato** (default `false`): varrer testes R1/R2 |
| 10 | US-031 | 3 | **3** | 011 | US-022 | nenhuma | cortável (7º) |
| 11 | US-032 | 3 | **5** | 012 | US-004/010 | **`r21_arquivamento`** (colunas, índices de nome parciais) | **`lockAccountsForPosting` em todos os caminhos de postagem** |
| 12 | US-033 | 2 | **3** | 012 | US-032, US-017a | idem | cortável (5º) |
| 13 | US-034 | 3 | **3** | 012 | US-002/003 | nenhuma (usa `family_events`) | último Administrador atômico |
| 14 | US-035 | 5 | **8** (035a 5 + 035b 3) | 012 | US-034, US-032 | **`r21_ex_membro`** (troca de índices únicos de `members`) | **Maior risco da R2.1** (acerto com ex-membro) · cortável (6º) |
| 15 | US-036 | 3 | **3** | 010 | US-013a | nenhuma | cortável (4º) |
| 16 | US-037 | 3 | **3** | 010 | — | nenhuma | cortável (2º); auditoria de cores |
| 17 | US-038 | 2 | **2** | 010 | — | nenhuma | cortável (3º) |
| 18 | US-039 | 5 | **5** | 013 | US-003/007/014 | `r21_convites_reenvio` | cortável (1º); rotação de token |
| | **Total R2.1** | **60** | **67** | | | | Must **40** (022, 023, 024, 025, 026, 027, 028, 029, 030, 032, 034) · Should **17** (031, 033, 035, 036) · Could **10** (037, 038, 039) |
**Só Must = 40** (PO: 37). A ordem de corte do PO (039 ➜ 037 ➜ 038 ➜ 036 ➜ 033 ➜ 035 ➜ 031) **vale sem mudança**; nenhum Must depende de uma história cortável, **exceto**: o cenário "Conta arquivada nunca é sugerida" da US-023 e o saldo "ignora arquivadas" da US-026 só se completam com a US-032 (Must, não é cortável).

### 4.2 R3 (ordem técnica recomendada)
| Ordem | História | PO | **TL** | SDD | Depende tecnicamente de | Dados / migração | Observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- | :-- |
| 0 | EN-003 | 2 | **2** | ADR-018 | — | — | **Concluída** (este ciclo) |
| 1 | US-040 | 5 | **8** (040a 5 + 040b 3) | 014 | US-016a, US-017a, US-024 | `us040_parcelamento` (**`competenceOn` retropreenchido**) | Entrega "Dividir: em breve" |
| 2 | EN-002 | 5 | **13** (002a 5 + 002b 8) | 015 / ADR-016 | US-009a, US-013a/b, US-022 | `en002_…` + **migração de dados com gate** | Release em duas etapas (interface inalterada) |
| 3 | US-042 | 3 | **3** | 014/015 | US-040, **EN-002**, US-030 | — | Must; **depende da EN-002** (ver §5) |
| 4 | US-043 | 5 | **5** | 015 | EN-002, US-030 | — | Libera o modo CUSTOM depois da janela de reversão |
| 5 | US-041 | 5 | **5** | 014 | US-040, US-016b | — | cortável (6º) |
| 6 | US-044 | 3 | **3** | 015 | US-043, US-014 | `us044_…` | cortável (5º) |
| 7 | US-045 | 5 | **5** | 016 | US-005/006/016a/024 | `us045_tags` | — |
| 8 | US-047 | 2 | **2** | 016 | US-045, US-007 | — | — |
| 9 | US-046 | 3 | **3** | 016 | US-045 | — | cortável (4º) |
| 10 | US-048 | 5 | **5** | 016 | US-007, US-025, US-040 (competência) | — | — |
| 11 | US-049 | 5 | **5** | 016 | US-048, US-045, US-047 | — | cortável (3º) |
| 12 | US-050 | 3 | **3** | 017 | US-004/015/037 | `us050_cores` | cortável (2º) |
| 13 | US-051 | 5 | **5** | 017 | US-018/019/025 | `us051_…` | **primeiro a cortar** |
| | **Total R3** | **56** | **67** | | | | Must **11** (040, 042) · Should **48** · Could **8**. Com a EN-002 promovida a Must (§5): Must **24** |

## 5. Dependências técnicas que mudam a ordem ou o corte do PO (R3)
1. **EN-002 ➜ US-042** (hard): a US-042 (Must) exige o percentual **gravado**. O corte do PO ("EN-002 + US-043 por último") **conflita** com os Must. **Recomendação**: tratar a EN-002 como **Must**, ou aceitar a US-042 só depois dela. Alternativa sem EN-002 (âncora `splitRuleVersionId` por lançamento) custa +2 e cria um segundo mecanismo: descartada.
2. **US-041 depois de US-043** (independentes; apenas ordem de risco): a EN-002 isolada em release própria reduz a superfície do corte.
3. **US-048 depende da competência** da US-040 (parcelas por mês da fatura); sem a US-040 ela funciona (por `occurredOn`) e passa a ser correta quando o predicado trocar.
4. **US-033** (cartão) só fecha o critério "parcelas futuras" na R3 (`CARD_HAS_FUTURE_INSTALLMENTS`, reservado).
5. **R2.1 → R3**: o predicado único (`ledger-where.ts`), `findActiveMembership`, o `FamilyEvent` e a interface `explainPeriodSplit` nascem na R2.1 e evitam retrabalho (ADR-016/017/018).

## 6. Riscos técnicos

| Risco | Onde | Mitigação |
| :-- | :-- | :-- |
| Corrida arquivar × postar deixa conta arquivada com saldo ≠ 0 | US-032/033 | `FOR UPDATE` no arquivar, `FOR SHARE` ordenado em todas as postagens (`lockAccountsForPosting`); testes `Promise.all` em ambas as ordens |
| Acerto com ex-membro muda número do passado | US-035 | `removedOn` no motor; vetores S14..S16; regressão S1..S13 + homologados antes/depois |
| Mudança de default `isSharedExpense` quebra testes/clientes | US-030 | Lista de testes em SDD-011 §9; `isSharedExpense` explícito nos testes; guarda de contrato |
| Vazamento de valor com "ocultar" (toast, `aria`, erro do servidor) | US-027 | `Money` único, regra de CI, `maskMoneyInText`, testes de varredura de DOM por tela |
| `HomeDTO` quebra consumidores | US-025 | Tipo único em `home/schemas.ts`; testes de integração e componente reescritos juntos |
| Inversão de paleta deixa estados ilegíveis | US-037 | Teste de contraste por pares × 2 temas; auditoria de cores fixas |
| Troca de índices únicos de `members`/nomes em base com dados | US-032/035 | `DROP`+`CREATE` na mesma migração; testes de migração; janela curta (tabelas pequenas) |
| **Migração do acerto muda 1 centavo** | EN-002 | ADR-016 §5: snapshot, *gate*, motor LEGACY congelado, rollback, release em duas etapas |
| `competenceOn` esquecido em alguma consulta ⇒ Extrato ≠ Resumo ≠ Acerto | US-040 | Predicado único + `check:imports` + propriedade de reconciliação |
| 24 faturas travadas por compra ⇒ *deadlock* | US-040 | Ordem crescente de `ref`; teste de compras simultâneas |
| Parcelas futuras poluem Home/`defaults` | US-040 | `occurredOn <= hoje` em `recent`/`defaults` (lista de impacto no SDD-014 §9) |
| Linha de base E2E incompleta (D-GES-19) | R2.1 | O Dev roda a suíte completa **antes** de iniciar (decisão do Gestor); este TL a considera pré-requisito da US-022 |
| Dependências externas novas | R2.1/R3 | **Nenhuma** (tudo local; e-mail por `MailPort` já existente) — `pendencias-externas.md` inalterado |

## 7. Guia de testes (visão geral; o detalhe BDD → teste está em cada SDD)
1. **Regressão do acerto** (obrigatória a cada release): vetores S1..S13 (+ S14..S16) e **dados homologados nomeados** (316990 / 158495 / 114995; 71700 / 35850 / 26050; 78000 / 62000) em integração, rodando **antes e depois** das migrações da R2.1 e como *gate* na EN-002.
2. **Reconciliação** (propriedade, ≥ 200 conjuntos com semente fixa, `tests/support/prng.ts`): Resumo = Extrato = `byMember`; (R3) Análise = Extrato, Acerto por competência.
3. **Concorrência** (`Promise.all`): arquivar × postar; último Administrador; remoção × rebaixamento; rotação de token; `PATCH /family/settings`.
4. **Isolamento**: teste estrutural de FKs compostas + **canário** em todas as rotas `GET` (ADR-018 §2), além do teste por recurso do SDD-000 §9.4.
5. **Regras de CI** (`check:imports`): `formatBRL` só em `Money`/`MoneyInput`; `occurredOn BETWEEN` só em `ledger-where.ts`; módulos puros novos sem Prisma.
6. **Cenários R1/R2 que mudam** (lista completa em SDD-010 §9, SDD-011 §9, SDD-013 §9): padrão "Só meu" (US-005, US-016a, US-018), texto neutro do acerto (US-009, US-011, US-013, US-013b, US-016a), Home reorganizada (US-012), mensagem de descrição, `isSharedExpense` explícito em integração.
7. Verificação visual manual (375/1280 px; temas claro/escuro) no navegador integrado, registrada no `tasks-board.md`.

## 8. Ajustes pedidos ao PO no backlog
1. Refletir os **pontos do TL** (R2.1 = 67; R3 = 67) e marcar **US-022..039 como Especificadas** (SDD-010..013) e **US-040..051/EN-002** como **Esboçadas** (SDD-014..017); **EN-003 concluída** (ADR-018).
2. **Parcelamento fica na R3** (D-GES-17 não satisfeita). Ordem sugerida: US-040 ➜ EN-002 ➜ US-042 ➜ US-043 ➜ US-041 ➜ US-044 ➜ tags ➜ Análise ➜ cor ➜ receitas previstas.
3. **US-040**: fatiar 040a/040b e **incorporar** os cenários "Excluir a compra parcelada inteira" e "Desfazer a exclusão" (hoje na US-041).
4. **EN-002**: promover a **Must** (ou aceitar que a US-042 só entra depois dela) e acrescentar o cenário "centavos por lançamento não alteram o acerto antigo" (valores ímpares).
5. **US-024**: acrescentar o contrato de **busca por descrição** (`q`, 2..50 caracteres, sem acento-insensibilidade) e a **mensagem única** de descrição.
6. **US-028/029**: alinhar o texto — "diferença em aberto (qualquer mês)" na confirmação de desligar × "janela de 12 meses" no aviso da Home (decisão do TL: ambos, cada um no seu lugar).
7. **US-035**: mensagens **neutras** de gênero ("Você é a única pessoa Administradora…", "Você é a única pessoa na família…") e fatiar 035a/035b; confirmar que "excluir" (US-032/033) é **exclusão lógica** (efeito idêntico para o usuário).
8. **US-039**: acrescentar o cenário "Copiar link/Reenviar invalida o link anterior" e o aviso "O link anterior deixa de valer".
9. **US-036**: o destaque do item no Extrato é parâmetro de interface (`highlight`); sem contrato de API.
10. **Ordem R2.1**: sugerir **US-027 primeiro** (não bloqueante).
11. **Cenários R1/R2** a atualizar na mesma história que os provoca (§7, item 6): o Dev/PO ajustam os `.feature` copiados.

## 9. Rastreio US ➜ SDD/ADR
| História | SDD | ADR |
| :-- | :-- | :-- |
| US-022, 028, 029, 030, 031 | [SDD-011](sdd/SDD-011-acerto-opcional-rotulo-e-previa.md) | ADR-011, **ADR-016** (preparação), ADR-019 |
| US-023, 024, 039 | [SDD-013](sdd/SDD-013-pagamentos-conta-padrao-descricao-e-polimento.md) | ADR-012 |
| US-025, 026, 027, 036, 037, 038 | [SDD-010](sdd/SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) | ADR-010, ADR-013, ADR-018 |
| US-032, 033, 034, 035 | [SDD-012](sdd/SDD-012-manutencao-de-cadastros.md) | **ADR-019**, ADR-007, ADR-014, ADR-018 |
| US-040, 041, 042 | [SDD-014](sdd/SDD-014-parcelamento-esboco.md) (esboço) | **ADR-017**, ADR-014, ADR-016 |
| EN-002, US-043, 044 | [SDD-015](sdd/SDD-015-percentual-por-lancamento-e-migracao-esboco.md) (esboço) | **ADR-016** |
| US-045..049 | [SDD-016](sdd/SDD-016-tags-e-visoes-sinteticas-esboco.md) (esboço) | ADR-017 (competência) |
| US-050, 051 | [SDD-017](sdd/SDD-017-cor-e-receitas-previstas-esboco.md) (esboço) | ADR-015 |
| EN-003 | — | **[ADR-018](adrs/ADR-018-multiplos-grupos-spike.md)** |
