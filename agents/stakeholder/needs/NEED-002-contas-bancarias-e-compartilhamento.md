# NEED-002: Contas Bancárias e Compartilhamento Familiar

## 📋 Metadados
- **ID:** `NEED-002`
- **Área:** Contas e Meios Financeiros
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
As famílias possuem múltiplas contas em diferentes bancos (Nubank, Itaú, Inter, etc.), algumas individuais de cada pessoa e outras conjuntas. Sem compartilhamento:
- Um membro não consegue visualizar o saldo familiar real;
- Não é possível lançar movimentações na conta conjunta ou transferir dinheiro entre contas familiares de forma conciliada.

---

## 2. Necessidade
O sistema deve permitir o cadastro de contas bancárias (com titular principal, instituição, tipo de conta e saldo) e viabilizar o **compartilhamento de acesso** entre os membros do grupo familiar.

- **Entradas e Saídas:** Registro de créditos e débitos diretos com saldo atualizado em tempo real.
- **Transferências entre Contas:** Movimentação entre duas contas da família com débito na origem e crédito no destino em uma única operação consistente.
- **Compartilhamento Flexível:** Membros autorizados podem consultar extratos e lançar movimentações na conta.

---

## 3. Regras de Negócio (RN)
- **RN-002.1:** Cada conta possui um titular principal (`owner`), mas pode ter permissões de acesso compartilhadas para outros membros da família.
- **RN-002.2:** O saldo da conta é recalculado dinamicamente com base nas entradas, saídas avulsas, transferências e pagamentos de previsões quitados.
- **RN-002.3:** Uma transferência interna entre contas da família não altera o patrimônio líquido total do grupo, apenas redistribui os saldos entre as contas.

---

## 4. Cenário de Exemplo
> **Cenário:** João transfere R$ 1.000,00 da sua conta corrente individual no Itaú para a conta conjunta no Nubank (compartilhada com Maria).
> - O sistema debita R$ 1.000,00 do Itaú de João.
> - O sistema credita R$ 1.000,00 no Nubank Conjunto.
> - O histórico preserva o vínculo da transferência entre as duas contas.
