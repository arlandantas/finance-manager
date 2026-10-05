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

---

## 5. Revisão do Stakeholder — 2026-10-04 (feedback do usuário, sugestão 6)
O usuário não encontrou como lançar **compra parcelada** no cartão. Não é falha de interface: o parcelamento (§2.3, RN-003.2) estava planejado para o **AP1** (NEED-003 fase 2). Após o uso real, a avaliação mudou: **sem parcelamento o cartão não reflete a realidade brasileira** e a família passa a lançar parcela por parcela, mês a mês (a dor descrita em §1).

- **Prioridade revisada:** **Must**, **antecipada do AP1 para a R3** (primeira entrega da R3). Se o Tech Lead estimar que o formulário básico cabe na R2.1, a R2.1 passa a incluí-lo; a decisão é do Gestor com base na estimativa.
- **Regras adicionais:**
  - **RN-003.4:** o usuário informa **valor total + nº de parcelas** (ou valor da parcela); o app mostra a prévia "10x de R$ 250,00, 1ª na fatura de nov/2026". Centavos: diferença de arredondamento na **1ª parcela**.
  - **RN-003.5:** o **limite** é consumido pelo valor total na hora da compra (já previsto no cenário §4) e liberado a cada fatura paga.
  - **RN-003.6:** cada parcela aparece na **fatura do mês correspondente**, rotulada "3/10" e ligada às demais pelo identificador de parcelamento.
  - **RN-003.7:** editar/excluir uma parcela oferece "somente esta" ou "esta e as próximas"; excluir a compra inteira é uma ação explícita.
  - **RN-003.8 (acerto, ver NEED-007/018/019):** em compra dividida, **cada parcela entra no acerto do mês em que cai na fatura** (coerente com o regime de caixa do acerto e com Q-20: crédito a quem comprou). Decidido (**Q-F05**).
  - **RN-003.9:** compras com juros: o app trabalha com o **total pago**; não calcula juros.
- **Relação com NEED-008 (desdobramento de compra):** são coisas **diferentes**. Parcelar divide uma compra **no tempo**; desdobrar divide uma compra **entre categorias/membros**. Sem dependência: o parcelamento sai antes e o desdobramento continua no AP2; no futuro, as duas funções devem compor (cada parcela herda o desdobramento).
- **Fora de escopo agora:** antecipar parcelas, parcelamento fora de cartão (carnê/boleto, tratar como recorrente/previsto no AP1), renegociação.
