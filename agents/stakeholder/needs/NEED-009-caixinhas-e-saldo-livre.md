# NEED-009: Caixinhas (Reservas Protegidas) e Saldo Livre para Gastar

## 📋 Metadados
- **ID:** `NEED-009`
- **Área:** Proteção Patrimonial e Gestão de Contas
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
Quando uma família mantém economias ou reservas dentro da mesma conta corrente em que movimenta os gastos do dia a dia:
- Visualizar o saldo bruto total no banco (ex: R$ 12.000) cria uma falsa sensação de abundância;
- R$ 8.000 desse dinheiro já estavam carimbados para a reserva de emergência ou o IPVA de início de ano, mas acabam sendo gastos por engano em despesas supérfluas.

---

## 2. Necessidade
O sistema deve suportar **Caixinhas / Subcontas Virtuais de Reserva** atreladas a uma conta bancária, com isolamento visual e operacional:

1. **Tela Principal (Home) com Foco Exclusivo no "Saldo Livre para Gastar":**
   - Na visão inicial/geral do sistema, as contas bancárias devem exibir **estritamente o valor "Livre para Gastar"** ($\text{Saldo Total} - \text{Total em Caixinhas}$).
   - Isso protege psicologicamente o dinheiro reservado da família e orienta o comportamento diário.
2. **Caixinhas Visíveis Apenas no Detalhe da Conta:**
   - A visualização das caixinhas existentes (ex: "Reserva de Emergência", "Férias", "IPVA") e seus respectivos saldos só é exibida ao acessar a **tela de detalhe daquela conta específica**.
3. **Transferências Conta ⇄ Caixinha:**
   - O usuário pode transferir valores livremente entre a conta bancária principal e suas caixinhas como se fossem contas separadas (ex: guardar R$ 500 na caixinha ou resgatar R$ 200 para a conta corrente).
   - Essas operações geram histórico de movimentação interna (aportes e resgates).

---

## 3. Regras de Negócio (RN)
- **RN-009.1:** Saldo Livre da Conta na tela principal é calculado como:  
  $$\text{Saldo Livre} = \text{Saldo Real do Banco} - \sum \text{Saldos das Caixinhas}$$
- **RN-009.2:** Transferências entre a conta e suas caixinhas não alteram o patrimônio total do banco, apenas alteram o Saldo Livre disponível para despesas operacionais.
- **RN-009.3:** Não é permitido transferir da conta para a caixinha um valor superior ao saldo livre disponível no momento.

---

## 4. Cenário de Exemplo
> **Cenário:** A conta do Nubank possui R$ 6.000 de saldo bancário real. O usuário cria uma caixinha chamada "Reserva de Emergência" e transfere R$ 4.000 para ela.
> - **Na Tela Inicial:** A conta Nubank exibe como saldo: **R$ 2.000,00 (Livre para Gastar)**. O usuário só enxerga os R$ 2.000 como disponíveis para despesas do mês.
> - **No Detalhe da Conta Nubank:** É exibido o extrato, a caixinha "Reserva de Emergência" com R$ 4.000 e um botão de "Transferir para Caixinha" ou "Resgatar para a Conta".

---

## Revisão do Stakeholder — 2026-10-04 (NEED-015)
O foco da Início passa a ser o **Resumo do Mês** (NEED-015), não o saldo. Ajuste à RN08/RF30: o **Saldo Livre** (descontadas as caixinhas) continua sendo o saldo exibido ao detalhar contas, no **card recolhível de saldos**, e entra como linha do resumo; deixa de ser o "destaque estrito" do topo. A intenção de proteger a reserva permanece.
