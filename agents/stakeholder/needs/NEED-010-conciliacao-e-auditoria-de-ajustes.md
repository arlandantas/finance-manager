# NEED-010: Conciliação Rápida de Saldo e Auditoria de Ajustes

## 📋 Metadados
- **ID:** `NEED-010`
- **Área:** Integridade e Auditoria de Contas
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
No controle manual de finanças familiares, é inevitável que pequenas despesas (gorjetas, cafezinhos, trocos) não sejam lançadas imediatamente. Com o tempo:
- O saldo do sistema diverge do extrato real do banco (ex: sistema diz R$ 1.540, mas o banco está com R$ 1.490);
- O usuário fica frustrado caçando onde errou os R$ 50 e corre o risco de abandonar a disciplina do sistema;
- Por outro lado, fazer ajustes constantes sem visibilidade esconde vazamentos e maus hábitos de lançamento.

---

## 2. Necessidade
O sistema deve fornecer um mecanismo de **Conciliação Rápida de Saldo** com um **Indicador de Auditoria de Ajustes por Conta**:

1. **Ajuste Rápido de Saldo:**
   - Em qualquer conta bancária, o usuário pode acionar a opção "Ajustar para Saldo Real do Banco".
   - O usuário digita o saldo exibido no app do banco no momento.
   - O sistema calcula a diferença e gera automaticamente uma transação do tipo `AJUSTE_CONCILIACAO` (crédito ou débito de ajuste), alinhando o saldo na hora sem travar o usuário.
2. **Indicador de Auditoria de Ajustes:**
   - O sistema deve manter um **indicador visível** demonstrando o montante acumulado e a frequência de ajustes de conciliação realizados em cada conta ao longo dos ciclos.
   - Serve como termômetro de governança para alertar a família: *"Neste mês, tivemos R$ 180 em despesas não identificadas ajustadas por conciliação na Conta X"*, incentivando a melhora no hábito de registro.

---

## 3. Regras de Negócio (RN)
- **RN-010.1:** A transação de ajuste de conciliação deve registrar: saldo anterior, novo saldo informado, valor da divergência, data/hora e o membro que realizou o ajuste.
- **RN-010.2:** Os lançamentos de conciliação devem ser categorizados nativamente como `Ajuste de Conciliação` para não poluir categorias orçamentárias reais (como Alimentação ou Lazer).
- **RN-010.3:** O relatório/indicador de auditoria deve permitir consultar o histórico de conciliações por conta e por período.

---

## 4. Cenário de Exemplo
> **Cenário:** A conta do Itaú está com saldo de R$ 2.450 no sistema, mas no aplicativo do banco o saldo é R$ 2.400.
> - O usuário clica em "Conciliar Saldo", digita R$ 2.400 e confirma.
> - O sistema gera uma saída de R$ 50 do tipo `AJUSTE_CONCILIACAO` ("Ajuste de Saldo Itaú").
> - O saldo é atualizado imediatamente para R$ 2.400.
> - No painel de auditoria da conta, o indicador registra: *"Ajustes de conciliação no mês: R$ 50,00 (1 ocorrência)"*.
