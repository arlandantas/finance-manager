# NEED-032: Conta que Paga a Fatura (Cadastro do Cartão)

## 📋 Metadados
- **ID:** `NEED-032`
- **Área:** Cartões e Faturas (estende NEED-003)
- **Status:** Levantado em 2026-10-26 (uso real, item 8) — Q-U22/Q-U23 respondidas pelo usuário em 2026-10-26; prioridade **3ª** na ordem aprovada
- **Prioridade de valor:** **Should (Média/Alta)** — barato e reduz erro mensal
- **Consumidores:** Product Owner, Tech Lead
- **Origem:** Item 8 do feedback de uso real

---

## 1. Dor
Cada cartão é pago, na vida real, por **uma conta** (débito automático ou rotina). O app pergunta a conta a cada pagamento de fatura e não conhece essa relação, então: (1) o usuário escolhe de novo todo mês e pode errar; (2) a previsão de saída da conta (NEED-011/033) não sabe de onde sai o valor da fatura.

## 2. Situação atual (verificada)
- O cartão tem limite, fechamento, vencimento e titular; **não há conta de pagamento no cadastro** (schema `CreditCard`). A conta é escolhida no ato de pagar (`estado/cartoes-faturas.md` regra 8).
- Pagar fatura é sempre total (sem parcial), só após o fechamento, qualquer membro.

## 3. Regras de negócio propostas (RN)
- **RN-032.1:** o cartão pode ter uma **conta pagadora padrão** (opcional) escolhida no cadastro e editável depois.
- **RN-032.2 (padrão, não trava):** ao pagar a fatura, a conta padrão vem **preenchida**, mas o usuário pode escolher outra no ato (a vida real tem exceções). O pagamento continua integral (NEED-003).
- **RN-032.3:** o cadastro avisa se a conta padrão for arquivada ou removida; o cartão não perde a capacidade de ser pago.
- **RN-032.4:** a conta padrão é a origem usada na **previsão por conta** (NEED-033) para a fatura em aberto.
- **RN-032.5:** quem pode trocar a conta padrão segue quem edita o cartão (hoje qualquer membro; só o titular troca o titular).
- **RN-032.6:** mudar a conta padrão **não altera** pagamentos já feitos.

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| "Pagar fatura = total integral, conta escolhida no ato" | Não conflita: conta vira sugestão | Sem pagamento automático (Q-U22) |
| Conta de outro dono ("Só meu" do dono da conta) | Pagar de conta alheia | Já permitido hoje (qualquer membro paga, sem verificar titular); manter |

## 5. Perguntas em aberto
- **Q-U22 — RESPONDIDA (usuário, 2026-10-26):** o app **só sugere** a conta e **avisa o vencimento**; não paga sozinho.
- **Q-U23 — RESPONDIDA (usuário, 2026-10-26):** a conta pagadora é **opcional**.

**Prioridade aprovada:** 3ª. História: US-089.
