# 📑 Backlog do Produto (Product Owner)

*Status: **R1 e R2 (Inc 3) todas Especificadas** · Fatiamento 9a/9b, 13a/13b (R1) e 16a/16b, 17a/17b (R2) · Atualizado: 2026-10-04*
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
| 17 | [US-015](stories/US-015-cadastrar-cartao-de-credito.md) | Cadastrar cartão de crédito | EPIC-6 | Must | 6 | 3 | 3 | 3 | 4,0 | US-002 | Especificada (SDD-008) |
| 18 | [US-016a](stories/US-016-compra-a-vista-no-cartao.md) | Compra à vista no cartão | EPIC-6 | Must | 7 | 3 | 4 | 5 | 2,8 | US-015, US-005, US-007 | Especificada (SDD-008) |
| 19 | [US-017a](stories/US-017-ver-fatura-do-cartao.md) | Ver a fatura do cartão e o limite | EPIC-6 | Must | 7 | 3 | 4 | 3 | 4,7 | US-016a | Especificada (SDD-008) |
| 20 | [US-018](stories/US-018-despesa-prevista-pontual.md) | Despesa prevista pontual (+ bloco "A pagar" na Home) | EPIC-7 | Must | 6 | 3 | 2 | 5 | 2,2 | US-005, US-012 (+ US-017a para faturas) | Especificada (SDD-009) |
| 21 | [US-019](stories/US-019-dar-baixa-em-despesa-prevista.md) | Dar baixa em despesa prevista | EPIC-7 | Must | 6 | 3 | 3 | 5 | 2,4 | US-018, US-004 | Especificada (SDD-009) |
| 22 | [US-017b](stories/US-017b-pagar-a-fatura.md) | Pagar a fatura | EPIC-6 | Should | 5 | 2 | 3 | 5 | 2,0 | US-017a, US-004, US-010 | Especificada (SDD-008) · Should em R2 (D-GES-04) · **cortável** |
| 23 | [US-016b](stories/US-016b-corrigir-compra-no-cartao-e-filtro.md) | Corrigir/excluir compra no cartão e filtrar por cartão | EPIC-6 | Should | 3 | 2 | 3 | 3 | 2,7 | US-016a, US-013a, US-007 | Especificada (SDD-008) · **cortável** |
| 24 | [US-014](stories/US-014-gerenciar-categorias.md) | Gerenciar categorias | EPIC-3 | Could | 4 | 2 | 1 | 3 | 2,3 | US-002, US-005 | Especificada (SDD-007) · **primeira a cortar** |

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
| **Inc 3** — AP0 completo (R2) | US-014, 015, 016a/b, 017a/b, 018, 019 | ✅ Sim (SDD-007, 008, 009) | Nenhum SDD pendente; a R2 começa depois da R1 (US-012 e US-013a são pré-requisitos de cenários) |

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
| Q-22 | Pergunta | "Dividir com a família" da previsão é decidido no cadastro (padrão ligado). Confirmar. | Stakeholder | Não |
