# 📑 Backlog do Produto (Product Owner)

*Status: **Refinado até o Incremento 2; R1 toda Especificada** · Estimativas do TL e fatiamento 9a/9b, 13a/13b incorporados · Atualizado: 2026-10-04*
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
Inc 3 ▸       ·               ·              US-015 US-016    ·       US-017         US-018 US-019
(AP0 completo)                              (cartão)                  (fatura)       (previstas)
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
| EPIC-8..15 | Orçamento, parcelamento, recorrência, caixinhas, desdobramento, conciliação, liquidez, importação, alertas | NEED-003..011 | AP1 – AP3 |

---

## 🧮 Priorização

**Critério:** MoSCoW decide o *corte*; **WSJF** `(Valor + Urgência + Risco/Oportunidade) ÷ Tamanho` decide a *ordem* dentro do elegível; **dependência dura prevalece** sobre o WSJF.
Escala 1–10 para V/U/R; Tamanho em Fibonacci relativo (1, 2, 3, 5, 8). **Desde 2026-10-04 o Tam. é a estimativa do Tech Lead** (`tech-lead/status.md`): 70 pontos na R1 (o PO havia estimado 45), WSJF recalculado; a ordem foi mantida (dependência dura prevalece). Itens que passaram de 5 (US-009, US-013) foram **fatiados** em 9a/9b e 13a/13b (5+3 cada).

**Ordem de corte se o prazo apertar:** US-013b → US-009b → US-013a (D-GES-03: a 13a é a última). As fatias 9b e 13b não são dependência de nenhuma outra história; 9a (núcleo Must) nunca é cortada.

| Ordem | ID | História | Épico | MoSCoW | V | U | R | Tam. (TL) | WSJF | Depende de | Status |
| :-: | :-- | :-- | :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-- | :-- |
| 1 | [EN-001](stories/EN-001-ambiente-local-e-esqueleto.md) | Ambiente local e esqueleto *(enabler)* | EPIC-00 | Must | 3 | 10 | 8 | 8 | 2,6 | — | Especificada (SDD-006) |
| 2 | [US-001](stories/US-001-login-com-google.md) | Entrar com a conta Google | EPIC-0 | Must | 8 | 9 | 6 | 5 | 4,6 | EN-001 | Especificada (SDD-003) |
| 3 | [US-002](stories/US-002-criar-familia.md) | Criar a família | EPIC-0 | Must | 7 | 9 | 3 | 3 | 6,3 | US-001 | Especificada (SDD-003) |
| 4 | [US-004](stories/US-004-cadastrar-conta-bancaria.md) | Cadastrar conta com saldo inicial | EPIC-2 | Must | 8 | 8 | 3 | 5 | 3,8 | US-002 | Especificada (SDD-004) |
| 5 | [US-005](stories/US-005-lancar-despesa.md) | Lançar despesa rapidamente | EPIC-3 | Must | 10 | 8 | 5 | 5 | 4,6 | US-004 | Especificada (SDD-001) |
| 6 | [US-006](stories/US-006-lancar-receita.md) | Lançar receita | EPIC-3 | Must | 7 | 6 | 2 | 2 | 7,5 | US-005 | Especificada (SDD-001) |
| 7 | [US-007](stories/US-007-extrato-de-lancamentos.md) | Extrato com filtros | EPIC-3 | Must | 8 | 6 | 3 | 5 | 3,4 | US-005, US-006 | Especificada (SDD-005) |
| 8 | [US-003](stories/US-003-convidar-membro.md) | Convidar membro por e-mail | EPIC-1 | Must | 8 | 7 | 4 | 5 | 3,8 | US-002 | Especificada (SDD-003) |
| 9 | [US-008](stories/US-008-regra-de-divisao-familiar.md) | Regra de divisão familiar | EPIC-4 | Must | 9 | 4 | 5 | 3 | 6,0 | US-003 | Especificada (SDD-002) |
| 10 | [US-009a](stories/US-009-painel-de-acerto-de-contas.md) | Acerto de contas: motor + painel essencial | EPIC-4 | Must | 9 | 6 | 7 | 5 | 4,4 | US-005, US-008 | Especificada (SDD-002) |
| 11 | [US-010](stories/US-010-transferencia-entre-contas.md) | Transferir entre contas | EPIC-2 | Must | 6 | 4 | 3 | 3 | 4,3 | US-004 | Especificada (SDD-004) |
| 12 | [US-011](stories/US-011-registrar-acerto-de-contas.md) | Registrar o acerto | EPIC-4 | Must | 7 | 5 | 4 | 5 | 3,2 | US-009a, US-010 | Especificada (SDD-002) |
| 13 | [US-012](stories/US-012-home-dashboard.md) | Home essencial | EPIC-5 | Must | 8 | 5 | 3 | 5 | 3,2 | US-004, US-007, US-009a | Especificada (SDD-005) |
| 14 | [US-009b](stories/US-009b-acerto-tres-membros-e-detalhe.md) | Acerto: 3+ membros e detalhe das despesas | EPIC-4 | Should | 4 | 2 | 3 | 3 | 3,0 | US-009a | Especificada (SDD-002) · **cortável** |
| 15 | [US-013a](stories/US-013-corrigir-ou-estornar-lancamento.md) | Corrigir/excluir/restaurar lançamento (núcleo) | EPIC-3 | Should | 6 | 4 | 4 | 5 | 2,8 | US-005, US-007, US-009a | Especificada (SDD-001) · **Should dentro da R1** (D-GES-03) |
| 16 | [US-013b](stories/US-013b-desfazer-e-mes-acertado.md) | Desfazer transferência/acerto e aviso de mês acertado | EPIC-3 | Should | 3 | 2 | 2 | 3 | 2,3 | US-013a, US-010, US-011 | Especificada (SDD-001) · **cortável** |
| 17 | US-014 | Gerenciar categorias | EPIC-3 | Could | 4 | 2 | 1 | 2 | 3,5 | US-002 | Rascunho |
| 18 | US-015 | Cadastrar cartão de crédito | EPIC-6 | Must | 6 | 3 | 3 | 2 | 6,0 | US-002 | Rascunho |
| 19 | US-016 | Compra à vista no cartão | EPIC-6 | Must | 7 | 3 | 4 | 5 | 2,8 | US-015 | Rascunho |
| 20 | US-017 | Ver e pagar a fatura | EPIC-6 | Should | 7 | 3 | 4 | 5 | 2,8 | US-016, US-010 | Rascunho · Should em R2 (D-GES-04) |
| 21 | US-018 | Despesa prevista pontual | EPIC-7 | Must | 6 | 3 | 2 | 3 | 3,7 | US-005 | Rascunho |
| 22 | US-019 | Dar baixa em despesa prevista | EPIC-7 | Must | 6 | 3 | 3 | 3 | 4,0 | US-018 | Rascunho |

> **Por que US-003 (convite) vem depois do extrato?** O WSJF empata em valor, mas o **walking skeleton** (entrar → criar família → conta → lançar → ver) precisa fechar *sozinho* primeiro; o convite habilita o split, que só tem valor com 2 membros e é entregue no Incremento 2. A ordem da tabela é a de **execução recomendada**.

### Esboços (Rascunho) — resumo do critério central
| ID | Critério central (a detalhar no refinamento do Incremento 3) |
| :-- | :-- |
| US-014 | Criar, renomear e arquivar categorias; categorias em uso não são excluídas, apenas arquivadas. |
| US-015 | Cartão com titular, limite, dia de fechamento e vencimento (NEED-003). |
| US-016 | Compra reduz o **limite** e entra na fatura aberta, **sem alterar saldo bancário** (RN-003.1); registra quem gastou (RN-003.3). |
| US-017 | Fatura fechada vira despesa a pagar; pagar debita uma conta e libera o limite. *Should: o cronograma cita só compra à vista; sem pagar a fatura o ciclo do cartão não fecha — ver Q-17.* |
| US-018 | Despesa futura nasce `PREVISTO`, com **responsável pelo pagamento** (RN-001.2, RN-004.1); não afeta saldo. |
| US-019 | Baixa exige conta e data, aceita **valor efetivo diferente** do previsto e debita a conta (RN-004.2/3). |

### Fora do MVP (parking lot, sem refinamento)
| ID | Item | Observação |
| :-- | :-- | :-- |
| US-020 | Permissões granulares por conta/cartão | Hoje vale **D-PO-02** (todos veem tudo). Refinar se o Stakeholder rejeitar a decisão. |
| US-021 | Membros sem login (dependentes) como responsáveis pelo gasto | Pendente da pergunta **Q-01**. |
| AP1+ | Ciclo com dia de corte, tetos, auto-clonagem, disponibilidade, parcelamento, recorrência | NEED-003/004/005/006 — refinar ao final do Incremento 3. |

---

## 📦 Plano de releases (proposta do PO ao Gestor)

| Release | Incrementos | Conteúdo | Promessa ao usuário |
| :-- | :-- | :-- | :-- |
| **R1 — "Fechar o mês em casal"** | Inc 1 + Inc 2 (EN-001, US-001..013) | Login, família, convite, contas, lançamentos, extrato, split, acerto, home | *"Registro tudo em 10 s e sei quem deve quanto a quem."* |
| **R2 — "AP0 completo"** | Inc 3 (US-014..019) | Categorias, cartões à vista, fatura, despesas previstas | *"Cartões e contas a pagar também estão aqui."* |
| AP1 | a refinar | Orçamento e autocontrole | — |

**Justificativa:** a dor vital do MVP (`mvp-definition.md`) e o ADR-006 colocam o split no centro; cartões e previstas são do AP0 do Stakeholder mas **não bloqueiam** a dor central. Entregar R1 antes de R2 permite **homologação de valor antecipada** com o Stakeholder e reduz o risco de um MVP "grande demais". Divisão R1/R2 **ratificada pelo Gestor (D-GES-01)**; homologação de valor após a R1.

---

## ✅ Estado da prontidão

| Incremento | Histórias | Pronto para o Tech Lead? | Bloqueio para o Dev |
| :-- | :-- | :-: | :-- |
| **Inc 1** — Walking skeleton | EN-001, US-001..007 | ✅ Sim | Nenhum: SDDs 001, 003, 004, 006 entregues |
| **Inc 2** — Fechar o mês | US-008, 009a/b, 010..012, 013a/b | ✅ Sim | Nenhum: SDD-002 entregue |
| **Inc 3** — AP0 completo | US-014..019 | ⏳ Não (rascunho) | Refinar após o Inc 1 entrar em desenvolvimento |

---

## 🔖 Decisões e perguntas do PO (rastreio)

| ID | Tipo | Texto | Quem decide | Bloqueia? |
| :-- | :-- | :-- | :-- | :-: |
| **D-PO-01** | Decisão | No MVP há **um único campo "Quem pagou?"**, que preenche *responsável pelo gasto* e *pagador* (reduz o formulário para os 10 s). `responsavel_pagamento` só existe nas previstas (US-018). | Stakeholder valida; TL modela | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 |
| **D-PO-02** | Decisão | No MVP **todos os membros veem e lançam em todas as contas/cartões** (sem permissões granulares). | Stakeholder valida | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 |
| **D-PO-03** | Decisão | **Período = mês-calendário** no MVP; o ciclo com dia de corte (NEED-005) chega no AP1. O TL deve projetar o cálculo de período como função de um `cutDay` (padrão 1). | TL confirma | Não — ✅ aprovada (D-GES-05); validada pelo Stakeholder em 2026-10-04 (obs.: período como função de `cutDay`) |
| Q-01 | Pergunta | NEED-001 cita "filho" como responsável pelo gasto: dependentes sem login entram no MVP? Proposta: **não** (US-021). | Stakeholder | ✅ **Respondida** (D-GES-06; Stakeholder aceitou): fora do MVP, vira US-021 |
| Q-03 | Pergunta | Validade do convite: 7 dias. | TL/Gestor | ✅ **Respondida** (D-GES-07): **7 dias** |
| Q-08 | Pergunta | Regra de divisão deve ter **vigência por data** para preservar meses passados? Recomendação: sim. | TL (SDD-002) | ✅ **Respondida** (D-GES-08): **sim**, vigência por data; TL modela no SDD-002 (ainda bloqueia o início da US-008 até o SDD) |
| Q-13 | Pergunta | Subir US-013 (corrigir/excluir) de Should para Must? | Gestor | ✅ **Respondida** (D-GES-03): permanece **Should**, mas **dentro da R1** (Inc 2); último a ser cortado |
| Q-17 | Pergunta | Pagamento de fatura (US-017) deve estar no AP0 mesmo sem estar no cronograma? Proposta: Should em R2. | Stakeholder/Gestor | ✅ **Respondida** (D-GES-04): **Should em R2** |
