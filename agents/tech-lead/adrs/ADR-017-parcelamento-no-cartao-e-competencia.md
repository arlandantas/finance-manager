# ADR-017: Compra parcelada no cartão (N linhas no ledger) e competência da parcela

## Status
Aceito (Tech Lead, 2026-10-04). **Estende o ADR-014** ("parcelamento reaproveita `CardInvoice`: N linhas `EXPENSE` com `installmentGroupId`, uma por fatura") e responde P1 de [`pedidos-ao-tech-lead-r21-r3.md`](../../product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md) (D-PO-25, D-PO-26, D-GES-16, D-GES-17). Implementação na **R3** (US-040..042); ver "Decisão sobre puxar para a R2.1".

## Contexto
US-040 pede compra parcelada (1x a 24x) com valor total, parcelas inteiras em centavos (sobra na 1ª), limite consumido pelo total e liberado a cada fatura paga, uma linha por parcela no Extrato e na fatura ("n/N") e **parcela contando como despesa no mês da fatura em que cai**, enquanto a compra à vista continua pela **data da compra** (D-PO-26). US-042 pede o acerto por parcela, com o percentual da regra vigente **na data da compra** fixo na série.

## Decisão

### 1. Modelo: plano + N lançamentos
```text
InstallmentPlan(id, familyId, cardId, totalInCents, installmentCount 2..24, purchaseOn DATE, description, payerMemberId,
                authorMemberId, createdAt, version, deletedAt?, deletedByMemberId?)      -- "a compra-mãe", sem valor próprio no ledger
Transaction += installmentPlanId uuid NULL, installmentNo int NULL, installmentCount int NULL, competenceOn DATE NOT NULL
```
- **Cada parcela é uma `Transaction(kind = EXPENSE)`** de cartão (`accountId` nulo, `cardId`, `invoiceId` da **sua** fatura), com `installmentNo` 1..N. Extrato, fatura, totais, acerto e saldo **não ganham tabela nova** (mesma razão do ADR-014). O plano **não** soma em nenhuma consulta (evita contar duas vezes).
- `CHECK`: `(installmentPlanId, installmentNo, installmentCount)` todos nulos **ou** todos preenchidos, `1 <= installmentNo <= installmentCount <= 24`; único `(installmentPlanId, installmentNo)`; `tx_kind_shape_chk` inalterada (a parcela é uma compra de cartão). Compra à vista e 1x **não** têm plano (comportamento atual intacto).
- Parcelas herdam `categoryId`, `description`, `payerMemberId`, `isSharedExpense` (ou o rateio, ADR-016), tags (US-045) e `note` do plano; cada uma tem `version` e trilha próprias.

### 2. Cálculo (função pura `buildInstallments`, vetores no SDD-014)
- `base = ⌊total ÷ N⌋`; **toda a diferença** `total − base × N` vai para a **parcela 1** (RN-003.4: R$ 1.000,01 em 3x ⇒ 333,35 + 333,33 + 333,33).
- Data da parcela *k* = `addMonthsClamped(purchaseOn, k − 1)` calculada **sempre a partir da data original** (31/01 ⇒ 28/02 ⇒ 31/03, não encadeada).
- Fatura da parcela *k* = `invoiceRefFor(data_k, closingDay)` (ADR-014 §5). Compra em 28/11 com fechamento 25: parcela 1 em 28/11 cai em **dez/2026**; parcela 2, 28/12, em **jan/2027**.
- Limite: `usedInCents` (derivado, ADR-014 §4) já soma **todas as faturas sem pagamento ativo**, inclusive as futuras ⇒ o total da compra consome o limite na hora e cada pagamento de fatura libera só a parcela daquela fatura. **Nenhuma regra nova de limite.**

### 3. Competência (resposta à assimetria D-PO-26) — coluna `competenceOn`
- `competenceOn` é a data que decide **em que mês o lançamento conta** em Extrato, Resumo do Mês, Acerto, Análise, `byMember` e totais. Para todo lançamento sem plano, `competenceOn = occurredOn` (garantido por `CHECK` e por trigger `BEFORE INSERT/UPDATE`); para parcela, `competenceOn = closingDate` da **fatura da parcela** (cujo mês é o `referenceMonth`). Assim:
  - compra à vista de 28/11 (fatura de dez): conta em **novembro** (data da compra, como homologado);
  - parcela 1 da compra parcelada de 28/11: conta em **dezembro** (mês da fatura), parcela 2 em janeiro.
- **A assimetria é consistente por construção** desde que **toda** consulta por período use o mesmo predicado (`ledgerPeriodWhere`, SDD-010 §1: `competenceOn BETWEEN :start AND :end`). Um teste de propriedade ("reconciliação") compara Extrato, Resumo, Acerto, `byMember` e Análise para dados aleatórios que incluem parcelas após o fechamento, e um *script* de CI falha se aparecer `occurredOn BETWEEN` fora do módulo do predicado.
- **Não toca os números homologados**: para todo lançamento existente `competenceOn = occurredOn` (retropreenchido na migração e travado por `CHECK`); a regressão dos vetores S1..S13 e dos dados homologados roda **antes e depois** da migração.
- **O que o usuário vê**: o Extrato exibe a data nominal da parcela (`occurredOn`) e uma etiqueta "Fatura dez/2026 · 1/10"; o mês em que ele aparece no filtro é o da competência. A ordenação do Extrato continua `(occurredOn, createdAt, id)` (cursor inalterado).
- **Alternativa mais barata (−2 pontos), não adotada**: contar a parcela pela própria `occurredOn` (sem `competenceOn`). Resultado: parcelas de compras feitas **depois do dia de fechamento** contariam um mês antes do mês da fatura (a "assimetria" desaparece, mas Q-F05 deixa de valer nesses casos). Só se o Stakeholder aceitar; hoje vale a D-GES-16.

### 4. Datas futuras no ledger
Parcelas 2..N têm `occurredOn` futura. O invariante "data não pode ser futura" (SDD-001 §4.1) vale para a **data da compra**; a validação passa a ser sobre `purchaseOn`. Consequências obrigatórias: `recent` da Home e "últimos lançamentos" filtram `occurredOn <= hoje`; o Extrato do mês corrente só mostra parcelas daquela competência; `GET /transactions/defaults` ignora parcelas futuras.

### 5. Concorrência, atomicidade, idempotência
Uma transação do `withApi` cria plano + N parcelas + até N faturas (`getOrCreateInvoice`) **travando as faturas em ordem crescente de `ref`** (ADR-014 §6; até 24 `FOR UPDATE`). Falha em qualquer parcela ⇒ rollback total. `Idempotency-Key` cobre a compra inteira (duplo clique = 1 plano com N parcelas). Uma fatura **paga** no intervalo aborta a compra: `422 INVOICE_ALREADY_PAID` (a 1ª parcela com data em fatura paga não é permitida; parcelas futuras nunca caem em fatura paga).

### 6. Ciclo do cartão
`cycleLocked = EXISTS(card_invoices)` (ADR-014) continua suficiente: criar a 1ª compra parcelada já trava o ciclo. O AP1 (ciclo versionado) deve olhar para as faturas **futuras materializadas** (parcelas já gravadas com datas do ciclo antigo): **registrado como risco do AP1**, não bloqueia a R3.

### 7. Edição/exclusão (US-041) e travas até lá
Até a US-041, parcelas são **somente leitura**: `PATCH/delete/restore` de linha com `installmentPlanId` ⇒ `422 INSTALLMENT_NOT_EDITABLE`. **Recomendação ao PO**: mover para a US-040 a ação **"Excluir compra parcelada inteira" (+ Desfazer)**, sem ela um erro de digitação é irrecuperável (+1 ponto na US-040). "Esta e as próximas" (US-041) usa a **versão do plano** (`InstallmentPlan.version`) mais a `version` de cada parcela; só altera parcelas em faturas **abertas** (sem pagamento ativo e `closingDate >= hoje`).

## Decisão sobre puxar o parcelamento para a R2.1 (regra D-GES-17)
**Não puxar.** US-040 estimada em **8** (PO: 5; > 5) e US-042 depende da EN-002 (percentual fixado na série; ver §"US-042" abaixo), o que viola a 3ª condição de D-GES-17. Cortes que levariam a US-040 a 5: (a) apurar a parcela por `occurredOn` (sem `competenceOn`, −2; exige aceite do Stakeholder), (b) deixar a exclusão da compra inteira para a US-041 (−1). Mesmo assim a US-042 só caberia em ≤ 3 **depois** da EN-002 (sem ela exigiria uma âncora `splitRuleVersionId` por lançamento, +2, descartada por criar um segundo mecanismo que a EN-002 substituiria).

## US-042 e a EN-002
O cenário "Mudar a regra depois não altera parcelas já lançadas" só é satisfeito se o percentual da compra estiver **gravado** (a vigência por data usaria a regra de cada parcela futura). Com a EN-002 (ADR-016), o serviço grava o rateio **em cada parcela** a partir do vetor da regra na data da compra, com a regra de centavos por parcela. Ordem técnica da R3: **US-040 ➜ EN-002 ➜ US-042 ➜ US-043 ➜ US-041**.

## Alternativas descartadas
- **Compra-mãe como `EXPENSE` com o total + parcelas como cronograma de caixa**: contaria o total no mês da compra (regime diferente do pedido por Q-F05) e obrigaria todo `SUM` a distinguir mãe de filha.
- **Tabela `Installment` separada**: triplica extrato, totais e acerto (mesma razão do ADR-007/014).
- **Gerar faturas sob demanda ao ler**: o limite consumido e o `usedInCents` ficariam subestimados até a fatura existir.

## Consequências
- Migração `us040_parcelamento` (SQL cru, `modelo-de-dados.md` §9): colunas, `installment_plans`, `competenceOn` com retropreenchimento e `CHECK`, índice `(familyId, competenceOn DESC, createdAt DESC, id DESC)`, trigger de sincronização, índice único `(installmentPlanId, installmentNo)`.
- Lista de impacto no código existente (SDD-014 §9): `buildLedgerWhere`, `paidByMember`, `loadSettlement`/`/settlement/expenses`, `ledgerTotals`, `homePayables` (faturas futuras), `listPayableInvoices`, `GET /cards/:id/invoices` (`nextRef` além da fatura aberta, `isFuture`), `recent`, `defaults`, DTO (`installment: { planId, no, count } | null`).
- Regressão obrigatória após a migração: suíte completa (`test:int`, `test:e2e`) e os vetores homologados.
