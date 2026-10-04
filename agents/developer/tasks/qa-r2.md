# QA da R2 (US-014..019) — Agente Desenvolvedor & QA

*2026-10-04 · Regressão completa R1 + R2 em um único passe.*

## Resultado
| Portão | Resultado |
| :-- | :-- |
| `pnpm lint` / `pnpm typecheck` (agora `--incremental false`) / `check:imports` | verdes |
| `pnpm test` (unidade) | 225 passando |
| `pnpm test:int` (Postgres real, db-test) | 379 passando (24 arquivos) |
| `pnpm test:e2e` (BDD pt, desktop + mobile Pixel 7) | **478 passando**, 0 falhas (12,3 min); 4 cenários `@integration` cobertos só em Vitest |
| Regressão R1 após `us016_compra_cartao` (reescreve `tx_kind_shape_chk`) | verde (rodada logo após a migração e de novo no passe final) |
| Verificação manual (navegador integrado, 375 px e desktop) | uma passada por história: sem rolagem horizontal; barra inferior com 7 itens cabe (54 px cada) |

Cobertura por história: ver `tasks-board.md` (TASK-017..024). Todos os cenários BDD do PO foram implementados em pt, exceto 4 `@integration` (US-019 "Baixa única" e "Isolamento"; sem rota de UI) — equivalentes em `tests/integration`.

## Bugs achados e corrigidos
1. **`tsc` incremental (TS 7) escondia erros** com `tsbuildinfo` desatualizado (hooks de commit davam falso verde). Corrigido (`--incremental false`).
2. **Cache de cartões (30 s)** mostrava limite e trava dos dias do ciclo desatualizados após ação de outro membro (E2E flaky em mobile). `useCards` rebusca ao montar.
3. **Drawer não abria com família só com cartão** (gate "sem contas"). Agora abre com contas ou cartões.
4. **`retry` padrão do TanStack** atrasava "Não foi possível carregar"/"Não encontrado" em ~7 s. Retry curto e sem 4xx.
5. **Deadlock `40P01` no `TRUNCATE` do `resetDb`** (requisições em curso do cenário anterior): retry com espera.
6. **Linha do extrato do pagamento da fatura** mostrava o cartão no lugar da conta; corrigido (mostra a conta debitada).
7. Passos Gherkin globais colidindo entre histórias (DEV-25) — resolvido com passos comuns despachados por `world.data`.

## Pontos de atenção para a homologação
- **Q-20 / D-GES-13**: o acerto credita a compra no cartão a quem **comprou** (`payerMemberId`), não a quem paga a fatura. Revisar com o casal.
- **D-PO-07**: dias de fechamento/vencimento ficam **travados após a primeira fatura materializada** (mesmo que a compra seja excluída — conservador).
- Bloco "A pagar" da Home só mostra vencimentos até **hoje + 7**: uma fatura que vence em 8+ dias só aparece em "Contas a pagar" (cenário da US-017a ajustado, DEV-26).
- Pagamento de fatura é **integral** (D-PO-09); fatura paga trava compras (criar/editar/excluir/restaurar) até desfazer o pagamento.
- Link "Ver despesa prevista" no detalhe da despesa gerada abre `/previstas#id` no mês corrente (a previsão paga fica na aba "Pagas" do mês de vencimento).
- `GET /api/v1/home` agora inclui `payables`; clientes externos (se houver) devem tolerar o campo novo.
- `POST /api/dev/clock` é só apoio a E2E (404 sem `AUTH_DEV_LOGIN`/em produção, 403 fora de localhost); não deve existir fora do ambiente de teste.
- Dados do banco de **desenvolvimento** têm lançamentos de teste manual (Família Souza, cartão, previstas); limpar com `docker compose -p finance-manager down -v` + `pnpm db:up && pnpm db:migrate && pnpm db:seed`.
- Dependências externas novas: **nenhuma** (nada a registrar em `pendencias-externas.md`).

## Pendências de produto/engenharia (não bloqueantes)
- Parcelamento e recorrência (AP1) reutilizam `CardInvoice`/`PlannedExpense` sem mudança de modelo (ADR-014/015).
- Seed de desenvolvimento ainda não inclui cartão/previstas (SDD-008 §10 e SDD-009 §9 pedem); fábricas de teste cobrem.
