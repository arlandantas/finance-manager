# 📑 Backlog do Produto (Product Owner)

*Status: Em refinamento*  
*Responsável: Agente Product Owner (PO)*

---

## 🏔️ Épicos do Produto

| ID Épico | Nome do Épico | Descrição Resumida |
| :--- | :--- | :--- |
| **EPIC-01** | **Gestão de Usuários & Núcleo Familiar** | Cadastro, convite de membros e gestão de perfis familiares. |
| **EPIC-02** | **Transações & Categorização** | Lançamento de despesas/receitas, recorrências e etiquetas. |
| **EPIC-03** | **Divisão Compartilhada de Gastos** | Rateio entre membros (50/50 ou proporcional) e balanço de acertos. |
| **EPIC-04** | **Orçamentos & Metas Familiares** | Limites por categoria, regras orçamentárias e metas de economia. |
| **EPIC-05** | **Dashboards & Relatórios Financeiros** | Visão analítica mensal, fluxo de caixa e exportação de dados. |

---

## 📝 Histórias de Usuário Iniciais (Sprint 1 / MVP)

### [US-001] Cadastro e Gestão de Transações Financeiras
- **Épico**: EPIC-02 (Transações & Categorização)
- **Rastreabilidade**: [`[NEED-001]`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/needs-overview.md#need-001-registro-e-classificao-gil-de-transaes)
- **Prioridade**: Must Have
- **Descrição**:
  - **Como** membro da família,
  - **Quero** cadastrar receitas e despesas informando valor, data, categoria, pagador e se a despesa é conjunta ou individual,
  - **Para que** eu tenha controle imediato de para onde o dinheiro está indo.
- **Critérios de Aceitação**:
  - **Cenário 1: Cadastro com sucesso**
    - **Dado** que estou autenticado na aplicação,
    - **Quando** preencho os campos obrigatórios (valor > 0, descrição, categoria, data e tipo conjunta/individual) e clico em salvar,
    - **Então** a transação deve ser exibida no extrato e atualizar o saldo total da família.
  - **Cenário 2: Validação de campos vazios**
    - **Dado** que estou no formulário de transação,
    - **Quando** tento submeter sem informar o valor ou a categoria,
    - **Então** o sistema deve exibir mensagens de erro amigáveis destacando os campos inválidos.

---

### [US-002] Divisão Compartilhada de Despesas no Mês
- **Épico**: EPIC-03 (Divisão Compartilhada de Gastos)
- **Rastreabilidade**: [`[NEED-002]`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/needs-overview.md#need-002-diviso-compartilhada-de-despesas-conjunto-vs-individual)
- **Prioridade**: Must Have
- **Descrição**:
  - **Como** casal ou gestores da casa,
  - **Quero** visualizar um resumo de quem pagou despesas conjuntas e qual é o valor exato a ser compensado entre as partes,
  - **Para que** possamos acertar as contas no fim do mês sem desgastes ou cálculos manuais.
- **Critérios de Aceitação**:
  - **Cenário 1: Cálculo 50/50**
    - **Dado** que há despesas conjuntas marcadas no mês com pagadores distintos,
    - **Quando** acesso o painel de acerto de contas,
    - **Então** o sistema exibe o total gasto conjuntamente por cada um e indica "Pessoa A deve R$ X para Pessoa B".
