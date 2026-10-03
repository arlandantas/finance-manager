# NEED-006: Painel de Disponibilidade por Categoria e Relatórios

## 📋 Metadados
- **ID:** `NEED-006`
- **Área:** Visualização, Decisão e Extratos
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
Muitas aplicações financeiras falham porque mostram gráficos complexos ou apenas o saldo total em banco, sem responder à dúvida prática do dia a dia:
*"Podemos ir jantar fora hoje à noite ou vamos estourar a meta do mês?"*.
Além disso, travar novos lançamentos quando o teto estoura gera frustração e dados desatualizados.

---

## 2. Necessidade
O sistema deve ter como foco central o **empoderamento e autocontrole familiar**, destacando o **saldo restante disponível por categoria**:

1. **Painel Central de Disponibilidade:**
   - Para cada categoria no ciclo corrente, exibir claramente:
     - **Teto do Mês:** Valor planejado;
     - **Total Gasto:** Valor já consumido no ciclo;
     - **Saldo Disponível:** Quanto ainda resta para gastar sem estourar a meta.
2. **Alertas Estritamente Visuais (Autocontrole):**
   - Termômetro visual de status (Verde: dentro da margem; Amarelo: perto do teto; Vermelho: teto ultrapassado).
   - **Não há bloqueios** de novos lançamentos: a responsabilidade de moderação é dos próprios membros.
3. **Visões Sintéticas Complementares:**
   - Saldos por conta bancária e limites utilizados por cartão de crédito;
   - Visão sintética por membro (quem gastou quanto no mês e percentual de participação);
   - Visão de previsões pendentes vs pagas.
4. **Visão Analítica e Extrato Multidimensional:**
   - Extrato completo com filtros por membro (autor ou responsável pelo gasto), conta, cartão, categoria, status e período.

---

## 3. Regras de Negócio (RN)
- **RN-006.1:** Ultrapassar o teto orçamentário não bloqueia lançamentos; altera a indicação visual para alerta/destaque.
- **RN-006.2:** O saldo disponível por categoria é calculado como: $\text{Disponível} = \text{Teto do Mês} - \text{Total Gasto no Ciclo}$.
- **RN-006.3:** Compras parceladas futuras e previsões futuras não entram no cálculo de consumo do ciclo atual, apenas as parcelas/previsões que vencem na janela do ciclo orçamentário corrente.

---

## 4. Cenário de Exemplo
> **Cenário:** O teto de "Alimentação & Supermercado" para o mês é R$ 2.000,00. A família já gastou R$ 1.650,00.
> - Ao acessar o app, o painel exibe em destaque amarelo: **Disponível: R$ 350,00 (82% consumido)**.
> - Se a família fizer uma compra de R$ 400,00, o sistema salva normalmente e o indicador passa para vermelho: **Excedido em R$ 50,00**.
