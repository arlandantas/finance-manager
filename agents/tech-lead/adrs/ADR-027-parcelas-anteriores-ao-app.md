# ADR-027: Parcelas "anteriores ao app" como contador no plano, ancoradas na fatura da próxima parcela

## Status
Aceito (Tech Lead), 2026-10-24. **Estende** o [ADR-017](ADR-017-parcelamento-no-cartao-e-competencia.md) e o [ADR-020](ADR-020-parcela-na-k-esima-fatura-e-competencia-no-banco.md) (que continuam valendo integralmente para planos sem parcelas pagas). Base do [SDD-020](../sdd/SDD-020-parcelas-ja-pagas-na-entrada.md). Rastreabilidade: NEED-024 (RN-024.1..7) · US-065 · D-PO-54..56 · Q-U03 (hipótese "só o restante").

## Contexto
Quem começa a usar o app já tem compras parceladas em andamento ("sofá 10x, 4 pagas"). O PO decidiu (D-PO-54) que as parcelas pagas **não geram lançamento**. Faltava decidir: (1) como representá-las; (2) a que fatura vai a primeira parcela restante, já que a **data da compra** original geralmente não é conhecida e, se usada, colocaria a parcela 1 no passado; (3) o tratamento do resto de centavos; (4) a interação com limite, acerto, exclusão (US-040b) e edição (US-041).

## Decisão
1. **Contador no plano, sem linhas fantasma.** `InstallmentPlan.paidBeforeAppCount` (0..`installmentCount − 1`, padrão 0). As parcelas `1..P` **não existem** em `transactions`; as `P+1..N` são lançadas como hoje (uma linha `EXPENSE` de cartão por fatura, `installmentNo` real). Consequência: nenhuma consulta de valor (Extrato, Resumo, Análise, acerto, saldo, limite) muda; o plano continua **fora** de qualquer `SUM` (invariante 3 do SDD-014).
2. **Âncora = data da próxima parcela, não a data da compra.** Com `P ≥ 1`, o campo de data do formulário passa a significar "a próxima parcela (P+1) cai na fatura que contém esta data" (padrão: hoje ⇒ fatura **aberta**). O algoritmo reutiliza `buildInstallments` (vetores e propriedades do ADR-020 §1 já provados) **com `purchaseOn := anchorOn` e `count := N − P`**, e renumera `no := k + P`. Assim valem, sem prova nova, "uma parcela por fatura", refs consecutivas e `occurredOn_k ≤ closingDate(ref_k)`.
   - Fatura fechada e ainda **não paga** (janela entre fechamento e vencimento): a UI oferece escolher "fatura fechada de {mês}" e manda `anchorOn = closingDate` dela; fatura **paga** no intervalo ⇒ `422 INVOICE_ALREADY_PAID` (regra existente).
   - `InstallmentPlan.purchaseOn` passa a significar **"data nominal da primeira parcela lançada"**; para `P = 0` isso é exatamente a data da compra (sem mudança de semântica no que existe). A data real da compra antiga **não** é pedida nem guardada (RN-024.7 vira validação por prévia, como o PO propôs).
3. **Centavos do plano completo.** Os valores vêm de `splitInstallments(total, N)` (sobra **toda** na parcela 1, RN-003.4) e as lançadas são os elementos `P+1..N`. Se `P ≥ 1`, a sobra pertence a uma parcela paga: as restantes valem todas `⌊total ÷ N⌋` e Σ lançadas = `total − Σ pagas`. É o que o emissor cobra no mundo real (a 1ª parcela já carregou a diferença). A prévia informa: "A diferença de centavos ficou na 1ª parcela, já paga".
4. **Limite**: nenhuma regra nova — `cardUsage` soma só faturas não pagas, logo consome apenas o saldo restante (D-PO-55); excluir o plano devolve exatamente Σ lançadas.
5. **Imutabilidade**: as parcelas `1..P` não têm linha, logo **não** são editáveis, excluíveis nem restauráveis (US-041 opera só sobre linhas). `paidBeforeAppCount` é **imutável** após a criação; corrigir = excluir a compra (se todas em fatura aberta) e relançar, ou excluir parcelas avulsas (US-041).
6. **Acerto (US-042)**: rateio só nas parcelas lançadas; nenhuma dívida retroativa. Não toca no motor do acerto nem na EN-002.

## Alternativas descartadas
- **Linhas marcadas `PRE_APP`** (parcelas pagas gravadas com flag): exigiriam filtro novo em todas as consultas por período e em `cardUsage` — exatamente o tipo de predicado esquecido que o ADR-020 §2 quer eliminar. Risco de "falsa despesa" em meses passados. Descartada.
- **Pedir a data da compra original e derivar `ref_{P+1}`**: o usuário raramente sabe a data exata; um erro de 1 dia antes do fechamento desloca todas as parcelas em 1 mês. A prévia baseada na fatura é mais confiável. Fica como evolução possível (campo opcional) se a homologação pedir.
- **Recalcular a sobra nas restantes** (repartir o total restante informado): não corresponde ao que o emissor cobra quando a sobra foi na 1ª parcela.

## Consequências
- Migração pequena (`us065_parcelas_anteriores`): coluna `paidBeforeAppCount INT NOT NULL DEFAULT 0` + `CHECK`; nenhum retropreenchimento (planos existentes = 0).
- `InstallmentPlanDTO` ganha `paidBeforeApp` e `purchaseOnKnown`; "Ver compra" mostra "Parcelas 1 a P: anteriores ao app (já pagas)".
- Invariante 1 do SDD-014 ganha a forma geral: Σ lançadas do plano recém-criado = Σ `splitInstallments(total, N)[P..N−1]`; `N − P` linhas; `no ∈ P+1..N`.
- A futura importação de fatura (R5) reaproveita este modelo para itens "3/10".
