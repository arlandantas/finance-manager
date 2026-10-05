# ADR-023: Receita prevista como `kind` da previsão e cor de conta/cartão como enum fechado

## Status
Aceito (Tech Lead, 2026-10-05). Fecha a pergunta da US-051 ("reaproveitar a entidade de previsão com `kind` ou criar entidade própria") prevista no [ADR-015](ADR-015-despesa-prevista-como-entidade-propria.md) §7 e a da US-050 (campo de cor e migração). Base do [SDD-017](../sdd/SDD-017-cor-e-receitas-previstas-esboco.md).

## Contexto
**Receitas previstas** (US-051) são compromissos com a mesma máquina de estados da despesa prevista (`PREVISTO ➜ PAGO`, valor efetivo na baixa, desfazer, baixa única, `version`, `LINKED_TO_PLANNED`). Uma entidade nova duplicaria serviço, repositório, rotas, DTOs, guardas e a suíte de testes (≈ 70% do SDD-009). **Cor** (US-050) é identificação visual de contas e cartões nos dois temas, com contraste obrigatório e atribuição automática.

## Decisão

### 1. `kind` em `planned_expenses` (generaliza o ADR-015)
`enum PlannedKind { EXPENSE INCOME } DEFAULT EXPENSE` + `CHECK (kind = 'EXPENSE' OR isSharedExpense = false)` (e `splitMode = 'NONE'`, SDD-015). A baixa ramifica **só** no gerador da `Transaction` (`createExpenseCore` × `createIncomeCore`); estados, travas e desfazer são os mesmos. **Efeito sobre o que já existe**: toda consulta de "A pagar" (`listDueItems`, `homePayables`, `GET /payables`) ganha `kind = 'EXPENSE'` **no `repo`** (um ponto), e `GET /planned-expenses` mantém o **padrão `EXPENSE`** — nenhum número nem contrato da R2/R2.1 muda. Receita nova entra por `listReceivables`/`GET /receivables` e pela linha "A receber" do Resumo (só quando existe). O `kind` é **imutável** (para trocar: excluir e cadastrar de novo). Dívida de nome (`planned_expenses`) fica para o AP1.
**Receita prevista pendente vive fora do ledger** (como a despesa): nunca altera saldo, extrato, totais, `byMember` nem acerto; a baixa cria a `Transaction` `INCOME` pelo valor efetivo e na data do recebimento.

### 2. Cor: enum fechado de 10 valores, atribuição por função pura, migração determinística
`enum AccountColor` (10) em `bank_accounts` e `credit_cards`, `NOT NULL`. Enum fechado (não `hex` livre) porque o contraste (≥ 3:1 nos dois temas) é **auditável por teste** sobre tokens CSS (`data-color` + variáveis, sem estilo inline); cor livre exigiria validar contraste por entrada. Escolha da cor nova: `pickNextColor` (1ª livre; senão a menos usada), no servidor, **sem trava** (repetir é permitido, RN-017.4). Migração: `row_number()` por família sobre contas **e** cartões ordenados por `(createdAt, id)`, em ciclo — determinística e idempotente; os existentes não dependem de "primeira exibição".

## Alternativas descartadas
- **Entidade `PlannedIncome` separada:** triplica código e testes; divergência futura entre as duas máquinas de estado.
- **Receita prevista dentro do ledger com status:** quebraria o invariante de que o ledger só tem fatos ocorridos (ADR-015) e exigiria filtro de status em toda soma.
- **Cor como `hex` livre ou por membro/categoria:** fora de escopo (RN-017.3) e sem teste de contraste viável.
- **Atribuir cor na primeira leitura:** efeito colateral em `GET` e corrida entre membros.

## Consequências
- Migrações `us050_cores` e `us051_previstas_receita` (SQL no SDD-017 §5); regressão total das previstas da R2 antes/depois.
- `createIncome` é extraído em `createIncomeCore` (como `createExpenseCore` na US-019).
- A aba "Pagas e recebidas" lê `kind=ALL`; o rótulo "Recebida" é só de UI (o `status` continua `PAGO`).
- Se o AP1 (recorrência) mudar a natureza das previsões, renomear a tabela passa a ser o momento certo (uma migração mecânica).
