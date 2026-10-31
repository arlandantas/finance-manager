# 📑 Backlog do Produto (Product Owner)

*Status: **Atualização 2026-10-26: UR-1/UR-2 (uso real) refinadas — US-060 refinada e US-085..US-101 propostas (60 pts PO prelim.), ordem aprovada pelo usuário; aguardam SDD/estimativa do TL (pedidos em `pedidos-ao-tech-lead-uso-real.md`; D-PO-99..106)** · **R1 e R2 (Inc 3) Especificadas e homologadas com ressalvas** · **R2.1 (US-022..039): implementada (TASK-026..043)** (SDD-010..013, **67 pts** do TL) · **R3: US-040 e EN-002 implementadas (TASK-044..047, janela de reversão do rateio em curso); US-041..051 aprovadas p/ Dev (SDD-014..017) e não iniciadas**; **R4/R4-S: implementadas (TASK-056..085), exceto US-066..069 (R5 adiada), US-074b e US-076c**; **US-060, US-053 e US-054 não iniciadas**; estado real em `agents/developer/tasks/tasks-board.md` (fila de 2026-10-25) · **EN-003 concluída** (ADR-018) · Atualizado: 2026-10-24 (**R4-S proposta: correções SEC do alpha, US-078..084 e revisões da US-003/012/035/039/070/074/075, D-PO-79..93**; antes, R4 proposta: US-065..077, EN-004..006, D-PO-53..69; antes, 2026-10-05: R2.2 US-052..055, D-PO-48..52)*
*Responsável: Agente Product Owner (PO)*
*Método e portões (DoR/DoD): [`working-agreement.md`](working-agreement.md) · Escopo: [`mvp-definition.md`](mvp-definition.md)*

> **Histórico:** esta revisão **substitui** o backlog inicial (US-001 *Cadastro de transações* e US-002 *Divisão compartilhada*), escrito antes das NEED-001..012, dos ADR-001..006 e do modelo de contas. Equivalências: antiga US-001 ➔ [US-005](stories/US-005-lancar-despesa.md); antiga US-002 ➔ [US-008](stories/US-008-regra-de-divisao-familiar.md) + [US-009a/9b](stories/US-009-painel-de-acerto-de-contas.md).

---

## 🗺️ Mapa da jornada (Story Map)

```text
Espinha:   ENTRAR ───► MONTAR A FAMÍLIA ───► REGISTRAR ───► ACERTAR ───► ENXERGAR ───► PLANEJAR
              │               │                  │             │             │             │
Inc 1 ▸    US-001         US-002 US-003      US-004        US-005        US-007            ·
(skeleton)                                   (contas)      US-006        (extrato)
Inc 2 ▸       ·               ·              US-010        US-008        US-012         US-013
(fechar o mês)                              (transfer.)   US-009        (home)        (corrigir)
                                                          US-011
Inc 3 ▸       ·               ·              US-015 US-016    ·       US-017a/b      US-018 US-019
(AP0 completo)                              (cartão)                  (fatura)       (previstas)
                                            US-014 (categorias) · US-016b (corrigir compra no cartão)
```

*Leitura:* cada coluna é uma capacidade da jornada; cada linha é uma **fatia vertical** que entrega valor de ponta a ponta.

---

## 🏔️ Épicos

Os épicos adotam a numeração do cronograma do Stakeholder ([`cronograma-e-releases.md`](../../stakeholder/cronograma-e-releases.md)); os épicos EPIC-01..05 da versão anterior foram **descontinuados**.

| Épico | Nome | Needs | Release |
| :--- | :--- | :--- | :---: |
| **EPIC-00** | Fundação técnica (enablers) | — | R1 |
| **EPIC-0** | Autenticação Google & Onboarding | NEED-012 | R1 |
| **EPIC-1** | Núcleo Familiar & Membros | NEED-001 | R1 |
| **EPIC-2** | Contas & Movimentações | NEED-002 | R1 |
| **EPIC-3** | Transações & Categorização | NEED-001, NEED-006 (extrato) | R1 / R2 |
| **EPIC-4** | Divisão & Acerto de Contas *(antecipado do AP2, ADR-006)* | NEED-007 | R1 |
| **EPIC-5** | Visão Geral (Dashboard essencial) | NEED-006 (sintético) | R1 |
| **EPIC-6** | Cartões de Crédito (fase 1) | NEED-003 | R2 |
| **EPIC-7** | Despesas Previstas (fase 1) | NEED-004 | R2 |
| EPIC-8..15 | Orçamento, recorrência, caixinhas, desdobramento, conciliação, liquidez, importação, alertas (o **parcelamento** saiu daqui e virou EPIC-20) | NEED-004..011 | AP1 – AP3 |
| **EPIC-16** | Acerto e Divisão Opcionais e Transparentes | NEED-007, NEED-018, NEED-019 | R2.1 / R3 |
| **EPIC-17** | Visão do Mês e Privacidade de Exibição | NEED-014, NEED-015 | R2.1 |
| **EPIC-18** | Manutenção de Cadastros (conta, cartão, família, membros) | NEED-020 | R2.1 |
| **EPIC-19** | Ergonomia e Preferências (descrição, conta padrão, detalhe, tema, desktop, polimento) | NEED-022, NEED-003/004 (ajustes) | R2.1 |
| **EPIC-20** | Cartão Completo: parcelamento | NEED-003 (fase 2 antecipada) | R3 (1ª entrega; não coube na R2.1, TL-02) |
| **EPIC-21** | Classificação e Análise (tags, visões sintéticas, cor, receitas previstas) | NEED-013, NEED-016, NEED-017, NEED-015 | R3 |
| **EPIC-22** | Modelo de Grupos (spike) | NEED-021 | R3 (spike **concluído**, ADR-018) |
| **EPIC-23** | Entrada de Dados e Análise por IA (importação de fatura, infra de LLM, análise de gastos evitáveis) | NEED-026, NEED-027 (NEED-023) | R4-B / R4-C (proposta) |
| **EPIC-24** | Acesso por Assistente de IA (MCP) | NEED-025 | R4-D (proposta) |
| **EPIC-26** | Previsão unificada e visão por conta (porta única de lançar/prever, repetir, transferência prevista) | NEED-031, NEED-030, NEED-033 | UR-1 / UR-2 (proposta) |
| **EPIC-25** | Segurança, Privacidade e Acesso (sessões, direitos do titular/LGPD, cadastro restrito, "Só meu" do dono) | NEED-012, NEED-001, NEED-020 (revisões a validar pelo Stakeholder) | R4-S (proposta) |

---

## 🧮 Priorização

**Critério:** MoSCoW decide o *corte*; **WSJF** `(Valor + Urgência + Risco/Oportunidade) ÷ Tamanho` decide a *ordem* dentro do elegível; **dependência dura prevalece** sobre o WSJF.
Escala 1–10 para V/U/R; Tamanho em Fibonacci relativo (1, 2, 3, 5, 8). **Desde 2026-10-04 o Tam. é a estimativa do Tech Lead** (`tech-lead/status.md`): 70 pontos na R1 (o PO havia estimado 45), WSJF recalculado; a ordem foi mantida (dependência dura prevalece). Itens que passaram de 5 (US-009, US-013) foram **fatiados** em 9a/9b e 13a/13b (5+3 cada).

**Ordem de corte se o prazo apertar:** US-013b → US-009b → US-013a (D-GES-03: a 13a é a última). As fatias 9b e 13b não são dependência de nenhuma outra história; 9a (núcleo Must) nunca é cortada.

| Ordem | ID | História | Épico | MoSCoW | V | U | R | Tam. (TL) | WSJF | Depende de | Status |
| :-: | :-- | :-- | :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- | :-- |
| 1 | [EN-001](stories/EN-001-ambiente-local-e-esqueleto.md) | Ambiente local e esqueleto *(enabler)* | EPIC-00 | Must | 3 | 10 | 8 | 8 | 2,6 | — | Implementada (TASK-001) |
| 2 | [US-001](stories/US-001-login-com-google.md) | Entrar com a conta Google | EPIC-0 | Must | 8 | 9 | 6 | 5 | 4,6 | EN-001 | Implementada (TASK-002) |
| 3 | [US-002](stories/US-002-criar-familia.md) | Criar a família | EPIC-0 | Must | 7 | 9 | 3 | 3 | 6,3 | US-001 | Implementada (TASK-003) |
| 4 | [US-004](stories/US-004-cadastrar-conta-bancaria.md) | Cadastrar conta com saldo inicial | EPIC-2 | Must | 8 | 8 | 3 | 5 | 3,8 | US-002 | Implementada (TASK-004) |
| 5 | [US-005](stories/US-005-lancar-despesa.md) | Lançar despesa rapidamente | EPIC-3 | Must | 10 | 8 | 5 | 5 | 4,6 | US-004 | Implementada (TASK-005) |
| 6 | [US-006](stories/US-006-lancar-receita.md) | Lançar receita | EPIC-3 | Must | 7 | 6 | 2 | 2 | 7,5 | US-005 | Implementada (TASK-006) |
| 7 | [US-007](stories/US-007-extrato-de-lancamentos.md) | Extrato com filtros | EPIC-3 | Must | 8 | 6 | 3 | 5 | 3,4 | US-005, US-006 | Implementada (TASK-007) |
| 8 | [US-003](stories/US-003-convidar-membro.md) | Convidar membro por e-mail | EPIC-1 | Must | 8 | 7 | 4 | 5 | 3,8 | US-002 | Implementada (TASK-008) |
| 9 | [US-008](stories/US-008-regra-de-divisao-familiar.md) | Regra de divisão familiar | EPIC-4 | Must | 9 | 4 | 5 | 3 | 6,0 | US-003 | Implementada (TASK-009) |
| 10 | [US-009a](stories/US-009-painel-de-acerto-de-contas.md) | Acerto de contas: motor + painel essencial | EPIC-4 | Must | 9 | 6 | 7 | 5 | 4,4 | US-005, US-008 | Implementada (TASK-010) |
| 11 | [US-010](stories/US-010-transferencia-entre-contas.md) | Transferir entre contas | EPIC-2 | Must | 6 | 4 | 3 | 3 | 4,3 | US-004 | Implementada (TASK-011) |
| 12 | [US-011](stories/US-011-registrar-acerto-de-contas.md) | Registrar o acerto | EPIC-4 | Must | 7 | 5 | 4 | 5 | 3,2 | US-009a, US-010 | Implementada (TASK-012) |
| 13 | [US-012](stories/US-012-home-dashboard.md) | Home essencial | EPIC-5 | Must | 8 | 5 | 3 | 5 | 3,2 | US-004, US-007, US-009a | Implementada (TASK-013) |
| 14 | [US-009b](stories/US-009b-acerto-tres-membros-e-detalhe.md) | Acerto: 3+ membros e detalhe das despesas | EPIC-4 | Should | 4 | 2 | 3 | 3 | 3,0 | US-009a | Implementada (TASK-014) · **cortável** |
| 15 | [US-013a](stories/US-013-corrigir-ou-estornar-lancamento.md) | Corrigir/excluir/restaurar lançamento (núcleo) | EPIC-3 | Should | 6 | 4 | 4 | 5 | 2,8 | US-005, US-007, US-009a | Implementada (TASK-015) · **Should dentro da R1** (D-GES-03) |
| 16 | [US-013b](stories/US-013b-desfazer-e-mes-acertado.md) | Desfazer transferência/acerto e aviso de mês acertado | EPIC-3 | Should | 3 | 2 | 2 | 3 | 2,3 | US-013a, US-010, US-011 | Implementada (TASK-016) · **cortável** |
| 17 | [US-015](stories/US-015-cadastrar-cartao-de-credito.md) | Cadastrar cartão de crédito | EPIC-6 | Must | 6 | 3 | 3 | 3 | 4,0 | US-002 | Implementada (TASK-018) |
| 18 | [US-016a](stories/US-016-compra-a-vista-no-cartao.md) | Compra à vista no cartão | EPIC-6 | Must | 7 | 3 | 4 | 5 | 2,8 | US-015, US-005, US-007 | Implementada (TASK-019) |
| 19 | [US-017a](stories/US-017-ver-fatura-do-cartao.md) | Ver a fatura do cartão e o limite | EPIC-6 | Must | 7 | 3 | 4 | 3 | 4,7 | US-016a | Implementada (TASK-020) |
| 20 | [US-018](stories/US-018-despesa-prevista-pontual.md) | Despesa prevista pontual (+ bloco "A pagar" na Home) | EPIC-7 | Must | 6 | 3 | 2 | 5 | 2,2 | US-005, US-012 (+ US-017a para faturas) | Implementada (TASK-021) |
| 21 | [US-019](stories/US-019-dar-baixa-em-despesa-prevista.md) | Dar baixa em despesa prevista | EPIC-7 | Must | 6 | 3 | 3 | 5 | 2,4 | US-018, US-004 | Implementada (TASK-022) |
| 22 | [US-017b](stories/US-017b-pagar-a-fatura.md) | Pagar a fatura | EPIC-6 | Should | 5 | 2 | 3 | 5 | 2,0 | US-017a, US-004, US-010 | Implementada (TASK-023) · Should em R2 (D-GES-04) · **cortável** |
| 23 | [US-016b](stories/US-016b-corrigir-compra-no-cartao-e-filtro.md) | Corrigir/excluir compra no cartão e filtrar por cartão | EPIC-6 | Should | 3 | 2 | 3 | 3 | 2,7 | US-016a, US-013a, US-007 | Implementada (TASK-024) · **cortável** |
| 24 | [US-014](stories/US-014-gerenciar-categorias.md) | Gerenciar categorias | EPIC-3 | Could | 4 | 2 | 1 | 3 | 2,3 | US-002, US-005 | Implementada (TASK-017) · **primeira a cortar** |

> **Ordem de corte da R2 se o prazo apertar:** US-014 → US-017b → US-016b. A ordem da tabela é a de **execução recomendada** (dependência dura > WSJF): cartão (015 → 016a → 017a), previstas (018 → 019), depois as fatias cortáveis. Nada na R2 depende de US-014, US-016b ou US-017b; as três podem sair sem quebrar as demais (sem a 017b, o cenário "Fatura fechada" continua válido: a fatura apenas não pode ser paga no app).
> **Tamanhos desta tabela (R2):** o Tech Lead **confirmou** as estimativas do PO sem alteração (32 pontos; `tech-lead/status.md`). A US-016a está no limite superior (≤ 5) e pode ser entregue em *commits* atômicos.

> **Por que US-003 (convite) vem depois do extrato?** O WSJF empata em valor, mas o **walking skeleton** (entrar → criar família → conta → lançar → ver) precisa fechar *sozinho* primeiro; o convite habilita o split, que só tem valor com 2 membros e é entregue no Incremento 2. A ordem da tabela é a de **execução recomendada**.

### R2: resumo do critério central (detalhe nas histórias)
| ID | Critério central |
| :-- | :-- |
| US-015 | Cartão com titular, limite, dia de fechamento (1..28) e de vencimento (1..28); não entra no saldo; ciclo editável só antes da primeira compra. |
| US-016a | Compra à vista no drawer ("Pagar com" conta **ou** cartão): consome o **limite**, entra na **fatura** do ciclo (até o dia do fechamento, inclusive), **não mexe em saldo de conta**; continua nas despesas do mês e no acerto pela data da compra. |
| US-016b | Corrigir/excluir compra no cartão, mudança de fatura por data, filtro por cartão no extrato. |
| US-017a | Fatura por ciclo: total, fechamento, vencimento, situação (Aberta/Fechada/Vencida/Paga), subtotal por membro, limite usado/disponível. |
| US-017b | *Should:* pagar a fatura **fechada** (integral) a partir de uma conta: debita a conta, libera o limite e **não é despesa**; desfazer; fatura paga fica travada. |
| US-018 | Previsão (`PREVISTO`) com vencimento e **responsável**; não é lançamento (não afeta saldo, extrato, totais nem acerto); tela "Contas a pagar" e bloco "A pagar" na Home. |
| US-019 | Baixa com conta, data e **valor efetivo** (pode diferir do previsto); gera a despesa real; `PAGO`; desfazer; baixa única. |
| US-014 | Criar, renomear e arquivar/reativar categorias (sem exclusão); histórico preservado. |

### Fora do MVP (parking lot, sem refinamento)
| ID | Item | Observação |
| :-- | :-- | :-- |
| US-020 | Permissões granulares por conta/cartão | Hoje vale **D-PO-02** (todos veem tudo). Refinar se o Stakeholder rejeitar a decisão. |
| US-021 | Membros sem login (dependentes) como responsáveis pelo gasto | **Absorvida pela NEED-028 (2026-10-26, Q-U15): ver US-092..US-095.** |
| AP1+ | Ciclo com dia de corte, tetos, auto-clonagem, disponibilidade, parcelamento, recorrência | NEED-003/004/005/006 — refinar ao final do Incremento 3. |

---

## 🔁 Backlog pós-homologação: R2.1 e R3 *(adicionado em 2026-10-04)*

Origem: homologação com ressalvas de R1+R2 ([`_historico/stakeholder/homologacao-r1-r2.md`](../../_historico/stakeholder/homologacao-r1-r2.md)) e feedback do usuário ([`_historico/stakeholder/parecer-feedback-usuario.md`](../../_historico/stakeholder/parecer-feedback-usuario.md), Q-F01..Q-F14, todas **aprovadas pelo Gestor**). Decisões de solução do PO: [`_historico/product-owner/backlog/decisoes-po-r21-r3.md`](../../_historico/product-owner/backlog/decisoes-po-r21-r3.md) (D-PO-12..32, **ratificadas** em D-GES-14; as pós-TL D-PO-33..42 **aguardam ratificação**). Perguntas ao Tech Lead: [`_historico/product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md`](../../_historico/product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md). O Tech Lead **respondeu** em [`_historico/tech-lead/respostas-r21-r3.md`](../../_historico/tech-lead/respostas-r21-r3.md) (2026-10-04): os pontos abaixo são **os do TL** e as decisões D-PO-33..42 aplicam os seus ajustes (§8).

### R2.1 — "Ressalvas e ajustes de baixo risco" (sem mexer no motor do acerto) — **67 pts** (TL; PO prelim. 60)
**Ordem final de execução (D-PO-35)** — dependência dura > WSJF; **US-027 primeiro** (recomendação do TL: ocultar valores antes de Resumo e Saldos, evitando retrabalho para `Money`), seguida das **ressalvas 1 e 3** (US-022 e US-023) e da US-024; **linha de base E2E completa antes de começar** (D-GES-19). Pontos acumulados na coluna final do resumo abaixo.

| Ordem | ID | História | Épico | MoSCoW | V/U/R | Pts (TL) | WSJF | Depende de | Rastreio (NEED) | Status · corte / nota |
| :-: | :-- | :-- | :-- | :-: | :-: | :-: | :-: | :-- | :-- | :-- |
| 1 | [US-027](stories/US-027-ocultar-valores.md) | Ocultar valores (item 3) | EPIC-17 | Must | 8/5/4 | 5 | 3,4 | — | NEED-014 · Q-F04 | Implementada (TASK-026) · **1ª da R2.1** (D-PO-35): todo valor das telas seguintes já nasce em `Money`; auditoria de todas as telas |
| 2 | [US-022](stories/US-022-rotulo-honesto-da-regra-de-divisao.md) | Rótulo honesto da regra de divisão (ressalva 1) | EPIC-16 | Must | 5/4/3 | 3 | 4,0 | US-008, US-009a | NEED-007, NEED-018 · ressalva 1 | Implementada (TASK-027) · **Ressalva 1**, logo após a US-027; regressão S1..S13 e homologados antes e depois |
| 3 | [US-023](stories/US-023-conta-de-origem-padrao-inteligente.md) | Conta de origem padrão inteligente (ressalva 3) | EPIC-19 | Must | 4/3/3 | 3 | 3,3 | US-017b, US-019 | NEED-003, NEED-004 · ressalva 3 | Implementada (TASK-028) · **Ressalva 3**; o cenário "arquivada nunca é sugerida" só se completa com a US-032 |
| 4 | [US-024](stories/US-024-descricao-visivel-e-opcional.md) | Descrição visível e opcional (item 5) | EPIC-19 | Must | 6/3/2 | 3 (PO: 2) | 3,7 | US-005, US-006, US-016a | NEED-022 · Q-F13 | Implementada (TASK-029) · **+ busca `q` e mensagem única** (TL-08) |
| 5 | [US-025](stories/US-025-resumo-do-mes-na-home.md) | Resumo do Mês na Home (item 8) | EPIC-17 | Must | 9/5/4 | 5 | 3,6 | US-012, US-017a, US-018, US-007, **US-027** | NEED-015 · Q-F03/F03b | Implementada (TASK-030) · limite superior (5); `HomeDTO` muda (contrato interno) |
| 6 | [US-026](stories/US-026-saldos-das-contas-em-card-recolhivel.md) | Saldos das contas em card recolhível | EPIC-17 | Must | 4/2/1 | 2 | 3,5 | US-025, US-004 | NEED-015, NEED-009 (RN08) | Implementada (TASK-031) · o saldo "ignora arquivadas" só se completa com a US-032 |
| 7 | [US-028](stories/US-028-acerto-de-contas-opcional.md) | Acerto de contas opcional por família (item 2) | EPIC-16 | Must | 8/4/4 | 5 | 3,2 | US-009a, US-011, US-012 | NEED-019 · Q-F01 | Implementada (TASK-032) · migração `r21_familia_configuracoes`; guarda `409 SETTLEMENT_DISABLED` |
| 8 | [US-029](stories/US-029-indicador-neutro-de-acerto-e-divida-antiga.md) | Indicador neutro de acerto e dívida de mês anterior (ressalva 2) | EPIC-16 | Must | 5/2/3 | 3 | 3,3 | US-028, US-025 | NEED-019, NEED-007 · ressalva 2 | Implementada (TASK-033) · Home: janela de 12 meses; desligar: todos os meses (D-PO-37) |
| 9 | [US-030](stories/US-030-dividir-desligado-por-padrao.md) | "Dividir" desligado por padrão (item 9a) | EPIC-16 | Must | 6/3/3 | 3 | 4,0 | US-028, US-005, US-018 | NEED-018 · Q-F02 | Implementada (TASK-034) · **muda contrato** (default `isSharedExpense = false`): varrer testes R1/R2 (SDD-011 §9) |
| 10 | [US-031](stories/US-031-previa-de-impacto-da-regra-e-sugestao-pela-renda.md) | Prévia de impacto da regra e sugestão pela renda (ressalva 4) | EPIC-16 | Should | 3/1/2 | 3 | 2,0 | US-008, US-022 | NEED-007 · ressalva 4 | Implementada (TASK-035) · cortável (7º) |
| 11 | [US-032](stories/US-032-arquivar-reativar-e-excluir-conta.md) | Arquivar, reativar e excluir conta (item 13) | EPIC-18 | Must | 5/3/2 | 5 (PO: 3) | 2,0 | US-004, US-010 | NEED-020 · Q-F11 | Implementada (TASK-036) · **exclusão lógica**; `lockAccountsForPosting` em todo caminho de postagem (maior risco técnico) |
| 12 | [US-033](stories/US-033-arquivar-e-reativar-cartao.md) | Arquivar e reativar cartão (item 13) | EPIC-18 | Should | 3/1/1 | 3 (PO: 2) | 1,7 | US-015, US-017a, US-032 | NEED-020 | Implementada (TASK-037) · cortável (5º); exclusão lógica; "parcelas futuras" só fecha na R3 |
| 13 | [US-034](stories/US-034-editar-familia-e-papeis.md) | Editar a família e papéis (item 15) | EPIC-18 | Must (nome) / Should (papel) | 5/2/2 | 3 | 3,0 | US-002, US-003 | NEED-020 | Implementada (TASK-038) · último Administrador atômico; papel cortável |
| 14 | [US-035](stories/US-035-remover-membro-e-sair-da-familia.md) | Remover membro e sair da família (item 15) | EPIC-18 | Should | 5/1/3 | 8 (PO: 5) | 1,1 | US-034, US-032 | NEED-020 · Q-F07 | Implementada (TASK-039) · **035a (5) + 035b (3)**; maior risco da R2.1; mensagens neutras; cortável (6º) |
| 15 | [US-036](stories/US-036-detalhe-da-transacao-na-home.md) | Detalhe da transação na Home (item 12) | EPIC-19 | Should | 4/1/2 | 3 | 2,3 | US-012, US-013a, US-007 | NEED-022 | Implementada (TASK-040) · cortável (4º); `highlight` é parâmetro de UI |
| 16 | [US-037](stories/US-037-tema-claro-escuro.md) | Tema claro e escuro (item 14) | EPIC-19 | Could | 3/1/1 | 3 | 1,7 | — | NEED-022 | Implementada (TASK-041) · **cortável (2º)**; auditoria de cores |
| 17 | [US-038](stories/US-038-navegacao-desktop-conteudo-contido.md) | Navegação desktop com conteúdo contido (item 4) | EPIC-19 | Could | 2/1/1 | 2 | 2,0 | — | NEED-022 · Q-F06 | Implementada (TASK-042) · **cortável (3º)** |
| 18 | [US-039](stories/US-039-polimento-da-homologacao.md) | Polimento da homologação (achados 5, 8, 11, 12, 13) | EPIC-19 | Could | 4/1/2 | 5 | 1,4 | US-003, US-007, US-014 | achados da homologação | Implementada (TASK-043) · **primeiro a cortar**; rotação do token do convite |

| Subtotal | Pts |
| :-- | :-: |
| Must (027, 022, 023, 024, 025, 026, 028, 029, 030, 032, 034) | **40** |
| Should (031, 033, 035, 036) | **17** |
| Could (037, 038, 039) | **10** |
| **Total R2.1** | **67** |

**Pontos acumulados na ordem de execução:** 027 (5) = 5 ➔ 022 (3) = 8 ➔ 023 (3) = 11 ➔ 024 (3) = 14 ➔ 025 (5) = 19 ➔ 026 (2) = 21 ➔ 028 (5) = 26 ➔ 029 (3) = 29 ➔ 030 (3) = 32 ➔ 031 (3) = 35 ➔ 032 (5) = 40 ➔ 033 (3) = 43 ➔ 034 (3) = 46 ➔ 035 (8) = 54 ➔ 036 (3) = 57 ➔ 037 (3) = 60 ➔ 038 (2) = 62 ➔ 039 (5) = 67.

**Ordem de corte da R2.1 (primeiro a sair):** US-039 (5) ➔ **US-037 (tema, 3)** ➔ **US-038 (navegação desktop, 2)** ➔ **US-036 (detalhe, 3)** ➔ US-033 (3) ➔ US-035 (8) ➔ US-031 (3). Cortando tudo isso saem 27 pts e sobram os **40 pts de Must**. Nada dos Must depende de uma história cortável (confirmado pelo TL), **exceto** que o cenário "Conta arquivada nunca é sugerida" (US-023) e o saldo "ignora arquivadas" (US-026) só se completam com a US-032 (Must, não cortável): ficam **pendentes até a US-032** e entram no aceite dela. A parte "alterar papel" da US-034 é Should dentro de uma história Must.

> **Parcelamento na R2.1? Não (D-PO-33).** A regra de D-GES-17 não foi satisfeita: o TL estimou a US-040 em **8** (> 5) e a US-042 depende da EN-002 (percentual gravado). Fica como **1ª entrega da R3**, na ordem US-040 ➔ EN-002 ➔ US-042 ➔ US-043 ➔ US-041. Enquanto isso, "Dividir" mostra "Disponível em breve" na compra parcelada.

### R2.2 — "Ajustes da homologação da R2.1" (pacote pequeno, 2026-10-05) — **11 pts (PO, prelim.; TL a estimar)**
Origem: [`_historico/stakeholder/homologacao-r21.md`](../../_historico/stakeholder/homologacao-r21.md) (HOMOLOGA COM RESSALVAS: 1 Importante e Melhorias). **Execução imediata, fora da R3-A/R3-B**, sem tocar no motor do acerto (não interfere na EN-002 nem na janela de reversão). O achado 8 (lentidão do servidor de desenvolvimento) é do Tech Lead e **não** vira história. Pedido ao TL: [`_historico/product-owner/backlog/pedidos-ao-tech-lead-r22.md`](../../_historico/product-owner/backlog/pedidos-ao-tech-lead-r22.md).

| Ordem | ID | História | Épico | MoSCoW | V/U/R | Pts (PO) | WSJF | Depende de | Rastreio (NEED) | Status · corte / nota |
| :-: | :-- | :-- | :-- | :-: | :-: | :-: | :-: | :-- | :-- | :-- |
| 1 | [US-052](stories/US-052-aviso-visivel-parcelado-fora-do-acerto.md) | Aviso visível: parcelado fora do acerto (achado 1, **Importante**) | EPIC-20 | **Must** | 7/5/3 | 2 | 7,5 | US-040a/b, US-030, US-029 | NEED-003, NEED-007 · Q-F05 | Implementada (TASK-049) · **não cortar**; some quando a US-042 sair |
| 2 | [US-054](stories/US-054-avisar-antes-de-arquivar-e-botao-flutuante-em-contas.md) | Avisar antes de arquivar + "+" não cobre ações em Contas (achados 2 e 5) | EPIC-18 | Should | 4/1/1 | 3 | 2,0 | US-032, US-033, US-039 | NEED-020 | Refinada · cortável (2º); o aviso do cartão é "recomendado" pelo Stakeholder |
| 3 | [US-055](stories/US-055-faturas-na-tela-a-pagar.md) | Faturas na tela "A pagar" (achado 7) | EPIC-17 | Should | 3/1/1 | 3 | 1,7 | US-017a/b, US-018, US-019, US-025 | NEED-003, NEED-004, NEED-015 | Implementada (TASK-052) · cortável (3º); total reconcilia com o Resumo |
| 4 | [US-053](stories/US-053-clareza-de-textos-acerto-desligado-regra-e-olho.md) | Clareza de textos: acerto desligado, regra só leitura, dica do olho (achados 3, 4 e 6) | EPIC-19 | Could | 3/1/1 | 3 | 1,7 | US-028, US-031, US-027, US-036 | NEED-019, NEED-007, NEED-014 | Refinada · **cortável (1º)**; achado 6 = **mantido** (D-PO-50) |

**Pontos acumulados:** US-052 (2) = 2 ➔ US-054 (3) = 5 ➔ US-055 (3) = 8 ➔ US-053 (3) = 11. **Ordem de corte:** 053 ➔ 055 ➔ 054; a US-052 não se corta. Nenhuma pergunta bloqueante; o Dev só começa com o SDD/estimativa do TL (pedido r22).

### v0 alpha — "Primeiro uso real" (2026-10-05) — **41 pts (PO, prelim.): 30 Must + 11 Should**
Pacote derivado de [`escopo-v0-alpha.md`](../../stakeholder/escopo-v0-alpha.md); ordem, dependências, linha de corte e pedido ao TL em [`release-v0-alpha.md`](release-v0-alpha.md). **Must:** US-056 (3, polimento modal/contraste), US-052 (2), US-057 (3, conta fora do saldo), US-058 (8, recorrente mensal) + US-059 (2, conta na previsão), US-055 (3), US-061 (5, Início enxuta), US-062 (2, filtros), US-063 (2, "Previstas"). **Should:** US-064 (2, menu lateral desktop, 1º), US-060 (3, resumo por conta), US-042 (3), US-054 (3). **Corte:** US-054 ➔ US-042 ➔ US-060 ➔ US-064.

### R3 — "Cartão completo e análise" (1ª fatia do AP1) — **67 pts** (TL; PO prelim. 56; EN-003 já entregue: **65 pendentes**)
**Duas entregas (D-PO-43, D-GES-23):** **R3-A (21 pts)** = US-040a/b (8) + EN-002a/b (13), com a **interface inalterada** e os números idênticos ao *snapshot*; **R3-B (44 pts)** = US-042 (3), US-043 (5), US-041 (5), US-044 (3), US-045 (5), US-047 (2), US-046 (3), US-048 (5), US-049 (5), US-050 (3), US-051 (5). **Entre as duas há uma pausa** para a homologação e a **janela de reversão** (≥ 7 dias, `--verify` limpo e um fechamento de mês conferido; TL-11, ADR-021). A **EN-002 só começa** com os vetores S1..S16 e os valores homologados verdes e o *gate* de 1 centavo; o `computeSettlementLegacy` é extraído em commit à parte. A ordem de execução e o corte abaixo **não mudam**; o corte só atinge itens da R3-B. A US-042 (Must) passa a ser a primeira da R3-B (depois da janela), porque a parcela dividida cria rateios que o motor `LEGACY` não representa.

**Ordem final de execução (D-PO-33/34)**: EN-003 (concluída) · **US-040 ➔ EN-002 ➔ US-042 ➔ US-043 ➔ US-041** ➔ US-044 ➔ tags (US-045 ➔ 047 ➔ 046) ➔ Análise (US-048 ➔ 049) ➔ cor (US-050) ➔ receitas previstas (US-051). A EN-002 precede a US-042 (dependência dura) e a US-041 vem depois da US-043 (ordem de risco, TL §5).

| Ordem | ID | História | Épico | MoSCoW | V/U/R | Pts (TL) | WSJF | Depende de | Rastreio (NEED) | Status · corte / nota |
| :-: | :-- | :-- | :-- | :-: | :-: | :-: | :-: | :-- | :-- | :-- |
| 0 | [EN-003](stories/EN-003-spike-modelo-multiplos-grupos.md) | Spike de modelo: múltiplos grupos (enabler, dono TL) | EPIC-22 | Should | 2/2/0 | 2 (**concluída**) | 2,0 | — | NEED-021 · Q-F08 | **Concluída** (ADR-018: N:N já existe estruturalmente; 1 pessoa em 2 grupos = 13 pts; conta privada = 13 a 21; não construir agora) |
| 1 | [US-040](stories/US-040-compra-parcelada-no-cartao.md) | Compra parcelada no cartão (básico, item 6) | EPIC-20 | Must | 9/3/5 | 8 (040a 5 + 040b 3; PO: 5) | 2,1 | US-016a, US-017a, US-024 | NEED-003 · Q-F14 | Implementada (TASK-044/045) · **1ª entrega**; migração com `competenceOn`; recebe a exclusão da compra inteira; **não cortar** |
| 2 | [EN-002](stories/EN-002-percentual-gravado-por-lancamento.md) | Percentual gravado por lançamento + migração (enabler) | EPIC-16 | **Must** | 4/2/8 | 13 (002a 5 + 002b 8; PO: 5) | 1,1 | US-009a, US-013a/b, US-022; após a US-040 na ordem | NEED-018 | Implementada (TASK-046/047) · **Must (D-PO-34)**; release em duas etapas (motor STORED com interface inalterada; gate de 1 centavo); **não cortar** |
| 3 | [US-042](stories/US-042-parcelado-dividido-no-acerto-por-parcela.md) | Parcelado dividido: acerto por parcela | EPIC-20 | Must | 5/1/2 | 3 | 2,7 | US-040, **EN-002**, US-030 | NEED-003, NEED-007 · Q-F05 | Aprovada p/ Dev, não iniciada (SDD-014; bloqueada pela janela de reversão do rateio) · **depende da EN-002**; **não cortar** |
| 4 | [US-043](stories/US-043-dividir-no-lancamento-tres-modos.md) | Dividir no lançamento: três modos (item 9b) | EPIC-16 | Should | 7/2/4 | 5 | 2,6 | EN-002, US-030 | NEED-018 · Q-F02b | Aprovada p/ Dev, não iniciada (SDD-015; bloqueada pela janela de reversão) · libera o modo CUSTOM após a janela de reversão; **cortável (7º, o último)** |
| 5 | [US-041](stories/US-041-gerenciar-compra-parcelada.md) | Gerenciar compra parcelada (editar parcelas, excluir uma parcela) | EPIC-20 | Should | 5/2/3 | 5 | 2,0 | US-040 (com exclusão da compra inteira), US-016b; após a US-043 | NEED-003 | Aprovada p/ Dev, não iniciada (SDD-014) · depois da US-043 (ordem de risco); cortável (6º) |
| 6 | [US-044](stories/US-044-lembrar-dividir-por-categoria-e-revisao-do-mes.md) | Lembrar "dividir" por categoria e revisar no fechamento | EPIC-16 | Should | 4/1/2 | 3 | 2,3 | US-043, US-014 | NEED-018 (risco C7) | Aprovada p/ Dev, não iniciada (SDD-015; bloqueada pela janela de reversão) · cortável (5º) |
| 7 | [US-045](stories/US-045-tags-livres-no-lancamento.md) | Tags livres no lançamento (item 1) | EPIC-21 | Should | 6/2/4 | 5 | 2,4 | US-005, US-006, US-016a, US-024 | NEED-013 · Q-F09 | Implementada (TASK-086), aguardando validação do Gestor |
| 8 | [US-047](stories/US-047-filtrar-extrato-por-tag.md) | Filtrar o Extrato por tag | EPIC-21 | Should | 4/2/1 | 2 | 3,5 | US-045, US-007 | NEED-013, NEED-006 | Implementada (TASK-087), aguardando validação do Gestor · drill-down das visões |
| 9 | [US-046](stories/US-046-gerenciar-tags.md) | Gerenciar tags (renomear, mesclar, remover) | EPIC-21 | Should | 3/1/1 | 3 | 1,7 | US-045 | NEED-013 | Aprovada p/ Dev, não iniciada (SDD-016) · cortável (4º) |
| 10 | [US-048](stories/US-048-visao-sintetica-periodo-totais-e-categoria.md) | Visão sintética: período, totais e categoria (item 7) | EPIC-21 | Should | 7/3/3 | 5 | 2,6 | US-007, US-025 | NEED-016 · Q-F10 | Aprovada p/ Dev, não iniciada (SDD-016) · depende da competência da US-040 |
| 11 | [US-049](stories/US-049-visao-sintetica-quebras-e-filtros.md) | Visão sintética: quebras e filtros combináveis | EPIC-21 | Should | 5/2/3 | 5 | 2,0 | US-048, US-045, US-047 | NEED-016 · Q-F10 | Aprovada p/ Dev, não iniciada (SDD-016) · cortável (3º) |
| 12 | [US-050](stories/US-050-cor-por-conta-e-cartao.md) | Cor por conta e cartão (item 11) | EPIC-21 | Could | 2/1/1 | 3 | 1,3 | US-004, US-015, US-037 | NEED-017 | Aprovada p/ Dev, não iniciada (SDD-017) · **cortável (2º)** |
| 13 | [US-051](stories/US-051-receitas-previstas-e-saldo-previsto.md) | Receitas previstas e saldo previsto completo | EPIC-21 | Could | 4/1/2 | 5 | 1,4 | US-018, US-019, US-025 | NEED-015, NEED-004 · Q-F03 | Aprovada p/ Dev, não iniciada (SDD-017) · **primeiro a cortar** |

| Subtotal | Pts |
| :-- | :-: |
| Must (040, **EN-002**, 042) | **24** |
| Should (043, 041, 044, 045, 047, 046, 048, 049, EN-003) | **35** (33 pendentes) |
| Could (050, 051) | **8** |
| **Total R3** | **67** (65 pendentes: **R3-A 21** + **R3-B 44**) |

**Pontos acumulados (pendentes):** US-040 = 8 ➔ EN-002 = 21 ➔ US-042 = 24 ➔ US-043 = 29 ➔ US-041 = 34 ➔ US-044 = 37 ➔ US-045 = 42 ➔ US-047 = 44 ➔ US-046 = 47 ➔ US-048 = 52 ➔ US-049 = 57 ➔ US-050 = 60 ➔ US-051 = 65.

**Ordem de corte da R3 (reescrita, D-PO-34; primeiro a sair):** US-051 (5) ➔ US-050 (3) ➔ US-049 (5) ➔ US-046 (3) ➔ US-044 (3) ➔ US-041 (5) ➔ **US-043 (5, a última)**. A **EN-002 saiu da lista**: é Must porque a US-042 depende dela; só a US-043 (modo "De outro jeito"), que vem depois, é cortável. Cortando tudo isso saem 29 pts e sobram **36 pts**: os 24 de Must (US-040, EN-002, US-042) mais tags (US-045 e 047) e a visão básica (US-048), que só saem por decisão do Gestor. **AP1 (tetos, ciclo, recorrência) vem logo após a R3** (Q-F12).

### R4 (proposta) — "Entrada facilitada e IA" (2026-10-24) — **81 pts (PO, prelim.): Must 36 · Should 32 · Could 13** *(revisão 2 do MCP: ver a seção do POC abaixo; total com EN-007, POC e ampliação = 102 pts)*

Origem: [NEED-024..027](../../stakeholder/needs) e a proposta de encaixe do Stakeholder ([`cronograma-e-releases.md`](../../stakeholder/cronograma-e-releases.md)). Decisões **D-PO-53..69** e perguntas **Q-U01..Q-U12** (com hipótese adotada) em [`_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md`](../../_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md); pedido ao Tech Lead (ADRs de LLM, privacidade/retenção, MCP, custo, testes) em [`_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md`](../../_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md). Fluxos: [FLUXO-015](../flows/FLUXO-015-importar-fatura-por-arquivo.md), [FLUXO-016](../flows/FLUXO-016-privacidade-e-consentimento-ia.md), [FLUXO-017](../flows/FLUXO-017-analise-de-gastos-evitaveis.md). **Nada aqui altera o motor do acerto nem a EN-002.**

| Ordem | ID | História | Entrega | Épico | MoSCoW | Pts | Depende de | Rastreio | Status |
| :-: | :-- | :-- | :-: | :-- | :-: | :-: | :-- | :-- | :-- |
| 1 | [US-065](stories/US-065-parcelas-ja-pagas-na-entrada.md) | Parcelas já pagas na entrada | **R4-A** | EPIC-20 | **Must** | 5 | US-040a/b, US-041 (divisão: US-042) | NEED-024 | Implementada (TASK-056) · sem IA, pode andar já |
| 2 | [EN-004](stories/EN-004-infra-llm-chave-do-app-e-teto-de-custo.md) | Infra de LLM: chave do app, cliente único, teto de custo *(Habilitadora)* | R4-B | EPIC-23 | **Must** | 8 | ADR do TL; Q-U08/Q-U10 | NEED-026/027 | Implementada (TASK-057) |
| 3 | [EN-005](stories/EN-005-opt-in-de-privacidade-para-ia.md) | Opt-in de privacidade por família *(Habilitadora)* | R4-B | EPIC-23 | **Must** | 5 | EN-004; Q-U01/Q-U07 | NEED-026/027 | Implementada (TASK-058) |
| 4 | [US-066](stories/US-066-enviar-fatura-e-validar-arquivo.md) | Enviar a fatura e validar o arquivo | R4-B | EPIC-23 | **Must** | 5 | EN-004, EN-005 | NEED-026 | Refinada, não iniciada (R5 adiada) |
| 5 | [US-067](stories/US-067-revisar-itens-extraidos-da-fatura.md) | Revisar os itens extraídos | R4-B | EPIC-23 | **Must** | 8 | US-066 | NEED-026 | Refinada, não iniciada (R5 adiada) (fatiável) |
| 6 | [US-068](stories/US-068-confirmar-e-gravar-importacao.md) | Confirmar e gravar (lote atômico, sem duplicar) | R4-B | EPIC-23 | **Must** | 5 | US-067 | NEED-026 | Refinada, não iniciada (R5 adiada) |
| 7 | [US-069](stories/US-069-reverter-importacao-em-lote.md) | Reverter importação em lote | R4-B | EPIC-23 | Should | 3 | US-068 | NEED-026 | Refinada, não iniciada (R5 adiada) · **1º corte do bloco** |
| — | | **Fim dos Must = 36 pts** (R4-A 5 + R4-B 31) | | | | **36** | | | |
| 8 | [US-070](stories/US-070-analise-de-gastos-evitaveis.md) | Análise de gastos evitáveis | R4-C | EPIC-23 | Should | 8 | EN-004, EN-005, US-048/049 | NEED-027 | Implementada (TASK-059/060) |
| 9 | [US-071](stories/US-071-descartar-sugestao-de-gasto-evitavel.md) | Descartar sugestão ("importante para nós") | R4-C | EPIC-23 | Should | 3 | US-070 | NEED-027 | Implementada (TASK-061) |
| 10 | [US-072](stories/US-072-aceitar-sugestao-de-categoria.md) | Aceitar sugestões de categoria, uma a uma | R4-C | EPIC-23 | Could | 3 | US-070 | NEED-027 | Implementada (TASK-063) |
| 11 | [US-073](stories/US-073-historico-e-apagar-analises.md) | Histórico e apagar análises | R4-C | EPIC-23 | Could | 2 | US-070 | NEED-027 | Implementada (TASK-062) |
| 12 | [EN-007](stories/EN-007-hospedagem-vercel-prisma-postgres.md) | Hospedagem de produção: Vercel + Prisma Postgres *(Habilitadora)* | R4-D (POC) | EPIC-24 | Should | 5 | ações do usuário (ADR-031 §12) | NEED-025 | Implementada (TASK-064) · **prioridade 1, antes do MCP** |
| 13 | [EN-006a](stories/EN-006-servidor-mcp-base.md) | Servidor MCP: OAuth próprio, POC com Claude *(Habilitadora)* | R4-D (POC) | EPIC-24 | Should | 7 | EN-007 | NEED-025 | Implementada (TASK-066) |
| 14 | [EN-006b](stories/EN-006-servidor-mcp-base.md) | Servidor MCP: endpoint, contexto, taxa e auditoria *(Habilitadora)* | R4-D (POC) | EPIC-24 | Should | 5 | EN-006a | NEED-025 | Implementada (TASK-067) |
| 15 | [US-074](stories/US-074-conceder-e-revogar-acesso-do-assistente.md) | Conectar e revogar o acesso do assistente (opt-in de escrita com 2ª ciência; só Claude) | R4-D (POC) | EPIC-24 | Should | 5 | EN-006b | NEED-025 | Implementada (TASK-068) |
| 16 | [US-075](stories/US-075-consultar-pelo-assistente-somente-leitura.md) | Consultar saldos, gastos e extrato (somente leitura) | R4-D (POC) | EPIC-24 | Should | 5 | US-074 | NEED-025 | Implementada (TASK-069) · **marco POC-1** |
| 17 | [US-077](stories/US-077-auditoria-do-assistente.md) | Auditoria do assistente (um registro por lançamento) | R4-D (POC) | EPIC-24 | Could | 3 | EN-006b, US-074 | NEED-025 | Implementada (TASK-070) · antes da 076 |
| 18 | [US-076a](stories/US-076a-lancar-despesa-direto-pelo-assistente.md) | Lançar despesa direto pelo assistente (selo, filtro Origem, conferência na Home) | R4-D (POC) | EPIC-24 | Could | 5 | US-075, US-077, EN-007 | NEED-025 | Implementada (TASK-071) |
| 19 | [US-076b](stories/US-076b-limites-de-lancamento-no-perfil.md) | Limites de lançamento configuráveis no perfil (R$ 500 · 10/dia · 5/hora; "sem limite" com aviso) | R4-D (POC) | EPIC-24 | Could | 3 | US-076a (saem juntas) | NEED-025 | Implementada (TASK-072) · **marco POC-2** |
| — | | **Fim do POC do MCP (EN-007 a US-076b) = 38 pts** | | | | **38** | | | |
| A1 | EN-006c *(ampliação)* | Registro dinâmico de clientes + homologação do ChatGPT (Gemini quando liberado: +1) | Ampliação | EPIC-24 | Could | 2 | POC | NEED-025 | Backlog |
| A2 | [US-074b](stories/US-074b-token-pessoal-do-assistente.md) | Token pessoal para clientes sem OAuth | Ampliação | EPIC-24 | Could | 3 | POC | NEED-025 | Refinada · **backlog, fora do POC** |
| A3 | [US-076c](stories/US-076c-modo-exigir-confirmacao.md) | Modo "exigir confirmação" por conexão | Ampliação | EPIC-24 | Could | 3 | US-076a/b | NEED-025 | Refinada · **backlog** |
| A4 | Gemini app *(ampliação)* | Homologar quando liberado no Brasil | Ampliação | EPIC-24 | Could | 1 | A1 | NEED-025 | Sem data |

**Pontos acumulados (revisão 2, MCP/hospedagem pelo TL):** 5 ➔ 13 ➔ 18 ➔ 23 ➔ 31 ➔ 36 (Must) ➔ 39 ➔ 47 ➔ 50 ➔ 53 ➔ 55 ➔ EN-007 60 ➔ 006a 67 ➔ 006b 72 ➔ 074 77 ➔ 075 82 ➔ 077 85 ➔ 076a 90 ➔ 076b 93 (POC do MCP = 38 pts) ➔ ampliação +9 = **102**.
**Ordem do POC do MCP (D-PO-78):** EN-007 > EN-006a > EN-006b > US-074 > US-075 > US-077 > US-076a/b. Liberação em produção só com EN-007 pronta, checklist de segurança e ensaio de restauração.
**Linha de corte (de baixo para cima):** ampliação (US-076c ➔ US-074b ➔ EN-006c) ➔ US-076a/b ➔ US-077 ➔ US-075 ➔ US-074 ➔ EN-006a/b (todo o MCP, sem a EN-007, 33 pts; a EN-007 não se corta se o MCP for ligado) ➔ US-073 ➔ US-072 ➔ US-071 ➔ US-070 (toda a análise, 16 pts) ➔ US-069. Os 36 pts de Must **não se cortam**; o bloco MCP e o bloco de análise só entram **depois** de a importação estar homologada. A R4-C e a R4-D são invertíveis por escolha do usuário (cronograma do Stakeholder). **Dependências externas:** US-065 só depende da US-040a/b; a R4-B depende de **Q-U01, Q-U08 e Q-U10** respondidas e dos ADRs do TL.

### R4-S (proposta) — "Correções de segurança do alpha" (2026-10-24) — **20 pts (PO, prelim.) + revisão da US-003 (5 pts do TL)**
Origem: [levantamento SEC](../../_historico/security/relatorios/levantamento-2026-10-24.md), D-GES-40..42, [SDD-028](../../tech-lead/sdd/SDD-028-correcoes-de-seguranca-grupo-b.md) §10 e [ADR-032](../../tech-lead/adrs/ADR-032-correcoes-de-seguranca-grupo-b.md). Decisões **D-PO-79..93**: [`_historico/product-owner/backlog/decisoes-po-seguranca-sec.md`](../../_historico/product-owner/backlog/decisoes-po-seguranca-sec.md). Itens de SEC sem tela (009 parcial, 010, 013 parcial, 017a, 018a) ficam só no SDD; aqui entram os que mudam o que o usuário vê.

| Ordem | História | Origem SEC | Release | Épico | MoSCoW | Pts | Depende de | NEED | Estado |
| :-: | :-- | :-- | :-: | :-: | :-: | :-: | :-- | :-- | :-- |
| 1 | [US-083](stories/US-083-cadastro-por-lista-de-emails-permitidos.md) Cadastro restrito por lista de e-mails (`ALLOWED_SIGNUP_EMAILS`) | U6 | R4-S | EPIC-25 | Should | 1 | — | NEED-012 | Implementada (TASK-075) · sem SDD próprio |
| 2 | [US-003](stories/US-003-convidar-membro.md) **revisada**: aceite explícito, recusar, vários convites, já tem família (+US-039, FLUXO-002) | SEC-004 | R4-S | EPIC-1 | Must | 5 (TL) | — | NEED-012 | Revisada · SDD-028 §1 |
| 3 | [US-084](stories/US-084-lancamento-so-meu-so-o-dono-altera.md) "Só meu" só pelo dono (+US-005/007/013/030/036) | SEC-021 | R4-S | EPIC-25 | Should | 3 | US-005, US-013 | NEED-001 **[STK]** | Entregue (DEV-88) · revisada por D-GES-50 (D-PO-94): dono da conta e lançador também |
| 4 | [US-074](stories/US-074-conceder-e-revogar-acesso-do-assistente.md) / [US-075](stories/US-075-consultar-pelo-assistente-somente-leitura.md) **revisadas**: consentimento no navegador, selo, aviso de conexão nova; texto como dado | SEC-009, 010, 011 | R4-S | EPIC-24 | Should | 3 + 3 + 3 (TL) | EN-006 | NEED-025 | Revisadas · SDD-028 §§2-4 |
| 5 | [US-070](stories/US-070-analise-de-gastos-evitaveis.md) **revisada**: cenário do teto global | SEC-013 | R4-S | EPIC-23 | Should | 3 (TL) | EN-004 | NEED-027 | Revisada · SDD-028 §5 |
| 6 | [US-078](stories/US-078-encerrar-as-outras-sessoes.md) Encerrar as outras sessões (+ validade 30/90 dias) | SEC-018b | R4-S | EPIC-25 | Should | 2 | SEC-018a | NEED-012 **[STK]** | Implementada (TASK-075/076) · SDD-028 §6 |
| 7 | [US-082](stories/US-082-pagina-de-privacidade.md) Página "Privacidade" | SEC-017e | R4-S | EPIC-25 | **Must** | 1 | tabela do TL | LGPD **[USR]** | Implementada (TASK-077) · texto aguarda o usuário e revisão jurídica |
| 8 | [US-079](stories/US-079-baixar-meus-dados.md) Baixar meus dados | SEC-017b | R4-S | EPIC-25 | Should | 3 | — | LGPD | Implementada (TASK-077) · SDD-028 §7.3 |
| 9 | [US-080](stories/US-080-excluir-minha-conta.md) Excluir minha conta | SEC-017c | R4-S | EPIC-25 | **Must** | 5 | US-078, US-079, US-035 | LGPD **[USR]** | Implementada (TASK-077) · SDD-028 §7.4 |
| 10 | [US-081](stories/US-081-excluir-a-familia.md) Excluir a família | SEC-017d | R4-S | EPIC-25 | Should | 5 | US-080 | NEED-020 **[STK]** | Implementada (TASK-077) · SDD-028 §7.5 |
| — | | **Histórias novas do PO (US-078..084)** | | | | **20** | | | |

**Notas:** (1) a US-082 publica junto com a US-080, e a US-080 vem **antes de abrir o cadastro além do alpha**; (2) a ordem técnica do TL (SDD-028 §8) prevalece nas dependências (018a ➔ 017a ➔ 018b ➔ 017b ➔ 017c ➔ 017d); (3) **linha de corte** da R4-S, de baixo para cima: US-081 ➔ US-079 ➔ US-084 ➔ US-078; **não se cortam** US-003 revisada, US-082/080 (antes do cadastro público) e US-083; (4) correções de texto sem mudança de produto: US-012 (D-PO-84), US-035 (sessões do removido, D-PO-80), US-039 (roteiro do convite).

### Critério central das histórias novas
| ID | Critério central |
| :-- | :-- |
| US-022 | Nenhum número do Acerto contradiz o rótulo: mostra percentual aplicado por trecho de vigência e o **ponderado** do mês (ex.: "na prática 55,7% / 44,3%"). Cálculo inalterado. |
| US-023 | Pagar fatura/baixa sugere conta do titular com saldo suficiente; nunca "a última usada" se ficar negativa havendo alternativa. |
| US-024 | Descrição **visível e opcional**; vazio = categoria; continua com 4 toques. |
| US-025 | Resumo do Mês: receitas, despesas (competência), resultado, a pagar (caixa, faturas em linha própria), saldo previsto = saldo atual − a pagar; **reconcilia com o Extrato**. |
| US-026 | Saldos das contas em card recolhível (recolhido por padrão, lembra no dispositivo). |
| US-027 | Valores ocultos por padrão em dispositivo/sessão novo, depois lembra; máscara em todo o app; percentuais visíveis. |
| US-028 | Acerto ligado por padrão, desligável pelo Administrador; desligar não apaga; religar restaura; linguagem neutra. |
| US-029 | Linha neutra de acerto no Resumo; aviso discreto de meses anteriores pendentes. |
| US-030 | "Dividir" = **Só meu** por padrão (lançamento, cartão e previsão); linha "N despesas Só meu" no Acerto. |
| US-031 | Prévia de impacto e sugestão pela renda (não grava); FAB não cobre "Salvar regra". |
| US-032/033 | Arquivar conta (saldo zero) e cartão (sem fatura/parcela em aberto); reativar; **"excluir" = exclusão lógica terminal**, só sem movimentação (libera o nome). |
| US-034/035 | Editar nome e papéis (último Administrador protegido); remover membro = ex-membro com revisão de pendências (035a); sair e avisos, com mensagens **neutras de gênero** (035b). |
| US-036 | Detalhe da transação na Home com ações rotuladas. |
| US-037/038/039 | Tema; menu superior contido no desktop; polimento (achados 5, 8, 11, 12, 13). |
| US-040/041/042 | Parcelamento 1x–24x, uma parcela por fatura, limite pelo total (040a); competência, Ver compra e **exclusão da compra inteira com Desfazer** (040b); editar/excluir **uma** parcela (041); parcelado dividido **por parcela no mês da fatura** (042, depois da EN-002). |
| EN-002 / US-043 / US-044 | **EN-002 (Must)**: percentual gravado por lançamento (centavos por membro; migração **sem mudar número**, gate de 1 centavo; 002a + 002b); depois três modos (US-043), lembrar por categoria e revisão do mês. |
| US-045..047 | Tags livres (sem diferenciar caixa e acento), gestão e filtro no Extrato. |
| US-048/049 | Análise: período, totais, quebra por categoria/membro/conta/tag, drill-down, **mesma fonte do Extrato**. |
| US-050/051 | Cor por conta/cartão; receitas previstas e saldo previsto completo. |
| EN-003 | **Concluída:** ADR-018 do spike de múltiplos grupos (sem funcionalidade). |

### Fora do escopo desta rodada (Futuro, sem refinamento)
Assistente de IA generativa de uso geral (NEED-023 foi **concretizada** em US-070..073 / NEED-027; depende de **Q-U01** e de ADR de privacidade), grupos não familiares e contas privadas (NEED-021; só o spike), exclusão da família (**Q-U02**), construtor de relatórios, hierarquia/cor de tags, barra inferior no desktop (Opção A), corrigir forma de pagamento (achado 6), unificar linhas de transferência (achado 9). *(Faturas em Contas a pagar, antigo achado 10, entrou na R2.2 como US-055; D-PO-51.)*

---

## 🧭 Uso real: UR-1 e UR-2 *(adicionado em 2026-10-26)* — **60 pts (PO, prelim.): Must 5 · Should 46 · Could 9** *(a US-100, Could → Should, conta como Could)*

Origem: NEED-028..034 (feedback de uso real), **ordem e respostas Q-U15..Q-U24 aprovadas pelo usuário em 2026-10-26** (D-GES-62; exceção: Q-U20, a transferência prevista pode repetir todo mês). Decisões do PO **D-PO-99..106** (tabela ao fim). Fluxos novos: [FLUXO-018](../flows/FLUXO-018-visao-por-conta-em-a-pagar.md), [FLUXO-019](../flows/FLUXO-019-lancar-ou-prever-na-mesma-porta.md), [FLUXO-020](../flows/FLUXO-020-membro-sem-conta-e-convite-posterior.md). Pedidos ao TL: [`pedidos-ao-tech-lead-uso-real.md`](pedidos-ao-tech-lead-uso-real.md). **Nenhuma altera o motor do acerto nem a EN-002**; nenhuma depende de IA ou de privacidade; **não competem com NEED-024/026** (ordem relativa é do Gestor).

**Ordem de execução = ordem de prioridade do usuário** (dependência dura > WSJF; dentro de cada NEED, a ordem das fatias). Pontos são do PO (preliminares); o TL confirma ou reestima.

| Ordem | História | NEED | Release | Épico | MoSCoW | V/U/R | Pts | WSJF | Depende de | Estado |
| :-: | :-- | :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- | :-- |
| 1 | [US-060](stories/US-060-resumo-por-conta-no-a-pagar.md) **Resumo por conta no A pagar** (refinada: saldo previsto, "Sem conta definida", "Só meu" de outro membro, soma bate) | 033 | UR-1 | EPIC-17 | **Must** | 9/7/5 | **5** (TL confirma) | 4,2 | US-059, 055, 057 | **Implementada (TASK-054), aguardando validação do Gestor** ([SDD-029](../../tech-lead/sdd/SDD-029-resumo-por-conta-no-a-pagar-us-060.md)) |
| 2 | [US-085](stories/US-085-destaque-despesa-receita.md) Seleção despesa x receita inequívoca | 034 (item 1) | UR-1 | EPIC-19 | Should | 5/4/3 | 2 | 6,0 | — | **TL: 2 pts, sem SDD** (notas) |
| 3 | [US-087](stories/US-087-alinhamento-das-colunas-do-extrato.md) Colunas do Extrato alinhadas | 034 (item 7) | UR-1 | EPIC-19 | Should | 6/3/3 | 3 | 4,0 | US-062, 040b | **TL: 3 pts, sem SDD** (notas; contêiner da linha) |
| 4 | [US-086](stories/US-086-espacamento-compacto-de-formularios.md) Espaçamento compacto de formulários | 034 (item 2) | UR-1 | EPIC-19 | Should | 5/3/2 | **3 (TL)** | 5,0 | — | **TL: 3 pts (era 2), sem SDD** (notas) · cortável |
| 5 | [US-088](stories/US-088-ver-compra-no-card-da-parcela.md) "Ver compra" no card da parcela | 034 (item 10) | UR-1 | EPIC-20 | Could | 2/1/1 | 1 | 4,0 | US-040b, 087 | **TL: 1 pt, sem SDD** (notas) · **1ª a cortar** |
| 6 | [US-089](stories/US-089-conta-pagadora-padrao-do-cartao.md) Conta pagadora padrão do cartão | 032 | UR-1 | EPIC-6 | Should | 6/4/3 | 3 | 4,3 | US-015, 017b, 033 | **SDD-030 pronto, 3 pts, aprovada p/ Dev** |
| 7 | [US-090](stories/US-090-prever-na-mesma-porta-do-lancamento.md) Lançar ou prever na mesma porta | 031 | UR-1 | EPIC-26 | Should | 8/5/3 | 5 | 3,2 | US-005/006/018/019/030 | **SDD-031 pronto, 5 pts, aprovada p/ Dev** |
| 8 | [US-091](stories/US-091-repetir-todo-mes-na-mesma-porta.md) "Repetir todo mês" na mesma porta | 031 | UR-1 | EPIC-26 | Should | 5/3/2 | 3 | 3,3 | US-090, 058/059 | **SDD-031 §7, 3 pts, aprovada p/ Dev** · cortável |
| 9 | [US-092](stories/US-092-cadastrar-membro-sem-conta.md) Cadastrar membro sem conta | 028 | UR-2 | EPIC-18 | Should (Alta) | 7/5/5 | 3 | 5,7 | **spike do TL**, US-002/003/034/035 | Proposta · [ADR-033](../../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) aceito (revisão da Segurança incorporada) · **[SDD-033](../../tech-lead/sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md) pronto, aprovado p/ Dev** · **TL 5** (092a 3 + 092b 2) |
| 10 | [US-093](stories/US-093-atribuir-contas-e-lancamentos-ao-membro-sem-conta.md) Membro sem conta como titular/pagador/responsável e no acerto | 028 | UR-2 | EPIC-18 | Should (Alta) | 8/5/5 | 5 | 3,6 | US-092, 009a, 028, 084 | Proposta · ADR-033: **TL 8** (093a 3 + 093b 5) · Q-TL-U1..U3 aceitas (D-GES-63) · SDD próximo; 093b incorpora SEC-059/066b/067 |
| 11 | [US-094](stories/US-094-convidar-membro-cadastrado-e-assumir-historico.md) Convidar o membro cadastrado e herdar o histórico | 028 | UR-2 | EPIC-1 | Should (Alta) | 8/4/7 | 5 | 3,8 | US-092, 093, 003, 035 | Proposta · ADR-033: **TL 8** (094a 3 + 094b 5) · **Q-TL-U4 mudou: a pessoa escolhe o nome no aceite** (PO ajusta a US) · 094b incorpora SEC-062..064 |
| 12 | [US-095](stories/US-095-ciclo-de-vida-do-membro-sem-conta.md) Ciclo de vida do membro sem conta | 028 | UR-2 | EPIC-18 | Should | 3/2/2 | 2 | 3,5 | US-092, 093, 035 | Proposta · ADR-033: **TL 2** · 1ª a cortar da NEED-028 |
| 13 | [US-096](stories/US-096-assinatura-mensal-no-cartao.md) Assinatura mensal no cartão | 029 | UR-2 | EPIC-20 | Should | 7/4/4 | 5 | 3,0 | US-016a, 017a, 058/059 | Proposta · ADR/SDD do TL |
| 14 | [US-097](stories/US-097-corrigir-reajustar-e-encerrar-assinatura.md) Corrigir, reajustar e encerrar assinatura | 029 | UR-2 | EPIC-20 | Should | 5/3/2 | 3 | 3,3 | US-096 | Proposta |
| 15 | [US-098](stories/US-098-lista-de-assinaturas-e-total-mensal.md) Lista de assinaturas e total mensal | 029 | UR-2 | EPIC-20 | Should | 4/2/2 | 2 | 4,0 | US-096 | Proposta |
| 16 | [US-099](stories/US-099-assinatura-dividida-entra-no-acerto.md) Assinatura dividida entra no acerto | 029 | UR-2 | EPIC-16 | Should | 4/2/3 | 3 | 3,0 | US-096, EN-002, 028, 030 | Proposta · TL-U5 |
| 17 | [US-100](stories/US-100-transferencia-prevista.md) Transferência prevista | 030 | UR-2 | EPIC-26 | Could → Should | 5/2/3 | 5 | 2,0 | **US-060, US-090**, US-010; alinhar com US-051 | Proposta · ADR/SDD do TL |
| 18 | [US-101](stories/US-101-transferencia-prevista-recorrente.md) Transferência prevista recorrente | 030 | UR-2 | EPIC-26 | Could | 3/1/2 | 3 | 2,0 | US-100, 091 | Proposta · cortável |
| — | | **Total (US-060 conta 5)** | | | | | **60** | | | |

**Pontos acumulados:** US-060 (5) = 5 ➔ US-085 (2) = 7 ➔ US-087 (3) = 10 ➔ US-086 (**3, TL**) = 13 ➔ US-088 (1) = 14 ➔ US-089 (3) = 17 ➔ US-090 (5) = 22 ➔ US-091 (3) = 25 ➔ **UR-1 = 25 pts (TL; PO prelim. 24)** ➔ US-092 (3) = 28 ➔ US-093 (5) = 33 ➔ US-094 (5) = 38 ➔ US-095 (2) = 40 ➔ US-096 (5) = 45 ➔ US-097 (3) = 48 ➔ US-098 (2) = 50 ➔ US-099 (3) = 53 ➔ US-100 (5) = 58 ➔ US-101 (3) = **61 (UR-1 + UR-2; valores UR-2 ainda do PO)**.

**Por que a ordem difere do WSJF:** o usuário fixou a prioridade por NEED (033, 034, 032, 031, 028, 029, 030); o PO só ordena **dentro** de cada NEED. A NEED-028 (WSJF alto) fica em 5º por decisão do usuário e porque **depende do spike do TL**: o TL pode antecipar a investigação durante a UR-1 sem mexer em código.

**Dependências duras:** US-060 completa-se com US-089 (fatura na conta pagadora), US-051 (receita) e US-100 (transferência); **US-100 depende da US-060 e da US-090** (porta única e tipo `kind`, alinhado à US-051/ADR-023); US-091 depende da US-090; US-094 depende de 092 e 093; 097/098/099 dependem da 096; US-088 pode andar com a US-087 (mesma linha). Estas histórias **não dependem** de R4/R5.

**Linha de corte (de baixo para cima):** US-101 ➔ US-099 ➔ US-088 ➔ US-095 ➔ US-098 ➔ US-086 ➔ US-091 ➔ US-097. **Não se cortam:** US-060, US-085, US-087, US-089, US-090 e o núcleo de cada NEED (092/093/094; 096; 100).

**Release sugerida:** **UR-1 (24 pts, "próxima entrega curta", ex-R3 fatia 2)** = NEED-033 + 034 + 032 + 031; **UR-2 (36 pts)** = NEED-028 + 029 + 030, em três ondas independentes na ordem 028 ➔ 029 ➔ 030. Homologação do Stakeholder ao fim de cada release.

| ID | Critério central |
| :-- | :-- |
| US-060 | Tabela por conta (atual · a pagar · previsto) com a soma das linhas = total de "A pagar"; "Sem conta definida"; "Falta R$ X" com texto; inclui "Só meu" de outro membro (Q-U24). |
| US-085..088 | Mesmo seletor despesa/receita com ícone + texto em todo lugar; formulários compactos (cabe em 375×667); colunas do Extrato alinhadas em todas as linhas; "Ver compra" dentro do card. |
| US-089 | Conta pagadora **opcional** no cartão; **só sugere** ao pagar e mostra o vencimento; nunca paga sozinho; não altera pagamentos feitos. |
| US-090/091 | "Já aconteceu | Vai acontecer" no mesmo formulário (padrão: já aconteceu); efeito explícito antes de salvar; "Repetir todo mês" só informativo sobre a série existente. |
| US-092..095 | Membro sem conta (só Administrador cadastra/convida), com os mesmos seletores, no acerto e com "Só meu" controlado; convite posterior **assume** o membro com todo o histórico, sem duplicar; totais idênticos antes e depois. |
| US-096..099 | Assinatura = série no cartão, **lançada sozinha no dia**; fatura e limite só contam o lançado; corrigir o mês sem reescrever o passado; lista e total mensal; dividida entra no acerto. |
| US-100/101 | Transferência prevista neutra (fora de despesa, receita e "A pagar"), afeta o saldo previsto por conta; efetiva em transferência real; **pode repetir todo mês** (Q-U20). |

---

## 📦 Plano de releases (proposta do PO ao Gestor)

| Release | Incrementos | Conteúdo | Promessa ao usuário |
| :-- | :-- | :-- | :-- |
| **R1 — "Fechar o mês em casal"** | Inc 1 + Inc 2 (EN-001, US-001..013) | Login, família, convite, contas, lançamentos, extrato, split, acerto, home | *"Registro tudo em 10 s e sei quem deve quanto a quem."* |
| **R2 — "AP0 completo"** | Inc 3 (US-014..019) | Categorias, cartões à vista, fatura, despesas previstas | *"Cartões e contas a pagar também estão aqui."* |
| **R2.1 — "Ressalvas e ajustes de baixo risco"** | Inc 4 (US-022..039) | Rótulo honesto do acerto, conta de origem padrão, descrição, Resumo do Mês, ocultar valores, acerto opcional, "Dividir" Só meu, arquivar conta/cartão, família e membros, detalhe, tema, desktop | *"A Início responde como está o mês, o acerto é discreto e opcional, e nada expõe meu dinheiro sem eu querer."* |
| **R3 — "Cartão completo e análise"**, em **R3-A** (US-040a/b + EN-002a/b, interface inalterada) e **R3-B** (US-042 em diante), com pausa de homologação entre elas | Inc 5 (US-040..051, EN-002, EN-003) | Parcelamento no cartão, divisão por lançamento, tags, visões sintéticas, cor, receitas previstas, spike de grupos | *"O cartão parcelado funciona e sei para onde foi o dinheiro."* |
| **UR-1 — "Uso real: ver o mês por conta e lançar sem atrito"** (proposta, 24 pts) | Inc 7 (US-060, US-085..US-091) | Visão por conta em "A pagar", polimento de UX, conta pagadora do cartão, lançar/prever na mesma porta | *"Sei se cada conta aguenta o mês e lanço ou prevejo no mesmo lugar."* |
| **UR-2 — "Família real e compromissos fixos"** (proposta, 36 pts) | Inc 8 (US-092..US-101) | Membro sem conta e convite posterior, assinaturas no cartão, transferência prevista | *"Cadastro a família toda antes de ela entrar e prevejo assinaturas e repasses."* |
| AP1 | a refinar (logo após a R3, Q-F12) | Orçamento e autocontrole: ciclo, tetos, disponibilidade, recorrência | — |

**Justificativa:** a dor vital do MVP (`mvp-definition.md`) e o ADR-006 colocam o split no centro; cartões e previstas são do AP0 do Stakeholder mas **não bloqueiam** a dor central. Entregar R1 antes de R2 permite **homologação de valor antecipada** com o Stakeholder e reduz o risco de um MVP "grande demais". Divisão R1/R2 **ratificada pelo Gestor (D-GES-01)**; homologação de valor após a R1.

---

## ✅ Estado da prontidão

| Incremento | Histórias | Pronto para o Tech Lead? | Bloqueio para o Dev |
| :-- | :-- | :-: | :-- |
| **Inc 1** — Walking skeleton | EN-001, US-001..007 | ✅ Sim | Nenhum: SDDs 001, 003, 004, 006 entregues |
| **Inc 2** — Fechar o mês | US-008, 009a/b, 010..012, 013a/b | ✅ Sim | Nenhum: SDD-002 entregue |
| **Inc 3** — AP0 completo (R2) | US-014, 015, 016a/b, 017a/b, 018, 019 | ✅ Sim (SDD-007, 008, 009) | Nenhum SDD pendente; a R2 começa depois da R1 (US-012 e US-013a são pré-requisitos de cenários) |
| **Inc 4** — R2.1 | US-022..039 | ✅ **Especificadas** (SDD-010..013; 67 pts) | Nenhum SDD pendente; ratificação de D-PO-33..42 pelo Gestor; linha de base E2E (D-GES-19) |
| **Inc 5** — R3 | US-040..051, EN-002 (EN-003 concluída) | ✅ Refinadas e **Esboçadas** (SDD-014..017; ADR-016..018) | SDD completo antes de cada história; depende da R2.1 (predicado único, `findActiveMembership`, `FamilyEvent`) |
| **Inc 6** — R4 (proposta) | US-065..077, EN-004..006 | ⏳ Refinadas; **aguardam ADRs/SDD do TL** ([`_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md`](../../_historico/product-owner/backlog/pedidos-ao-tech-lead-ia.md)) e ratificação de D-PO-53..69 | R4-A: nenhum além do SDD curto. R4-B: Q-U01, Q-U08, Q-U10 e ADRs de LLM/privacidade. R4-D: ADR do MCP |
| **Inc 7** — UR-1 (uso real, proposta) | US-060 refinada, US-085..US-091 | ⏳ US-060 **SDD pronto (SDD-029, 5 pts), aprovada p/ Dev**; **US-089 (SDD-030, 3 pts) e US-090/091 (SDD-031, 5 + 3) aprovadas p/ Dev**; US-085..088 estimadas pelo TL (2 + 3 + 3 + 1 = 9, sem SDD; [notas](../../tech-lead/architecture/notas-polimento-us-085-088.md)) ([`pedidos-ao-tech-lead-uso-real.md`](pedidos-ao-tech-lead-uso-real.md): TL-U7/U8/U9 respondidos) | Q-U22..Q-U24 respondidas; nenhum bloqueio de usuário. **PO:** ajustar o Gherkin da US-090 (botão "Salvar despesa/receita" e "Salvar previsão"; mensagem de data) e decidir se a data fica em "Mais detalhes" (US-086) |
| **Inc 8** — UR-2 (uso real, proposta) | US-092..US-101 | ⏳ Refinadas; ADR-033 aceito (2026-10-30, Q-TL-U1..U5 respondidas, D-GES-63; revisão da Segurança SEC-058..068 incorporada), NEED-028 = 23 pts TL; **SDD-033 (US-092) pronto**; SEC-060 e SEC-062(3) pendentes do usuário | Q-U15..Q-U21 respondidas; US-096 e US-100 precisam de ADR/SDD; US-099 depende de TL-U5 |

---

## 🔖 Decisões e perguntas do PO (rastreio)

| ID | Tipo | Texto | Quem decide | Bloqueia? |
| :-- | :-- | :-- | :-- | :-: |
| **D-PO-01** | Decisão | No MVP há **um único campo "Quem pagou?"**, que preenche *responsável pelo gasto* e *pagador* (reduz o formulário para os 10 s). `responsavel_pagamento` só existe nas previstas (US-018). | Stakeholder valida; TL modela | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 |
| **D-PO-02** | Decisão | No MVP **todos os membros veem e lançam em todas as contas/cartões** (sem permissões granulares). | Stakeholder valida | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 |
| **D-PO-03** | Decisão | **Período = mês-calendário** no MVP; o ciclo com dia de corte (NEED-005) chega no AP1. O TL deve projetar o cálculo de período como função de um `cutDay` (padrão 1). | TL confirma | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 (obs.: período como função de `cutDay`) |
| Q-01 | Pergunta | NEED-001 cita "filho" como responsável pelo gasto: dependentes sem login entram no MVP? Proposta: **não** (US-021). | Stakeholder | ✅ **Respondida** (D-GES-06; Stakeholder aceitou): fora do MVP, vira US-021. **Reaberta e atendida em 2026-10-26** pela NEED-028 (Q-U15, usuário): US-092..US-095 |
| Q-03 | Pergunta | Validade do convite: 7 dias. | TL/Gestor | ✅ **Respondida** (D-GES-07): **7 dias** |
| Q-08 | Pergunta | Regra de divisão deve ter **vigência por data** para preservar meses passados? Recomendação: sim. | TL (SDD-002) | ✅ **Respondida** (D-GES-08): **sim**, vigência por data; TL modela no SDD-002 (ainda bloqueia o início da US-008 até o SDD) |
| Q-13 | Pergunta | Subir US-013 (corrigir/excluir) de Should para Must? | Gestor | ✅ **Respondida** (D-GES-03): permanece **Should**, mas **dentro da R1** (Inc 2); último a ser cortado |
| Q-17 | Pergunta | Pagamento de fatura (US-017) deve estar no AP0 mesmo sem estar no cronograma? Proposta: Should em R2. | Stakeholder/Gestor | ✅ **Respondida** (D-GES-04): **Should em R2** |
| **D-PO-04** | Decisão | **Categorias**: qualquer membro cria/renomeia/arquiva (lista da família); **sem exclusão** (arquivar basta); máx. 40 por tipo; não arquiva a última ativa do tipo. | Stakeholder valida | Não (US-014) |
| **D-PO-05** | Decisão | Dias de **fechamento e vencimento de 1 a 28**; vencimento ≤ fechamento ⇒ mês seguinte. | Stakeholder valida; TL modela | Não (US-015) |
| **D-PO-06** | Decisão | Compra **até o dia do fechamento, inclusive**, entra na fatura que fecha naquele dia; a fatura é identificada pelo **mês de fechamento**. | Stakeholder valida (Q-18) | Não |
| **D-PO-07** | Decisão | **Dias do ciclo travados** depois da primeira compra do cartão (nome, limite e titular continuam editáveis). | Stakeholder valida (Q-19) | Não |
| **D-PO-08** | Decisão | Compra acima do limite e conta que ficará negativa: **aviso + confirmação, sem bloqueio**. | — | Não |
| **D-PO-09** | Decisão | **Pagar fatura = integral, só fatura fechada, não é despesa**; parcial/juros/antecipação fora da R2. Fatura paga fica travada até desfazer o pagamento. | Stakeholder valida (Q-21) | Não |
| **D-PO-10** | Decisão | **Fatiamento da R2**: US-016 ➔ 016a (compra) + 016b (corrigir/filtrar, Should); US-017 ➔ **017a (ver fatura, Must)** + **017b (pagar, Should)**. A D-GES-04 (pagar é Should) é mantida; o PO sobe só o *ver fatura* a Must. **Gestor ratifica.** | Gestor | Não |
| **D-PO-11** | Decisão | **Despesa prevista não é lançamento**: não afeta saldo/extrato/totais/acerto até a baixa; a baixa gera a despesa real com **valor efetivo e data do pagamento**; "Atrasada" é destaque, não estado. | Stakeholder valida | Não |
| Q-18 | Pergunta | Compras **no dia do fechamento** ficam na fatura que fecha? (D-PO-06) Hipótese: sim. | Stakeholder | Não |
| Q-19 | Pergunta | Travar os dias do ciclo após a primeira compra é aceitável? (D-PO-07) Alternativa: ciclo versionado por vigência. | Stakeholder | Não |
| Q-20 | Pergunta | No acerto, o crédito de compra no cartão vai para **quem comprou**, não para quem paga a fatura. Aceitável? Hipótese: sim (RN-003.3). | Stakeholder/Gestor | Não |
| Q-21 | Pergunta | Pagamento de fatura com valor diferente do total (juros/desconto/parcial): AP1/AP2? | Stakeholder | Não |
| Q-22 | Pergunta | "Dividir com a família" da previsão é decidido no cadastro (padrão ligado). Confirmar. **Revisada por D-PO-16 (R2.1): padrão "Só meu".** | Stakeholder | Não |
| **D-PO-12..32** | Decisão (✅ ratificadas, D-GES-14) | Decisões do PO para R2.1/R3 (fatiamento, ordem e corte, Home, acerto opcional, ocultar valores, "Dividir" Só meu, arquivar, família/membros, conta padrão, descrição, detalhe, tema, desktop, polimento, parcelamento, competência da parcela, percentual por lançamento, tags, visões, cor, receitas previstas, spike de grupos). Ver [`_historico/product-owner/backlog/decisoes-po-r21-r3.md`](../../_historico/product-owner/backlog/decisoes-po-r21-r3.md). | Gestor ratifica | Não |
| **D-PO-16** | Decisão (revisa Q-22) | Previstas passam a nascer **Só meu**, como os demais lançamentos. | Gestor ratifica | Não |
| **D-PO-26** | Decisão (assimetria) | Parcela conta no mês da **fatura**; compra à vista pela **data da compra**. | Gestor/Stakeholder; TL viabiliza | Não |
| **D-PO-33** | Decisão | **Parcelamento fica na R3** (D-GES-17 não satisfeita): ordem US-040 ➔ EN-002 ➔ US-042 ➔ US-043 ➔ US-041; US-040 fatiada em 040a (5) e 040b (3), que recebe a exclusão da compra inteira e o Desfazer da US-041. Assimetria D-PO-26 mantida (viável com predicado único). | Gestor ratifica | Não |
| **D-PO-34** | Decisão | **EN-002 é Must** (a US-042 depende dela); 002a 5 + 002b 8; corte da R3 reescrito (051, 050, 049, 046, 044, 041, 043). | Gestor ratifica | Não |
| **D-PO-35** | Decisão | **Ordem final da R2.1:** 027, 022, 023, 024, 025, 026, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039 (67 pts; Must 40). | Gestor ratifica | Não |
| **D-PO-36** | Decisão | US-035 fatiada 035a/035b; mensagens neutras de gênero; "excluir" conta/cartão = exclusão lógica terminal. | Gestor ratifica | Não |
| **D-PO-37** | Decisão | Home: aviso de acerto em janela de 12 meses; confirmação de desligar: todos os meses. | Gestor ratifica | Não |
| **D-PO-38** | Decisão | Contrato de busca por descrição (`q`, 2..50) e mensagem única de descrição. | Gestor ratifica | Não |
| **D-PO-39** | Decisão | "Copiar link"/"Reenviar" rotacionam o token do convite; 3 reenvios. | Gestor ratifica | Não |
| **D-PO-40** | Decisão | `highlight` é parâmetro de UI, sem contrato de API. | Gestor ratifica | Não |
| **D-PO-41** | Decisão | Cenários R1/R2 atualizados nas histórias antigas (padrão "Só meu", texto neutro do acerto, Home reorganizada). | Gestor ratifica | Não |
| **D-PO-42** | Decisão | Saldo previsto em mês **futuro** usa o saldo atual e só os vencimentos daquele mês (TL-09); projeção acumulada fica para o AP1. | Gestor ratifica | Não |
| **D-PO-43** | Decisão | **R3 em duas entregas** (D-GES-23, TL-11): **R3-A** = US-040a/b + EN-002a/b (21 pts, interface inalterada); **R3-B** = US-042, 043, 041, 044 e o restante (44 pts), depois da pausa de homologação e da janela de reversão (≥ 7 dias, `--verify` limpo, um fechamento conferido). Ordem e corte da R3 inalterados. | Gestor ratifica | Não |
| **D-PO-44** | Decisão | **US-040:** nos cenários "uma linha por parcela" e "Ver compra" o Extrato informa o **intervalo** (até 24 meses, TL-14); "Parcelas futuras" definida (fatura: parcelas ativas em faturas posteriores à exibida; cartão: posteriores à aberta; TL-16), indicador que não entra em A pagar nem em Saldo previsto. | Gestor ratifica | Não |
| **D-PO-45** | Decisão | **US-041:** parcela em fatura **fechada ou paga** fica travada (a compra única da US-016b trava só a paga; TL-12). **US-043:** a baixa herda a divisão da previsão (TL-18). **US-044:** a revisão do mês **não lista parcelas** (TL-13). | Gestor ratifica | Não |
| **D-PO-46** | Decisão | **Tags e Análise:** caracteres permitidos (letras, números, hífen, ponto, sublinhado) com a mensagem do TL (TL-15); filtro `untagged` só como chip "Sem tag" do drill-down (TL-14); filtro de membro rotulado **"Quem pagou"** no Extrato e na Análise (TL-19); **editar só tags é não financeira** (não é barrada por fatura paga, conta arquivada nem parcela; vale para todas as parcelas; TL-20). | Gestor ratifica | Não |
| **D-PO-47** | Decisão | **US-051:** `kind` da previsão **imutável** (excluir e cadastrar de novo) e aba "Pagas e recebidas" mista (TL-21). | Gestor ratifica | Não |
| **D-PO-48** | Decisão | **R2.2 = pacote pequeno de ajustes pós-homologação da R2.1** (US-052 Must, 054 e 055 Should, 053 Could; 11 pts PO prelim.), executado **antes da R3-B e sem tocar no motor do acerto**; ordem 052 ➔ 054 ➔ 055 ➔ 053; corte 053 ➔ 055 ➔ 054. O achado 8 (lentidão) é do TL. | Gestor ratifica | Não |
| **D-PO-49** | Decisão (Gestor) | Achado Importante tratado com **aviso visível agora, sem antecipar a US-042**: faixa no formulário (2x ou mais), detalhe no Acerto, indicador no Resumo e linha "Fora do acerto" no detalhe da compra; texto único, removido quando a US-042 sair. Não altera cálculo. | Gestor (já decidiu); Stakeholder confere | Não |
| **D-PO-50** | Decisão | **Valores começam ocultos ao entrar como outro usuário: MANTIDO.** É o padrão intencional da US-027/Q-F04 (preferência por usuário e dispositivo; sem preferência = oculto). Só se ajusta o **texto da dica do olho** (US-053). Lembrar entre dispositivos exigiria guardar no servidor e vai contra "não expor sem ação"; fora de escopo. | Gestor ratifica | Não |
| **D-PO-51** | Decisão | **Faturas na tela "A pagar" entram no escopo** (US-055; antes "fora do escopo", achado 10): mesma definição e total do "A pagar" do Resumo; sem pagar dentro da lista. | Gestor ratifica | Não |
| **D-PO-52** | Decisão | Achado 2 amplia a US-054: o diálogo de arquivar (cartão e conta) **lista todos os impedimentos antes de confirmar**; validação do servidor mantida. Achado 5 (botão flutuante) resolvido com espaço inferior reservado nas listas. | Gestor ratifica | Não |
| **D-PO-53..69** | Decisão | **R4 (proposta):** parcelas já pagas (só o restante), infra de LLM e opt-in como Habilitadoras, importação de fatura em 4 fatias (revisão obrigatória, lote atômico, anti-duplicidade, arquivo descartado), análise de gastos (método fixo, só agregados, números do app), MCP por membro (leitura primeiro, lançar com confirmação), ordem e corte. Detalhe e **perguntas Q-U01..Q-U12 ao usuário** (com hipótese) em [`_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md`](../../_historico/product-owner/backlog/decisoes-po-ia-e-parcelas.md). | Gestor ratifica; usuário responde Q-U | Q-U01/08/10 bloqueiam o início da R4-B |
| **D-PO-99** | Decisão | **US-060 refinada (NEED-033):** sobe a **Must** e a 5 pts; tabela atual · a pagar · previsto por conta; **soma das linhas = total de "A pagar"** (mesma fonte); linha "Sem conta definida" para previstas e faturas sem conta; destaque "Falta R$ X" (texto + cor); **inclui previstas "Só meu" de outro membro (Q-U24, usuário)**; receita e transferência previstas entram quando existirem (colunas só quando há valores). | Gestor ratifica | Não |
| **D-PO-100** | Decisão | **NEED-034 fatiada em 4 itens independentes** (US-085 destaque despesa/receita, US-086 espaçamento, US-087 colunas do Extrato, US-088 "Ver compra"): **componentes e tokens únicos** (um seletor de tipo, um espaçamento) em vez de ajuste por tela; seletor segmentado com ícone + texto (nunca só cor); grade fixa com valores à direita em algarismos tabulares. Desenho escolhido pelo PO (sem 2 alternativas que mudem o fluxo). | Gestor ratifica | Não |
| **D-PO-101** | Decisão | **US-089 (NEED-032):** conta pagadora **opcional** (Q-U23) que **só sugere** a conta e mostra o vencimento (Q-U22); nunca paga sozinho; conta arquivada limpa o campo com aviso e o arquivamento da conta lista os cartões que a usam. Alimenta a US-060. | Gestor ratifica | Não |
| **D-PO-102** | Decisão | **Porta única (NEED-031, FLUXO-019):** seletor "Já aconteceu | Vai acontecer" (**padrão: já aconteceu**, para não piorar os < 10 s), efeito explícito antes de salvar, padrões de "Só meu" de cada modo mantidos e avisados ao trocar; **"Vai acontecer" indisponível no cartão** (compra no cartão não admite data futura): ali a cobrança mensal é a **Assinatura (US-096)**; "Repetir todo mês" (**Q-U21**) só reaproveita a série; receita usa a mesma porta quando a US-051 existir. | Gestor ratifica | Não |
| **D-PO-103** | Decisão | **NEED-028 em 4 fatias** (US-092 cadastrar, 093 atribuir e acerto, 094 convidar e herdar, 095 ciclo de vida); **absorve a US-021**; **Q-U15 mesmo mecanismo, Q-U16 entra no acerto, Q-U17 só Administrador**; membro sem conta **nunca é Administrador**; aceite continua explícito (SEC-004) com tela "o que você vai assumir"; totais e acerto idênticos antes e depois do aceite; **"Só meu" de membro sem conta: controlado por quem lançou, dono da conta e Administrador (hipótese a validar pelo TL/Segurança)**. Depende do **spike do TL**. | Gestor ratifica; **Segurança revisa** | Não |
| **D-PO-104** | Decisão | **NEED-029 em 4 fatias** (US-096 assinatura, 097 corrigir/reajustar/encerrar, 098 lista e total, 099 dividida no acerto): assinatura **é a série com cartão** (sem conceito novo); **lançada sozinha só quando o dia chega** (compra no cartão não admite data futura), "Assinaturas previstas neste ciclo" informativo, **fatura e limite só contam o lançado** (sem contar duas vezes); fatura paga não muda (cobrança pulada com aviso); **Q-U18, Q-U19**. | Gestor ratifica | Não |
| **D-PO-105** | Decisão | **NEED-030 em 2 fatias** (US-100 pontual, US-101 recorrente por **Q-U20**): transferência prevista **neutra** (não é despesa, receita nem "A pagar"; lista própria em Previstas), afeta o saldo previsto por conta (coluna só quando há), efetiva em transferência real atômica e desfazível; **depende da US-060 e da porta única (US-090)** e do mesmo `kind` da US-051. | Gestor ratifica | Não |
| **D-PO-106** | Decisão | **UR-1 (24 pts) e UR-2 (36 pts)** na ordem do usuário (033 ➔ 034 ➔ 032 ➔ 031 ➔ 028 ➔ 029 ➔ 030); linha de corte: US-101 ➔ 099 ➔ 088 ➔ 095 ➔ 098 ➔ 086 ➔ 091 ➔ 097; pedidos ao TL em `pedidos-ao-tech-lead-uso-real.md` (spike do membro sem conta pode correr em paralelo à UR-1). Nenhum cálculo do acerto muda. | Gestor ratifica | Não |
