# NEED-011: Termômetro de Liquidez Imediata (Previsão de 7 Dias)

## 📋 Metadados
- **ID:** `NEED-011`
- **Área:** Fluxo de Caixa e Prevenção de Descasamento
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
Muitas famílias entram no cheque especial ou pagam multas de atraso não por falta de dinheiro no mês, mas por **descasamento de datas**:
- Vence um boleto de R$ 1.200 amanhã, mas a conta só tem R$ 400 porque o salário só será creditado daqui a 4 dias;
- Olhar apenas o saldo total do mês não alerta sobre essa armadilha de curto prazo.

---

## 2. Necessidade
O sistema deve apresentar um **Termômetro de Liquidez Imediata (Janela de 7 Dias)** em destaque no painel principal:

1. **Visão da Janela de 7 Dias:**
   - Total de **Despesas Previstas** com vencimento nos próximos 7 dias;
   - Total de **Receitas Previstas** esperadas nos próximos 7 dias;
   - Saldo Livre consolidado disponível nas contas bancárias hoje.
2. **Sinalização Preventiva:**
   - **Status Seguro (Verde):** O saldo livre atual + receitas imediatas cobrem com folga os compromissos dos próximos 7 dias.
   - **Status Alerta (Amarelo/Vermelho):** Risco iminente de saldo insuficiente para pagar boletos nos próximos dias, permitindo à família antecipar transferências, resgatar de uma caixinha ou negociar prazos antes do vencimento.

---

## 3. Regras de Negócio (RN)
- **RN-011.1:** O cálculo do termômetro considera apenas o **Saldo Livre** das contas (excluindo caixinhas protegidas).
- **RN-011.2:** Apenas despesas e receitas no estado `PREVISTO` com data entre a data atual ($D_0$) e $D+7$ entram na soma da janela de liquidez imediata.
- **RN-011.3:** Ao liquidar ou adiar uma despesa prevista, o termômetro recalcula o status em tempo real.

---

## 4. Cenário de Exemplo
> **Cenário:** Hoje é terça-feira. A família possui R$ 800 de Saldo Livre nas contas correntes.
> - Há um boleto de condomínio de R$ 950 previsto para quinta-feira e uma fatura de cartão de R$ 600 prevista para segunda-feira (dentro da janela de 7 dias). Total compromissos = R$ 1.550.
> - O termômetro acende em destaque no topo do painel:  
>   `⚠️ Atenção: R$ 1.550 a pagar nos próximos 7 dias vs R$ 800 disponíveis (Déficit projetado: -R$ 750)`.
> - A família identifica o problema 2 dias antes e resgata R$ 1.000 da caixinha de reserva para a conta corrente, evitando atraso e juros.
