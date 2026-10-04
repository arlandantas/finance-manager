# Status do Product Owner

*Atualizado: 2026-10-04 (R2 refinada)*

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
