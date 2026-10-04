# Status do Tech Lead

*Atualizado: 2026-10-04 · Ciclo: liberação do time de desenvolvimento para a **R1** (EN-001, US-001..013)*

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
3. Quando o PO refinar o Inc 3 (US-014..019), produzir SDD-007 (categorias, cartões, previstas).
