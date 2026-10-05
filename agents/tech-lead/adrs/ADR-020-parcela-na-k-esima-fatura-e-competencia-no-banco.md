# ADR-020: Parcela *k* na *k*-ésima fatura, competência derivada no banco e exclusão do plano por carimbo

## Status
Aceito (Tech Lead, 2026-10-05). **Refina o [ADR-017](ADR-017-parcelamento-no-cartao-e-competencia.md)** (que continua valendo em tudo o que não é citado aqui) e é a base do [SDD-014](../sdd/SDD-014-parcelamento-esboco.md). Nenhuma mudança de escopo ou de pontos; a US-040a/b, a US-041 e a US-042 mantêm 5 · 3 · 5 · 3.

## Contexto
Ao detalhar o SDD-014 apareceram quatro pontos que o ADR-017 deixou em aberto ou que, lidos ao pé da letra, produzem resultado errado em casos de borda:

1. O ADR-017 §2 diz "fatura da parcela *k* = `invoiceRefFor(data_k, closingDay)`". Com `closingDay = 28` e uma compra em dia 29, 30 ou 31, a data da parcela de fevereiro é "ajustada" para 28 (`addMonthsClamped`) e passa a **cair antes ou no fechamento** enquanto a parcela anterior caiu depois: a parcela 1 (31/01) vai para a fatura de **fev** e a parcela 2 (28/02) **também** para fev; a parcela 3 (31/03) pula para **abr**. Resultado: duas parcelas na mesma fatura e nenhuma em mar. Nenhum emissor de cartão faz isso: a parcela *n* está na *n*-ésima fatura.
2. A competência (`competenceOn`, ADR-017 §3) é decisiva para Extrato, Resumo, Acerto e Análise. Se for escrita só pela aplicação, um caminho de escrita esquecido (seed, script, correção manual, futura migração) grava valor errado e quebra a reconciliação **sem erro visível**.
3. A exclusão da compra inteira (US-040b) com **Desfazer** precisa restaurar **somente** as parcelas que a própria exclusão removeu (a US-041 permitirá excluir parcelas avulsas antes; elas não podem "ressuscitar").
4. O ADR-017 coloca `occurredOn` futura no ledger (parcelas 2..N). Era preciso decidir onde isso **não** pode vazar (Home, sugestões, "último lançamento").

## Decisão

### 1. Fatura da parcela = fatura da parcela 1 + (*k* − 1) meses; data nominal continua "mesmo dia, ajustado ao fim do mês"
- `ref_1 = invoiceRefFor(purchaseOn, closingDay)`; `ref_k = addMonthsToRef(ref_1, k − 1)`.
- `occurredOn_k = addMonthsClamped(purchaseOn, k − 1)` (sempre a partir da data original; é a data **exibida** e a de ordenação do Extrato).
- **Propriedade** (testada): `occurredOn_k <= closingDate(ref_k)` e `closingDate(ref_k) < occurredOn_k + 1 mês`; refs **estritamente consecutivas**; uma parcela por fatura.
- O resultado é **idêntico** ao do ADR-017 §2 em todos os casos, exceto **fechamento no dia 28 + compra nos dias 29..31 + fevereiro no meio da série** (vetores I5 e I6 do esboço permanecem; o caso novo é o vetor I9).

### 2. `competenceOn` é **derivada no banco**, não informada pela aplicação
Gatilho `BEFORE INSERT OR UPDATE` em `transactions`: sem plano ⇒ `competenceOn := occurredOn`; com plano ⇒ `competenceOn := card_invoices.closingDate` da `invoiceId` da linha (a fatura é lida com a chave composta `(familyId, id)`). O `CHECK` `tx_competence_chk` (`installmentPlanId IS NOT NULL OR competenceOn = occurredOn`) permanece como rede de segurança. O cliente Prisma declara a coluna com `@default(dbgenerated("CURRENT_DATE"))` apenas para **não** exigi-la no `create`; o valor final é sempre o do gatilho. Consequências: nenhum caminho de escrita (inclusive `prisma/seed.ts` e fábricas de teste) consegue gravar competência divergente; o ciclo do cartão é imutável depois da 1ª fatura (ADR-014 §6), logo `closingDate` não muda por baixo da parcela.

### 3. Exclusão e restauração do plano por **carimbo único**
`InstallmentPlan.deletedAt = at` e, na mesma transação, **cada** parcela ativa recebe `deletedAt = at` (o **mesmo** instante, calculado uma vez em `ctx.clock.now()`, precisão de milissegundos), `deletionReason = DELETED`. Restaurar o plano devolve **somente** as parcelas com `deletedAt = plan.deletedAt`. Parcelas excluídas antes (US-041) têm outro instante e permanecem excluídas. Sem tabela de eventos de plano: a trilha vive nas revisões `DELETE`/`RESTORE` de cada parcela (que ganham `changes: [{ field: "installmentPlan", from: …, to: … }]`).

### 4. Onde a data futura **não** pode vazar
Três consultas passam a filtrar `occurredOn <= hoje` (regra "data de calendário ≤ hoje" para *o que já aconteceu*): `recent` da Home, `getDefaults` (último lançamento/cartão do membro) e a contagem `usageCountByMe`. **Extrato, Resumo, Acerto e Análise não filtram por `occurredOn`**: usam a competência (predicado único). Parcelas futuras aparecem no Extrato do mês da competência (inclusive meses futuros) por design.

## Alternativas descartadas
- **Manter o ADR-017 §2 literal**: produz duas parcelas na mesma fatura em um caso real (cartão com fechamento no dia 28, compra no fim do mês) e quebra o limite por fatura paga.
- **`competenceOn` gravado pela aplicação**: mais simples, mas sem rede de segurança (ver Contexto 2); o gatilho custa uma leitura por linha de parcela (≤ 24 por compra).
- **Plano com tabela de eventos para o desfazer**: descartada; o carimbo basta e não cria outra fonte de verdade.

## Consequências
- `cartoes/installments.ts` (puro) usa `invoiceRefFor` **uma vez** e `addMonthsToRef` nas demais; o cliente reutiliza a mesma função para a prévia.
- Teste obrigatório: o gatilho recusa/corrige tentativa de gravar `competenceOn` diferente (integração com SQL cru); propriedade de refs consecutivas; vetor I9.
- O `modelo-de-dados.md` (§10) documenta o gatilho como parte da migração `us040_parcelamento`.
