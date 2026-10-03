# NEED-003: Cartões de Crédito e Compras Parceladas

## 📋 Metadados
- **ID:** `NEED-003`
- **Área:** Meios de Pagamento e Crédito
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
O cartão de crédito é a principal forma de pagamento no dia a dia familiar, mas gera grande confusão contábil:
- Gastos no cartão **não saem do saldo bancário na hora**; eles viram uma fatura futura;
- Compras parceladas (ex: 10x de R$ 250,00) comprometem o orçamento de quase um ano inteiro, mas se o usuário tiver que digitar mês a mês manualmente, o sistema é abandonado.

---

## 2. Necessidade
O sistema deve tratar o **Cartão de Crédito como uma entidade autônoma** (distinta de contas bancárias) e suportar **compras parceladas com projeção automática**:

1. **Entidade Cartão:** Possui titular, limite total, dia de fechamento e dia de vencimento da fatura. Pode ser compartilhado entre membros.
2. **Ciclo da Fatura:**
   - Compras feitas consomem o limite disponível e acumulam na fatura do mês.
   - O saldo bancário **não é alterado** no momento da compra.
   - A fatura fechada gera uma despesa a ser paga na data de vencimento. O pagamento da fatura sim debita de uma conta bancária.
3. **Parcelamento Automático:**
   - Ao lançar uma compra informando quantidade de parcelas (ex: 10x), o sistema agenda automaticamente as parcelas (`1/10`, `2/10`, ..., `10/10`) nas faturas dos meses subsequentes, respeitando o dia de corte.

---

## 3. Regras de Negócio (RN)
- **RN-003.1:** Compras no cartão impactam o limite do cartão imediatamente, mas não afetam saldos de contas bancárias.
- **RN-003.2:** Uma compra parcelada em $N$ vezes gera automaticamente as $N$ movimentações futuras agrupadas por um identificador comum de parcelamento.
- **RN-003.3:** Toda compra no cartão registra qual membro realizou a despesa, permitindo apurar quanto cada um gastou na fatura do cartão compartilhado.

---

## 4. Cenário de Exemplo
> **Cenário:** Em 15 de Outubro, Maria compra um sofá parcelado em 5x de R$ 400,00 no cartão compartilhado (fechamento dia 25, vencimento dia 05).
> - Parcela 1/5 (R$ 400): entra na fatura com fechamento em 25/Out e vencimento em 05/Nov.
> - Parcelas 2/5 a 5/5: já aparecem provisionadas nas faturas de Dezembro, Janeiro, Fevereiro e Março.
> - O limite do cartão é reduzido em R$ 2.000,00 imediatamente.
