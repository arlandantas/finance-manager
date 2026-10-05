# Status do Tech Lead

*Atualizado: 2026-10-04 · Ciclos: **R2.1 e R3** (pós-homologação, abaixo), liberação da **R1** (EN-001, US-001..013) e especificação da **R2** (US-014..019)*

## Ciclo R2.1 e R3 (pós-homologação): R2.1 **Especificada** (SDD-010..013); R3 **Esboçada** (SDD-014..017); EN-003 **concluída** (ADR-018)
Respostas completas, estimativas por história, ordem técnica, riscos e ajustes pedidos ao PO: **[`respostas-r21-r3.md`](respostas-r21-r3.md)**.

| Artefato | Cobre | Observação |
| :--- | :--- | :--- |
| [SDD-010 Resumo do Mês, ocultar valores e preferências](sdd/SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) | US-025, 026, 027, 036, 037, 038 | Agregado único reconciliado com o Extrato, **predicado único de período** (`ledger-where.ts`), `Money`/`prefs` por usuário e dispositivo, tema por variáveis CSS, detalhe e layout desktop |
| [SDD-011 Acerto opcional, rótulo e prévia](sdd/SDD-011-acerto-opcional-rotulo-e-previa.md) | US-022, 028, 029, 030, 031 | Motor **intacto**; `splitExplanation`, chave por família (`409 SETTLEMENT_DISABLED`), pendências em janela, default "Só meu" (muda contrato), prévia sem gravar; lista de testes R1/R2 que mudam |
| [SDD-012 Manutenção de cadastros](sdd/SDD-012-manutencao-de-cadastros.md) | US-032, 033, 034, 035 | Arquivar com lock anti-corrida, **exclusão lógica terminal**, último Administrador atômico, remoção/saída com reatribuição, vetores S14..S16 |
| [SDD-013 Pagamentos: conta padrão, descrição e polimento](sdd/SDD-013-pagamentos-conta-padrao-descricao-e-polimento.md) | US-023, 024, 039 | Função pura de sugestão, busca `q`, rotação de token do convite |
| [SDD-014..017 (esboços R3)](sdd/SDD-014-parcelamento-esboco.md) | US-040..051, EN-002 | Parcelamento, percentual por lançamento e migração, tags e Análise, cor e receitas previstas |
| [ADR-016 Percentual gravado por lançamento](adrs/ADR-016-percentual-gravado-por-lancamento.md) | EN-002, US-042..044 | Rateio por membro em centavos, motor LEGACY/STORED, migração com *gate* de 1 centavo |
| [ADR-017 Parcelamento e competência](adrs/ADR-017-parcelamento-no-cartao-e-competencia.md) | US-040..042 | N linhas no ledger + `InstallmentPlan`, `competenceOn`, **não puxar para a R2.1** |
| [ADR-018 Múltiplos grupos (spike)](adrs/ADR-018-multiplos-grupos-spike.md) | EN-003 | N:N estrutural já existe; custos 13 / 13–21; preparar sem construir |
| [ADR-019 Ciclo de vida do vínculo](adrs/ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md) | US-034, 035 | Ex-membro (`removedAt`), unicidade parcial, reconvite |
| [`architecture/modelo-de-dados.md` §8–§9](architecture/modelo-de-dados.md) | R2.1, R3 | 4 migrações da R2.1 em ordem; mapa das migrações da R3 |

### Pontos confirmados
| Release | PO | **TL** | Must | Should | Could | Observação |
| :-- | :-: | :-: | :-: | :-: | :-: | :-- |
| **R2.1** | 60 | **67** | 40 | 17 | 10 | +2 US-032, +1 US-033, +3 US-035, +1 US-024; demais confirmadas. **Só Must = 40.** |
| **R3** | 56 | **67** | 11 (24 com EN-002 Must) | 48 | 8 | +3 US-040, +8 EN-002; EN-003 concluída (2) |

### Decisões e respostas do TL (R2.1/R3)
| Pergunta / Gap | Resposta |
| :-- | :-- |
| Parcelamento na R2.1 (D-GES-17) | **Não**: US-040 = 8 (> 5) e a US-042 depende da EN-002. 1ª entrega da R3 (ADR-017). |
| Assimetria D-PO-26 | Viável e consistente via `competenceOn` + predicado único; não toca números homologados; +2 pts (ADR-017 §3). |
| Migração do acerto e modelo do percentual | ADR-016: rateio em centavos, snapshot, gate de 1 centavo, idempotente/reversível; **achado**: arredondamento por lançamento difere do por grupo. |
| Spike de grupos | ADR-018: N:N estrutural; 1:1 só por `UNIQUE(userId)` e 4 leituras; a=13, privada=13–21; preparar na US-035. |
| "Excluir de verdade" (conta/cartão) | Exclusão **lógica terminal** (ledger sem `DELETE`; `OPENING` em toda conta). |
| Copiar link do convite | Exige **rotação do token** (só existe o hash). |

### Riscos técnicos (R2.1/R3)
| Risco | Mitigação |
| :-- | :-- |
| Corrida arquivar × postar; acerto com ex-membro; default `isSharedExpense`; vazamento com "ocultar"; migração do acerto (1 centavo); `competenceOn` esquecido | Ver [`respostas-r21-r3.md` §6](respostas-r21-r3.md) |

### Pendências com outros agentes (R2.1/R3)
- **PO:** aplicar os ajustes de [`respostas-r21-r3.md` §8](respostas-r21-r3.md) (pontos, parcelamento na R3, EN-002 Must, US-040 com exclusão, US-024 busca, mensagens neutras, ordem US-027 primeiro) e marcar US-022..039 como **Especificadas**.
- **Gestor:** itens **TL-02..TL-09** em [`../manager/pedidos-ao-gestor.md`](../manager/pedidos-ao-gestor.md) (todos com hipótese conservadora; nenhum bloqueia a R2.1).
- **Dev & QA:** rodar a linha de base E2E completa (D-GES-19) antes da US-022; seguir a ordem técnica; SDD-011 §9 e SDD-010 §9 listam o que muda em R1/R2.
- **Stakeholder:** validar a assimetria D-PO-26 (parcela por mês da fatura × à vista por data) na homologação da R3.

---

## Ciclo R2: todas as histórias da R2 estão **Especificadas** (SDD-007, SDD-008, SDD-009)
| Artefato | Cobre | Observação |
| :--- | :--- | :--- |
| [SDD-007 Categorias](sdd/SDD-007-categorias.md) | US-014 | Arquivar/reativar, unicidade sem caixa, trava da última ativa por advisory lock, 26 ícones, `version` |
| [SDD-008 Cartões, compra à vista, fatura e pagamento](sdd/SDD-008-cartoes-fatura.md) | US-015, US-016a/b, US-017a/b | Funções puras do ciclo (vetores), fatura sob demanda, limite/total/situação derivados, pagamento com `expectedTotalInCents`, travas, **lista de impacto no código da R1** (§10) |
| [SDD-009 Despesas previstas e baixa](sdd/SDD-009-despesas-previstas.md) | US-018, US-019 | Previsão fora do ledger, baixa via `createExpenseCore`, desfazer, `listPayables` (previsões + faturas), bloco da Home |
| [ADR-014 Cartão e fatura no ledger](adrs/ADR-014-cartao-e-fatura-no-ledger.md) | US-015..017b | **Novo.** Compra = `EXPENSE` com `cardId`/`invoiceId` e `accountId` nulo; pagamento = `INVOICE_PAYMENT` (uma perna, fora de totais e acerto); resolve **GAP-3** |
| [ADR-015 Previsão como entidade própria](adrs/ADR-015-despesa-prevista-como-entidade-propria.md) | US-018, US-019 | **Novo.** `PlannedExpense` + `paidTransactionId`; valor pago só na `Transaction` |
| [`architecture/modelo-de-dados.md` §7](architecture/modelo-de-dados.md) | R2 | ER, Prisma e SQL cru (5 migrações: `us014_categorias`, `us015_cartoes`, `us016_enum_invoice_payment`, `us016_compra_cartao`, `us018_previstas`) |

### Estimativas da R2 (pontos Fibonacci) e ordem técnica
| Ordem | História | PO | **TL** | SDD | Depende tecnicamente de | Observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- |
| 1 | US-015 | 3 | **3** | 008 | US-002 | Módulo `cartoes`, migração `credit_cards` |
| 2 | US-016a | 5 | **5** | 008 | US-015, US-005, US-007 | **Maior risco da R2**: torna `accountId` anulável e reescreve `tx_kind_shape_chk`; rodar toda a suíte após a migração |
| 3 | US-017a | 3 | **3** | 008 | US-016a | Derivações e telas; expõe `listPayableInvoices` |
| 4 | US-018 | 5 | **5** | 009 | US-005, US-012 (+ US-017a p/ faturas) | Previsão, listas, `listPayables`, bloco da Home |
| 5 | US-019 | 5 | **5** | 009 | US-018, US-004 (+ US-013a p/ `LINKED_TO_PLANNED`) | Extrai `createExpenseCore` |
| 6 | US-017b | 5 | **5** | 008 | US-017a, US-004 | Cortável (Should, D-GES-04) |
| 7 | US-016b | 3 | **3** | 008 | US-016a, US-013a, US-007 | Cortável (Should) |
| 8 | US-014 | 3 | **3** | 007 | US-002, US-005 | Primeira a cortar (Could); independente das demais |
| | **Total R2** | **32** | **32** | | | Must = 21 (015, 016a, 017a, 018, 019); Should = 8 (017b, 016b); Could = 3 (014) |

**Concordância com o fatiamento do PO (D-PO-10):** 016a/016b e 017a/017b respeitam o limite INVEST ≤ 5; nenhuma fatia pede novo corte. A **016a** está no limite superior: se o Dev medir mais, entrega em *commits* atômicos (banco ➔ serviço ➔ UI) sem mudar o escopo da história.

### Decisões e respostas do TL (R2)
| Pergunta / Gap | Resposta |
| :-- | :-- |
| **GAP-3** (`Transaction` sem `accountId`) | `accountId` anulável **só** em compra no cartão, garantido por `CHECK` de forma por `kind` (ADR-014); `accountBalances` filtra `accountId IS NOT NULL`. |
| Fatura: entidade ou derivada? | `CardInvoice` materializada sob demanda (datas gravadas); **total, limite e situação derivados** (ADR-014 §3–4). Sem job de fechamento. |
| Pagamento da fatura e transferências | Mesmo vocabulário do ledger (movimenta caixa sem despesa, desfazer lógico, aviso de saldo negativo), mas **uma perna** (`INVOICE_PAYMENT`), não `TransferGroup` (não há 2ª conta). |
| D-PO-07 (ciclo travado) | `cycleLocked = EXISTS(card_invoices)`; `CYCLE_LOCKED` no `PATCH`; corrida protegida por `FOR UPDATE/SHARE` no cartão. **Aceita**; alternativa versionada fica para o AP1 (parcelamento). |
| Q-18 / D-PO-06 (dia do fechamento) | `dia ≤ closingDay` ⇒ fatura que fecha naquele dia. Função pura com vetores. |
| **Q-20** (crédito do acerto) | Implementado como o PO propôs (`payerMemberId` da compra). **Risco registrado** no ADR-014: se a família paga a fatura com a conta de quem não comprou, o acerto não reflete o desembolso real; mudar é uma regra de consulta (AP2), sem migração. |
| Q-21 (pagar valor diferente) | Fora da R2: o pagamento é sempre o total derivado, conferido por `expectedTotalInCents`. |
| Q-22 (`isSharedExpense` da previsão) | Gravado na previsão e repassado à despesa na baixa; editável depois pela US-013 na despesa gerada. |
| Previsão: ledger ou entidade? | Entidade própria (ADR-015). Valor pago só na `Transaction`; diferença calculada. |
| Conflito de BDD detectado (US-019) | "Baixa única" e "Conflito de baixa simultânea" eram a mesma situação técnica; o PO esclareceu o primeiro (versão atual). Ordem fixa: versão ➔ situação. |
| Dependências externas novas | **Nenhuma** (tudo local, sem serviços de terceiros); `pendencias-externas.md` inalterado. |

### Riscos técnicos da R2
| Risco | Mitigação |
| :-- | :-- |
| Reescrever `tx_kind_shape_chk` e anular `accountId` quebram consultas/DTOs da R1 | Lista de impacto (SDD-008 §10); testes de regressão de saldo, totais, extrato e acerto com compra no cartão e pagamento; migração do enum **isolada** (valor novo de enum não usável na mesma transação) |
| Corridas entre compra, pagamento e edição de data na mesma fatura | `FOR UPDATE` na fatura, ordem crescente de `ref` ao travar duas, `expectedTotalInCents`, testes `Promise.all` obrigatórios |
| Situação da fatura depende de "hoje" (virada de dia em SP) | `Clock` injetável, vetores com `2026-10-26T02:30:00Z` |
| Previsão e despesa gerada divergirem | Fonte única do valor pago (join por `paidTransactionId`), guarda `LINKED_TO_PLANNED`, `CHECK status ⇔ paidTransactionId` |
| US-013a ainda não implementada quando a R2 começar | SDD-008 §4.6 e SDD-009 §4.5 já fixam as emendas; as regras entram junto com a 013a (ou como débito explícito na 016b/019) |

### Pendências com outros agentes (R2)
- **PO:** refletir no `backlog.md` as estimativas (idênticas às do PO) e marcar US-014..019 como **Especificadas** (feito neste ciclo).
- **Dev & QA:** ao iniciar a R2, seguir a ordem acima; **SDD-008 §10 e SDD-009 §9** listam o que muda no código da R1; rodar a suíte completa depois da migração `us016_compra_cartao`.
- **Gestor:** ratificar D-PO-10 (US-017a Must / 017b Should). Nenhuma pergunta bloqueante (Q-18..Q-22 seguem com hipóteses conservadoras).
- **Stakeholder:** validar D-PO-04..11 e a sensibilidade da **Q-20** na homologação da R2.

---

## Ciclo R1 (anterior)

## Entregue neste ciclo: todas as histórias da R1 estão **Especificadas**
| Artefato | Cobre | Observação |
| :--- | :--- | :--- |
| [SDD-000 Convenções transversais](sdd/SDD-000-convencoes-transversais.md) | todas | API, erros, `withApi`, idempotência, dinheiro, datas/período, relógio, guia de testes comum |
| [SDD-006 Esqueleto e ambiente](sdd/SDD-006-esqueleto-e-ambiente.md) | EN-001 | Ajustes ao que já existe, isolamento de testes, E2E, *seed* e fábricas, `check:imports` |
| [SDD-003 Auth, Família e Convite](sdd/SDD-003-auth-familia-convite.md) | US-001, US-002, US-003 | Dev-login (D-GES-11), gate, convites, e-mail por adapter (Mailpit/SMTP) |
| [SDD-004 Contas e ledger](sdd/SDD-004-contas-e-ledger.md) | US-004, US-010 | Abertura, saldo derivado, transferência atômica com par vinculado, desfazer |
| [SDD-001 Lançamentos (rev. 2)](sdd/SDD-001-transacoes.md) | US-005, US-006, US-013 | GAP-1 e GAP-2 resolvidos; edição/exclusão/restauração com auditoria e `version` |
| [SDD-002 Split e acerto](sdd/SDD-002-split-e-acerto.md) | US-008, US-009, US-011 | Vigência (D-GES-08), maior resto, sugestão N>2, vetores de teste S1..S13 |
| [SDD-005 Extrato e Home](sdd/SDD-005-extrato-e-home.md) | US-007, US-012 | Keyset, totais coerentes, Home em instantâneo `REPEATABLE READ` |
| [`architecture/modelo-de-dados.md`](architecture/modelo-de-dados.md) | todas | ER (mermaid), schema Prisma proposto, SQL cru (CHECKs, índices parciais, triggers) |
| [`architecture/ambiente-local.md`](architecture/ambiente-local.md) | EN-001 | Rev. 2: portas D-GES-10 (5442/5443/3100/1025/8025) e login de teste |

## Decisões vigentes
| Item | Decisão | Documento |
| :--- | :--- | :--- |
| Stack de aplicação | Aceita (Next + TS + Postgres/Prisma + Auth.js + pg-boss) | [ADR-001](adrs/ADR-001-stack-tecnologica.md) |
| Autenticação | Google via Auth.js, sessão em banco | [ADR-002](adrs/ADR-002-autenticacao-google.md) |
| Jobs | pg-boss (nenhuma história da R1 o usa) | [ADR-003](adrs/ADR-003-jobs-e-agendamento.md) |
| Escrita offline | Adiada | [ADR-004](adrs/ADR-004-escrita-offline-adiada.md) |
| Produção/hospedagem | Adiada | [ADR-005](adrs/ADR-005-hospedagem-producao-adiada.md) |
| Split familiar | No MVP | [ADR-006](adrs/ADR-006-split-familiar-no-mvp.md) |
| **Ledger e correções** (emenda ao ADR-001: sem estorno contábil no R1; estado corrente + revisões *append-only* + exclusão lógica) | **Novo** | [ADR-007](adrs/ADR-007-modelo-de-ledger-e-correcoes.md) |
| **Login de teste** (rota própria, sessão em banco, 3 camadas de proteção) | **Novo** (D-GES-11) | [ADR-008](adrs/ADR-008-login-de-teste.md) |
| **Idempotência e `version`** | **Novo** | [ADR-009](adrs/ADR-009-idempotencia-e-controle-otimista.md) |
| **Datas `DATE` e período = f(`cutDay`)** | **Novo** — **confirma D-PO-03** | [ADR-010](adrs/ADR-010-periodo-e-datas.md) |
| **Regra de divisão versionada por vigência** | **Novo** (D-GES-08, responde Q-08) | [ADR-011](adrs/ADR-011-regra-de-divisao-versionada.md) |
| **Convites, vínculo no login, `MailPort`** | **Novo** (D-GES-07) | [ADR-012](adrs/ADR-012-convites-e-email.md) |
| **Isolamento por `familyId` (API sem `familyId`, FKs compostas, sem RLS no R1)** | **Novo** | [ADR-013](adrs/ADR-013-isolamento-por-familia.md) |
| Testes de integração usam `db-test` (5443), não Testcontainers | Emenda ao ADR-001 | [`ambiente-local.md`](architecture/ambiente-local.md) |

## Respostas às perguntas do PO
| Pergunta | Resposta |
| :-- | :-- |
| GAP-1 (`accountId`) | Obrigatório em `EXPENSE`/`INCOME` (SDD-001 §1). |
| GAP-2 (nomes) | `isSharedExpense`, `payerMemberId`, `authorMemberId`, `updatedByMemberId`, `version`, `occurredOn` (SDD-001 §1). |
| Q-03 | 7 dias (D-GES-07), constante `INVITATION_TTL_DAYS`. |
| Q-05 | Contrato aceita descrição ausente; **o servidor preenche** com o nome da categoria. |
| Q-08 | **Sim**, vigência por data (ADR-011). |
| D-PO-03 | **Confirmada** (ADR-010): `periodOf(date, cutDay=1)`; `Family.cutDay` existe sem UI. |
| Pergunta de US-004 (abertura no ledger) | `Transaction(kind=OPENING)` (ADR-007). |
| Pergunta de US-007 (paginação/URL) | Keyset + filtros na URL (SDD-005). |
| Pergunta de US-012 (consulta vs materializado) | Consulta; reavaliar com medição (SDD-005 §1). |
| Pergunta de US-013 (editar sobre ledger imutável) | Estado corrente + revisões append-only (ADR-007). |

## Estimativas (pontos Fibonacci) e ordem de implementação

| Ordem | História | PO | **TL** | SDD | Depende tecnicamente de | Observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- |
| 1 | EN-001 | 5 | **8** | 006 | — | Parte já existe; o Dev pode re-estimar para 5. Entrega utilitários puros testados |
| 2 | US-001 | 3 | **5** | 003 | EN-001 | Auth.js (DB) + dev-login + middleware + guarda de produção |
| 3 | US-002 | 2 | **3** | 003 | US-001 | Nasce aqui `withApi` + `IdempotencyRecord` + `makeRepos` |
| 4 | US-004 | 3 | **5** | 004 | US-002 | Nasce o **ledger** (`Transaction`, `recordRevision`, `accountBalances`) e a migração SQL |
| 5 | US-005 | 5 | **5** | 001 | US-004 | Drawer rápido, otimista, idempotente |
| 6 | US-006 | 2 | **2** | 001 | US-005 | `type=INCOME` |
| 7 | US-007 | 3 | **5** | 005 | US-005, US-006 | Nasce `buildLedgerWhere`/`ledgerTotals` |
| 8 | US-003 | 3 | **5** | 003 | US-002 | Convite, gate, `MailPort`/Mailpit |
| 9 | US-008 | 2 | **3** | 002 | US-003 | Regra versionada |
| 10 | US-009 | 5 | **8** | 002 | US-005, US-008 | **`computeSettlement` pode começar antes** (só unidade) |
| 11 | US-010 | 3 | **3** | 004 | US-004 | `createTransferGroup` pode ser feito logo após US-004 se houver folga |
| 12 | US-011 | 3 | **5** | 002 | US-009, US-010 | Lock + recálculo transacional |
| 13 | US-012 | 3 | **5** | 005 | US-004, US-007, US-009 | Agregados em instantâneo |
| 14 | US-013 | 3 | **8** | 001 | US-005, US-007 (+ US-010/011 para desfazer) | Último; primeiro a cortar (D-GES-03) |
| | **Total** | **45** | **70** | | | Inc 1 (EN-001, US-001..007, US-003) = **38**; Inc 2 (US-008..013) = **32** |

**Dependências técnicas transversais:** `withApi`/idempotência (US-002) → todas as mutações; ledger (US-004) → US-005 em diante; `createTransferGroup` (US-010) → US-011; `computeSettlement` (US-009) → US-011, US-012 e US-013 (testes cruzados); `ledgerTotals` (US-007) → testes de regressão de US-009/010/011/012.

**Alertas de tamanho (INVEST ≤ 5, `working-agreement.md`):** três itens passaram de 5 na estimativa do TL. Sugestão ao PO/Gestor (não bloqueia o Dev, que pode implementar por *commits* atômicos nesta divisão):
- **US-009 (8)** → *9a* motor puro `computeSettlement` + vetores S1..S13 (3) e *9b* painel/UI/API (5).
- **US-013 (8)** → *13a* editar/excluir/restaurar + auditoria + `409` (5) e *13b* desfazer transferência/acerto + confirmação de mês acertado (3).
- **EN-001 (8)** → já parcialmente entregue; manter como está.

**Riscos técnicos acompanhados**
| Risco | Mitigação |
| :-- | :-- |
| Auth.js v5 ainda em *beta* e Credentials sem sessão em banco | Rota própria de dev-login (ADR-008); fixar versão no lockfile |
| Prisma 7 + FKs compostas + `$queryRaw` com `BigInt` | `toCents()` na borda; SQL cru só em consultas de saldo/extrato/home; fallback para FKs só em SQL se o Prisma recusar relações compostas |
| TypeScript 7 e Zod 4 (APIs novas) | SDDs marcam "vale a versão instalada; contratos vinculam" |
| Corridas (acerto, convite, nome de conta) | Índices únicos + advisory lock + testes `Promise.all` obrigatórios |
| Vazamento do dev-login para produção | 3 camadas + teste automatizado (SDD-003 §8) |

## Pendências com outros agentes
- **PO:** (a) EN-001 cita `localhost:3000`; vale **3100** (D-GES-10); (b) avaliar o fatiamento sugerido de US-009 e US-013 e refletir as estimativas do TL em `backlog.md`; (c) marcar EN-001, US-001..013 como **Especificadas**.
- **Dev & QA:** reescrever o `tasks-board.md` seguindo a ordem acima (D-GES-09); ajustar `playwright.config.ts` conforme SDD-006 §1 (E2E em porta 3101 com `db-test`); instalar dependências por história (SDD-006 §2).
- **Gestor:** nenhuma decisão nova pendente. Registrada a pendência externa **EXT-08** (domínio/DNS do remetente de e-mail) em `pendencias-externas.md`. O Gestor pode reavaliar o cronograma com base nas estimativas acima (70 pontos na R1).
- **Stakeholder:** validar D-PO-01/02 na homologação (os SDDs já seguem ambas).

## Próximos passos do Tech Lead
1. Responder dúvidas do Dev sobre os SDDs (registrar em `sdd/` como errata datada, nunca sobrescrever em silêncio).
2. Revisar o código de cada história contra o SDD antes da homologação (DoD).
3. ~~Quando o PO refinar o Inc 3 (US-014..019), produzir SDD-007~~ — **feito**: SDD-007, SDD-008, SDD-009 (ver ciclo R2 acima).
4. Revisar o código da R2 contra os SDDs antes da homologação; atenção especial à migração `us016_compra_cartao` e às travas de fatura.
