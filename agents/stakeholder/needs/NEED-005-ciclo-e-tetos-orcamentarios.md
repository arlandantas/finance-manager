# NEED-005: Ciclo Orçamentário e Tetos Flexíveis por Mês

## 📋 Metadados
- **ID:** `NEED-005`
- **Área:** Planejamento e Orçamento Familiar
- **Status:** Validado pelo Usuário
- **Consumidores:** Product Owner (`US`), Arquiteto de Software (`ADR`)

---

## 1. Contexto e Dor de Negócio
O orçamento de uma família nunca é idêntico em todos os meses:
- Em Dezembro há gastos extras com confraternizações, viagens e presentes de Natal;
- Em Janeiro há matrícula escolar, material didático e impostos (IPVA/IPTU);
- O ciclo financeiro familiar de muitas famílias não fecha no dia 30/31, mas sim no dia do pagamento dos salários (ex: dia 05).

Sistemas com tetos estáticos ou ciclos rígidos forçam a família a se adaptar ao software, gerando desistência.

---

## 2. Necessidade
O sistema deve permitir a parametrização do **ciclo financeiro da família** e o gerenciamento de **tetos orçamentários dinâmicos por mês/competência**:

1. **Ciclo Orçamentário Customizável:**
   - A família configura o dia de corte/fechamento do ciclo mensal (ex: dia 05).
   - Todos os relatórios de consumo orçamentário respeitam essa janela (ex: 05/Out a 04/Nov).
2. **Tetos Dinâmicos por Categoria por Mês:**
   - O teto **não é estático**. A família pode estipular valores diferentes para cada categoria em cada mês de acordo com suas prioridades sazonais.
3. **Cópia Automática do Mês Anterior (Clonagem Zero-Fadiga):**
   - Ao iniciar um novo ciclo orçamentário mensal, o sistema **copia automaticamente os valores de teto do mês anterior** para o novo mês.
   - A família não precisa recadastrar nada do zero: o orçamento já nasce pronto, bastando alterar pontualmente as categorias que sofrerem ajustes sazonais.
4. **Preservação do Histórico:**
   - O sistema congela e armazena os tetos projetados de cada mês anterior, permitindo avaliar a evolução histórica entre o que foi planejado e o que foi realizado.

---

## 3. Regras de Negócio (RN)
- **RN-005.1:** Cada família possui uma configuração de dia de fechamento do ciclo orçamentário.
- **RN-005.2:** Na transição para um novo ciclo orçamentário, o sistema inicializa os tetos das categorias replicando compulsoriamente os valores da competência anterior (`YYYY-MM-1`), deixando-os prontos para visualização e livre edição.
- **RN-005.3:** Alterações no teto do mês atual ou futuro não alteram os registros de competências passadas.

---

## 4. Cenário de Exemplo
> **Cenário:** Família Silva define que seu ciclo orçamentário fecha todo dia 05.
> - Em Outubro, o teto para "Lazer & Restaurantes" é de R$ 600,00.
> - Em Dezembro (férias), eles ajustam o teto dessa mesma categoria para R$ 1.500,00.
> - Ao consultar o histórico do ano, o sistema exibe fielmente a meta de R$ 600 em Outubro e R$ 1.500 em Dezembro, com os respectivos consumos reais de cada época.
