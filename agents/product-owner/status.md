# Status do Product Owner

*Atualizado: 2026-10-04 (pós-resposta do Tech Lead: R2.1 Especificada, R3 Esboçada)*

## Atualização (pós-TL): backlog alinhado à resposta do Tech Lead — R2.1 Especificada, R3 Esboçada
- **Origem:** [`respostas-r21-r3.md`](../tech-lead/respostas-r21-r3.md) (SDD-010..017, ADR-016..019), D-GES-14..20 e TL-02..TL-09. Decisões novas **D-PO-33..42** em [`backlog/decisoes-po-r21-r3.md`](backlog/decisoes-po-r21-r3.md) §2b, **aguardando ratificação do Gestor**.
- **Pontos do TL:** **R2.1 = 67** (Must 40 · Should 17 · Could 10; PO: 60) e **R3 = 67** (Must 24 · Should 35 · Could 8; PO: 56; EN-003 já entregue, **65 pendentes**). Re-estimadas: US-024 (3), US-032 (5), US-033 (3), US-035 (8), US-040 (8), EN-002 (13).
- **Status:** US-022..039 **Especificadas** (SDD-010..013, prontas para o Dev); US-040..051 e EN-002 **Esboçadas** (SDD-014..017); **EN-003 concluída** (ADR-018).

### Ordem final de execução da R2.1 (D-PO-35) — pontos acumulados
**US-027 (5) = 5 ➔ US-022 (3) = 8 ➔ US-023 (3) = 11 ➔ US-024 (3) = 14 ➔ US-025 (5) = 19 ➔ US-026 (2) = 21 ➔ US-028 (5) = 26 ➔ US-029 (3) = 29 ➔ US-030 (3) = 32 ➔ US-031 (3) = 35 ➔ US-032 (5) = 40 ➔ US-033 (3) = 43 ➔ US-034 (3) = 46 ➔ US-035 (8) = 54 ➔ US-036 (3) = 57 ➔ US-037 (3) = 60 ➔ US-038 (2) = 62 ➔ US-039 (5) = 67.** Antes de começar, o Dev roda a suíte E2E completa como linha de base (D-GES-19).
- **Corte da R2.1 (primeiro a sair):** 039 (5) ➔ 037 (3) ➔ 038 (2) ➔ 036 (3) ➔ 033 (3) ➔ 035 (8) ➔ 031 (3); saem 27 pts e sobram os **40 de Must**. Os cenários "arquivada" da US-023 e US-026 só se completam com a US-032 (Must) e ficam pendentes até ela.

### Ordem final da R3 (D-PO-33/34) e novo corte
**EN-003 (concluída) · US-040 (8) = 8 ➔ EN-002 (13) = 21 ➔ US-042 (3) = 24 ➔ US-043 (5) = 29 ➔ US-041 (5) = 34 ➔ US-044 (3) = 37 ➔ US-045 (5) = 42 ➔ US-047 (2) = 44 ➔ US-046 (3) = 47 ➔ US-048 (5) = 52 ➔ US-049 (5) = 57 ➔ US-050 (3) = 60 ➔ US-051 (5) = 65.**
- **Parcelamento fica na R3** (D-GES-17 não satisfeita: US-040 = 8 e a US-042 depende da EN-002). **EN-002 sobe a Must** (a US-042 depende dela).
- **Corte da R3 (reescrito):** 051 ➔ 050 ➔ 049 ➔ 046 ➔ 044 ➔ 041 ➔ 043 (a EN-002 deixa a lista); saem 29 pts e sobram 36 (Must 24 + tags 045/047 + Análise 048).

### Fatiamentos novos
| História | Fatias |
| :-- | :-- |
| US-040 (8) | **040a** (5): modelo, criação atômica, faturas futuras, limite, 24x · **040b** (3): competência (Extrato/Resumo/Acerto/Análise), "Ver compra", **exclusão da compra inteira + Desfazer** (vindas da US-041) |
| EN-002 (13) | **002a** (5): modelo e motor STORED · **002b** (8): migração, gate de 1 centavo, rollback, harness de regressão |
| US-035 (8) | **035a** (5): remover membro · **035b** (3): sair, avisos e casos-limite |

### Ajustes de conteúdo nas histórias (resposta do TL §8)
US-024 (busca `q` e mensagem única) · US-028/029 (todos os meses ao desligar × janela de 12 meses na Home) · US-032/033 ("excluir" = exclusão lógica) · US-035 (mensagens neutras) · US-036 (`highlight` = parâmetro de UI) · US-039 (rotação do token do convite; nota na US-003) · US-041 (cenários de exclusão da compra inteira migraram para a US-040b).
**Cenários R1/R2 atualizados** (D-PO-41, anotados em "Histórico"): US-005, US-016a, US-018 (padrão "Só meu"); US-009, US-011, US-013, US-013b, US-016a (texto neutro do acerto); US-009 (estado vazio); US-012 (Home reorganizada). O Dev atualiza os `.feature` e testes na mesma história que provoca cada mudança.

### Pendências
- **Gestor:** ratificar D-PO-33..42 (atenção a D-PO-33 e D-PO-34); registrar em `agents/manager/decisoes-do-gestor.md`.
- **Tech Lead:** SDD completo das histórias da R3 antes de cada início (hoje esboços).
- **Dev & QA:** linha de base E2E (D-GES-19); começar pela US-027 (SDD-010).
- **Stakeholder:** validar na homologação da R3 a assimetria à vista × parcela (TL-03) e a limitação de acento da busca (D-PO-38).

---

## (Histórico, superado pela seção acima) R2.1 e R3 refinadas após a homologação, antes da resposta do Tech Lead
- **Origem:** homologação de R1+R2 com ressalvas e feedback do usuário (16 sugestões), tratados pelo Stakeholder em [`parecer-feedback-usuario.md`](../stakeholder/parecer-feedback-usuario.md) (Q-F01..Q-F14, aprovadas pelo Gestor). O usuário delegou as decisões; nada novo foi perguntado a ele (só Q-U01/Q-U02 continuam com ele e não bloqueiam).
- **Entregue pelo PO:** 30 histórias novas e 2 enablers, todas com rastreio NEED➔US, Gherkin (pt, sem os padrões que o parser recusa: DEV-06/11/15/25), MoSCoW, WSJF, dependências e marca de corte; 9 fluxos novos; MVP/roadmap revisados; decisões D-PO-12..32; pedidos ao TL.

| Release | Histórias | Pts (PO, **prelim.**) | Composição |
| :-- | :-- | :-: | :-- |
| **R2.1** | [US-022..US-039](backlog/stories) (18) | **60** | Must 37 · Should 13 · Could 10 |
| **R3** | [US-040..US-051](backlog/stories), [EN-002](backlog/stories/EN-002-percentual-gravado-por-lancamento.md), [EN-003](backlog/stories/EN-003-spike-modelo-multiplos-grupos.md) (14) | **56** | Must 8 · Should 40 · Could 8 |

- **Ordem de execução R2.1:** US-022 ➔ 023 ➔ 024 ➔ 027 ➔ 025 ➔ 026 ➔ 028 ➔ 029 ➔ 030 ➔ 031 ➔ 032 ➔ 033 ➔ 034 ➔ 035 ➔ 036 ➔ 037 ➔ 038 ➔ 039. **Ordem de corte (primeiro a sair):** 039 ➔ 037 (tema) ➔ 038 (desktop) ➔ 036 (detalhe) ➔ 033 ➔ 035 ➔ 031 (restam os 37 pts de Must).
- **Ordem de execução R3:** EN-003 (paralelo, TL) · US-040 ➔ 042 ➔ 041 ➔ EN-002 ➔ 043 ➔ 044 ➔ 045 ➔ 047 ➔ 046 ➔ 048 ➔ 049 ➔ 050 ➔ 051. **Corte:** 051 ➔ 050 ➔ 049 ➔ 046 ➔ 044 ➔ 041 ➔ EN-002 + 043.
- **Parcelamento (Q-F14):** US-040 (5) + US-042 (3). Se o TL estimar ≤ 5 e ≤ 3, o Gestor pode puxá-las para o fim dos Must da R2.1 (68 pts); senão 1ª entrega da R3.
- **Fluxos novos** em [`flows/`](flows): FLUXO-006 Home e Resumo do Mês · 007 Ocultar valores · 008 Lançar despesa (descrição, dividir, parcelas, tags) · 009 Acerto opcional · 010 Arquivar conta/cartão · 011 Família e membros · 012 Conta de origem padrão · 013 Preferências, desktop e detalhe · 014 Parcelamento, tags e análise (R3). FLUXO-001/002/003 receberam revisão apontando para eles.
- **Decisões do PO (D-PO-12..32):** [`backlog/decisoes-po-r21-r3.md`](backlog/decisoes-po-r21-r3.md). **Pedem atenção do Gestor:** D-PO-16 (revisa Q-22: previstas também "Só meu") e D-PO-26 (parcela conta no mês da fatura; à vista pela data da compra: assimetria).
- **Histórias antigas anotadas** (Histórico): US-002, 005, 008, 009, 012, 017b, 018, 019. Os cenários da R1/R2 que mudam de padrão (ex.: "Dividir" ligado por padrão na US-005) serão atualizados pelo Dev com a US-030.

### Pedidos ao Tech Lead — [`backlog/pedidos-ao-tech-lead-r21-r3.md`](backlog/pedidos-ao-tech-lead-r21-r3.md)
1. **Estimar o parcelamento básico** (US-040/042) e dizer se cabe na R2.1; avaliar a assimetria de competência (D-PO-26).
2. **Spike de múltiplos grupos** (EN-003): vínculo usuário↔família N:N? custo de "pessoa em dois grupos" e de "conta privada"; ADR.
3. **Migração do cálculo do acerto** (EN-002) com **regressão** sobre 3.169,90 / cota 1.584,95 / diferença 1.149,95 (e setembro 717,00 / 358,50 / 260,50).
4. **Modelo de gravação do percentual por lançamento** (coluna vs. rateio por membro; sobra ao pagador; parcelas herdando; ex-membros).
5. Confirmar pontos, devolver dependências técnicas e emitir SDDs (sugestão SDD-010..017) e o ADR do spike.

### Pendências com outros agentes
- **Gestor:** ratificar D-PO-12..32 (registrar em `agents/manager/decisoes-do-gestor.md`), decidir D-PO-16 e D-PO-26, e a posição do parcelamento após a estimativa do TL.
- **Tech Lead:** itens acima. **Dev & QA:** nada a iniciar antes do SDD; ao atualizar o Gherkin da R1/R2 (padrões "Dividir" e Home), seguir as notas do §4 do pedido ao TL.
- **Stakeholder:** ciente das decisões de detalhe (D-PO-15, 18, 25, 26) para a homologação da R2.1.

## Atualização: R2 (Inc 3, US-014..019) Refinada e **Especificada** (SDD-007, SDD-008, SDD-009)
- **Tech Lead concluiu o ciclo (2026-10-04):** estimativas confirmadas (**32 pontos**, iguais às do PO), ADR-014 (cartão e fatura no ledger) e ADR-015 (previsão como entidade própria). Ajuste do PO após o SDD: o cenário "Baixa única" da US-019 foi esclarecido (tela atualizada ⇒ `já foi paga`; tela desatualizada ⇒ conflito de versão).
- **Todas as histórias da R2 estão Refinadas (DoR do PO)** com BDD completo em pt (caminho feliz, validação, permissão, vazio/erro, duplo clique, conflito, isolamento): [US-014](backlog/stories/US-014-gerenciar-categorias.md), [US-015](backlog/stories/US-015-cadastrar-cartao-de-credito.md), [US-016a](backlog/stories/US-016-compra-a-vista-no-cartao.md), [US-016b](backlog/stories/US-016b-corrigir-compra-no-cartao-e-filtro.md), [US-017a](backlog/stories/US-017-ver-fatura-do-cartao.md), [US-017b](backlog/stories/US-017b-pagar-a-fatura.md), [US-018](backlog/stories/US-018-despesa-prevista-pontual.md), [US-019](backlog/stories/US-019-dar-baixa-em-despesa-prevista.md). Fluxos novos: [FLUXO-004](flows/FLUXO-004-cartao-e-fatura.md) (cartão, fatura, pagamento) e [FLUXO-005](flows/FLUXO-005-despesas-previstas.md); FLUXO-001 ganhou a revisão 3 ("Pagar com").
- **Fatiamento (D-PO-10, Gestor ratifica):** US-016 ➔ 016a (Must) + 016b (Should); US-017 ➔ **017a ver fatura (Must)** + **017b pagar (Should)**. A D-GES-04 (Q-17: pagar fatura é Should) segue valendo; o PO sobe só o *ver a fatura* a Must. Ordem de execução: **015 ➔ 016a ➔ 017a ➔ 018 ➔ 019 ➔ 017b ➔ 016b ➔ 014**. **Ordem de corte: 014 ➔ 017b ➔ 016b.**
- **Coerência fatura/pagamento x transferências x ledger (decisão do PO, FLUXO-004 §4):** a **compra no cartão é despesa** (entra no extrato, nos totais e no acerto pela data da compra; não mexe no saldo; consome o limite). O **pagamento da fatura não é despesa**: debita a conta, libera o limite e fica fora de totais e acerto, como uma transferência (RN-002.3). Fatura paga fica travada até "Desfazer pagamento".
- **Despesa prevista não é lançamento (D-PO-11):** nada muda em saldo/extrato/totais/acerto até a baixa; a baixa gera a despesa real com **valor efetivo** e data do pagamento. "Atrasada" é destaque, não estado.
- **Decisões novas (D-PO-04..11) e perguntas não bloqueantes (Q-18..Q-22)** estão em [`backlog.md`](backlog/backlog.md); nenhuma bloqueia o Tech Lead. A mais sensível para o Stakeholder: **Q-20** (no acerto, a compra no cartão é creditada a quem comprou, não a quem paga a fatura).
- **(Atendido)** Pedidos ao Tech Lead: SDD(s) da R2 (modelo de cartão/fatura/previsão no ledger, GAP-3: `Transaction` sem `accountId` para compra no cartão), estimativas, regras com datas em `America/Sao_Paulo`, mapeamento BDD ➔ testes e os impactos em US-005/007/012/013 (já em desenvolvimento).

## Atualização: estimativas do TL e fatiamento (aviso ao Dev & QA)
- **R1 inteira Especificada** (EN-001, US-001..013). Tamanhos do backlog agora são os do TL: **70 pontos** (PO havia estimado 45). WSJF recalculado; ordem mantida.
- **Porta do app = 3100** (D-GES-10): corrigida em EN-001; não há outra menção a 3000 nas histórias/fluxos.
- **Fatiamento (escopo da R1 inalterado; 10 cenários BDD de cada história redistribuídos, nenhum perdido):**

| Fatia | Pts | Conteúdo | Arquivo |
| :-- | :-: | :-- | :-- |
| **US-009a** (Must) | 5 | Motor `computeSettlement` completo (N>2, vetores S1..S13), API, painel essencial: cálculo, pessoal fora, 60/40, centavo, mês equilibrado/vazio, 1 membro, navegar mês | `US-009-painel-de-acerto-de-contas.md` |
| **US-009b** (Should, cortável) | 3 | UI para 3 membros e lista expansível das despesas | `US-009b-acerto-tres-membros-e-detalhe.md` |
| **US-013a** (Should, núcleo) | 5 | Editar, auditoria, excluir, restaurar, conflito 409, acerto recalculado, validações | `US-013-corrigir-ou-estornar-lancamento.md` |
| **US-013b** (Should, cortável) | 3 | Aviso de mês acertado, desfazer acerto, transferência sem "Editar" | `US-013b-desfazer-e-mes-acertado.md` |

- **Desvio da sugestão do TL:** o TL propôs 9a = só o motor e 9b = painel/UI. O PO fatiou diferente porque cortar o painel quebraria a promessa da R1; o motor continua inteiro na 9a. US-011, US-012 e US-013a dependem só da 9a.
- **Ordem de execução:** ... US-011 → US-012 → **US-009b** → **US-013a** → **US-013b**. **Ordem de corte:** 13b, 9b, 13a (D-GES-03). Os nomes de arquivo originais foram mantidos (links dos SDDs válidos).
- Ao Dev: o `tasks-board.md` deve tratar 9a/9b e 13a/13b como tarefas separadas; o SDD-002 §9a/9b e SDD-001 §13a/13b valem sem alteração (o TL pode registrar errata de nomenclatura).

## Entregue neste ciclo
| Artefato | Conteúdo |
| :--- | :--- |
| [`backlog/working-agreement.md`](backlog/working-agreement.md) | Método (story map, INVEST, MoSCoW, WSJF, BDD), DoR/DoD, template e glossário |
| [`backlog/backlog.md`](backlog/backlog.md) | Épicos, mapa da jornada, backlog ordenado com WSJF, plano de releases, decisões e perguntas |
| [`backlog/mvp-definition.md`](backlog/mvp-definition.md) | MVP revisado: R1 *Fechar o mês em casal* e R2 *AP0 completo* |
| [`backlog/stories/`](backlog/stories) | EN-001 e US-001..013 refinadas em BDD; US-014..019 como esboço |
| [`flows/`](flows) | FLUXO-001 (rev. 2), FLUXO-002 (onboarding/convite), FLUXO-003 (acerto de contas) |

## Próximas histórias para o time técnico (ordem de execução)
1. **EN-001** → **US-001** → **US-002** → **US-004** → **US-005** → **US-006** → **US-007** → **US-003** (Incremento 1, walking skeleton)
2. **US-008** → **US-009a** → **US-010** → **US-011** → **US-012** → **US-009b** → **US-013a** → **US-013b** (Incremento 2)

## Decisões do Gestor incorporadas (D-GES-01..08, 2026-10-04)
| Decisão | Efeito no backlog |
| :-- | :-- |
| D-GES-01 | Divisão **R1 (EN-001, US-001..013) / R2 (US-014..019)** ratificada; homologação de valor após a R1 |
| D-GES-03 | **Q-13**: US-013 segue *Should*, dentro da R1; último a ser cortado |
| D-GES-04 | **Q-17**: US-017 (pagar fatura) *Should* em R2 |
| D-GES-05 | D-PO-01, D-PO-02, D-PO-03 aprovadas; **validadas pelo Stakeholder** em 2026-10-04 (obs.: período como função de `cutDay`) |
| D-GES-06 | **Q-01**: dependentes sem login fora do MVP (US-021) |
| D-GES-07 | **Q-03**: convite vale **7 dias** |
| D-GES-08 | **Q-08**: regra de divisão com **vigência por data** (cenário BDD acrescentado à US-008) |
| D-GES-11 | Login de teste em dev (cenários acrescentados à US-001); sem mudança de escopo da R1 |

Todas as perguntas abertas do PO (Q-01, Q-03, Q-08, Q-13, Q-17) estão **respondidas**. Escopo da R1 inalterado. O Stakeholder já atualizou `cronograma-e-releases.md` (NEED-007 no AP0).

## Próximas histórias para o time técnico (ordem de execução, diretriz do Gestor)
1. **EN-001** (pode começar já) → **US-001** → **US-002** → **US-004** → **US-005** → **US-006** → **US-007** → **US-003** (Incremento 1)
2. **US-008** → **US-009a** → **US-010** → **US-011** → **US-012** → **US-009b** → **US-013a** → **US-013b** (Incremento 2)

Nenhuma história inicia sem SDD que a cubra.

## Pedidos ao Tech Lead (para liberar o Dev)
1. **Revisar o SDD-001** — GAP-1: falta `accountId`; GAP-2: unificar nomes com o ADR-006 (`isSharedExpense`, `payerMemberId`) e incluir autor e `version` na edição. Mapear para US-005/006/013.
2. **SDD-002 (split)** — cobre US-008, US-009, US-011. Pontos: **vigência da regra por data (D-GES-08)**, maior resto e desempate, algoritmo de sugestão para N > 2, exclusão de acertos/transferências dos totais.
3. **SDD de Auth, Família e Convite** (US-001..003) e **SDD de Contas e ledger** (US-004, US-010): lançamento de abertura, transferência atômica com par vinculado, **provedor de login de teste (D-GES-11)**, convite de 7 dias com e-mail via Mailpit.
4. Projetar o período como função de `cutDay` (padrão 1), conforme D-PO-03 aprovada.
5. Estimar em pontos todas as histórias (o tamanho do PO é preliminar).

## Pendências com outros agentes
- **Dev & QA**: reescrever `tasks-board.md` a partir da ordem do PO (D-GES-09): TASK-001 = EN-001; TASK-002 referenciava a antiga US-001 e agora é **US-005** (e US-006/007).
- **Tech Lead**: ajustar `ambiente-local.md` às portas de D-GES-10.
- **Gestor**: reestimar o cronograma da R1 com base nas estimativas do TL/Dev.
