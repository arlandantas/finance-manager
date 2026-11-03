# ADR-027 — Parcelas "anteriores ao app" como contador no plano

**Status:** aceito (estende ADR-017 e ADR-020) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
Quem começa a usar o app já tem compras parceladas em andamento ("sofá 10x, 4 pagas"). As parcelas pagas **não geram lançamento** (D-PO-54..56); a data da compra original raramente é conhecida e colocaria a parcela 1 no passado.

## Decisão
1. **Contador, sem linhas fantasma:** `InstallmentPlan.paidBeforeAppCount` (0..`installmentCount − 1`, padrão 0, imutável após criação). Parcelas `1..P` não existem em `transactions`; `P+1..N` são lançadas como hoje (`installmentNo` real). Nenhuma consulta de valor muda; o plano continua fora de qualquer `SUM`.
2. **Âncora = data da próxima parcela:** com `P ≥ 1`, a data do formulário significa "a parcela P+1 cai na fatura que contém esta data" (padrão hoje ⇒ fatura aberta). Reutiliza `buildInstallments` com `purchaseOn := anchorOn` e `count := N − P`, renumerando `no := k + P`; valem as propriedades do ADR-020. Fatura fechada e ainda não paga pode ser escolhida (`anchorOn = closingDate`); fatura paga ⇒ `422 INVOICE_ALREADY_PAID`. `purchaseOn` passa a significar "data nominal da primeira parcela lançada".
3. **Centavos do plano completo:** valores de `splitInstallments(total, N)` (sobra toda na parcela 1); lançadas são `P+1..N`. Com `P ≥ 1` a sobra fica numa parcela paga e as restantes valem `⌊total ÷ N⌋`. A prévia avisa isso.
4. **Limite:** sem regra nova; consome só o saldo restante.
5. Parcelas `1..P` não são editáveis, excluíveis nem restauráveis. Corrigir = excluir a compra e relançar.
6. **Acerto:** rateio só nas parcelas lançadas; nenhuma dívida retroativa.

## Consequências
- Migração `us065_parcelas_anteriores`: `paidBeforeAppCount INT NOT NULL DEFAULT 0` + `CHECK`.
- Invariante: Σ lançadas = Σ `splitInstallments(total, N)[P..N−1]`; `N − P` linhas; `no ∈ P+1..N`.
- Descartados: linhas `PRE_APP` (predicado esquecido em toda consulta), pedir a data real da compra, recalcular a sobra nas restantes.
