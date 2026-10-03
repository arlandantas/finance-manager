# NEED-001: Membros da Família e Matriz de Responsabilidade

## 📋 Metadados
- **ID:** `NEED-001`
- **Área:** Governança e Usuários Familiares
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
Em uma família, as finanças não são individuais nem totalmente anônimas. Frequentemente:
- Um dos cônjuges centraliza o cadastro das notas no aplicativo no fim do dia;
- O gasto real foi realizado pelo outro cônjuge ou por um filho;
- Determinadas contas fixas ou parcelas futuras são de responsabilidade de pagamento de uma pessoa específica.

Sem essa distinção clara, surgem atritos sobre "quem gastou isso" ou "quem ficou de pagar essa conta".

---

## 2. Necessidade
O sistema deve permitir gerenciar os membros da família e registrar com precisão uma **matriz de tripla responsabilidade** para as movimentações financeiras:

1. **Autor do Cadastro:** Identifica automaticamente o usuário logado que alimentou o dado no sistema (rastreabilidade/auditoria).
2. **Responsável pelo Gasto:** Campo explícito indicando qual membro da família de fato realizou a compra ou auferiu a receita.
3. **Responsável pelo Pagamento Futuro:** Em despesas previstas, indicar expressamente qual membro da família assumiu o compromisso de pagar a conta até a data de vencimento.

---

## 3. Regras de Negócio (RN)
- **RN-001.1:** Toda transação deve registrar compulsoriamente `autor_cadastro` (sistema) e `responsavel_gasto` (selecionado pelo usuário).
- **RN-001.2:** Toda despesa prevista deve permitir designar o `responsavel_pagamento`.
- **RN-001.3:** Um membro pode cadastrar despesas em nome de outro membro da família.

---

## 4. Cenário de Exemplo
> **Cenário:** Maria faz o supermercado da semana no valor de R$ 350,00. À noite, João (marido) abre o sistema e faz o lançamento.
> - **Autor do Cadastro:** João (logado no app).
> - **Responsável pelo Gasto:** Maria (quem fez a compra).
> - **Impacto no relatório:** No painel de divisão familiar, o valor entra no total de consumo de Maria, mas o log de auditoria sabe que João registrou.
