# NEED-004: Despesas Previstas, Recorrência e Quitação

## 📋 Metadados
- **ID:** `NEED-004`
- **Área:** Planejamento e Fluxo Futuro
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
As famílias sofrem com esquecimentos de contas fixas (aluguel, condomínio, mensalidade escolar, luz, internet, assinaturas). 
- Ter que cadastrar essas contas repetitivas manualmente todo mês é improdutivo;
- Sem saber quais compromissos já foram pagos e quais ainda estão pendentes, há risco de pagar duas vezes ou pagar em atraso gerando juros e multas.

---

## 2. Necessidade
O sistema deve gerenciar o ciclo de vida de **Despesas Previstas** e oferecer suporte nativo a **Despesas Recorrentes**:

1. **Ciclo de Estados da Despesa:**
   - **`PREVISTO`:** Compromisso financeiro agendado que ainda aguarda pagamento.
   - **`PAGO`:** Compromisso liquidado.
2. **Baixa / Efetivação do Pagamento:**
   - Ao emitir o pagamento de uma previsão, o estado transita para `PAGO`.
   - A operação registra a conta bancária de onde o dinheiro saiu, a data real de pagamento e o valor efetivamente pago (permitindo variações por multas, descontos ou contas de consumo).
3. **Despesas Recorrentes:**
   - Cadastrar despesas com frequência periódica (ex: mensal) que se projetam automaticamente para os meses seguintes sem digitação repetitiva.

---

## 3. Regras de Negócio (RN)
- **RN-004.1:** Toda despesa prevista inicia no estado `PREVISTO`.
- **RN-004.2:** A transição para o estado `PAGO` exige obrigatoriamente a indicação da conta bancária debitada e a data de liquidação.
- **RN-004.3:** A baixa de pagamento debita automaticamente o saldo da conta bancária escolhida.
- **RN-004.4:** Em despesas recorrentes com valor variável (ex: conta de luz), a alteração do valor em um mês específico não deve corromper a projeção padrão dos meses futuros.

---

## 4. Cenário de Exemplo
> **Cenário:** O condomínio de R$ 650,00 vence todo dia 10 e está cadastrado como despesa recorrente mensal com João como responsável pelo pagamento.
> - No dia 01/Novembro, a conta já aparece em destaque no painel com estado `PREVISTO`.
> - No dia 10/Novembro, João paga pelo app do banco e faz a baixa no sistema informando a conta Itaú.
> - O estado muda para `PAGO`, a conta Itaú tem R$ 650,00 debitados e a previsão do mês seguinte (10/Dezembro) continua intacta como `PREVISTO`.
