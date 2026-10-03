# 📋 Panorama de Necessidades, Personas & Dores (Stakeholder)

*Status: Alinhado e Validado com o Gestor e Usuário*  
*Responsável: Agente Stakeholder*

---

## 🎯 Proposta de Valor para a Família

Uma família típica enfrenta dores crônicas na gestão do seu dinheiro:
1. **Falta de visibilidade do fluxo conjunto:** Gastos pulverizados entre contas de diferentes bancos e cartões de crédito.
2. **Atritos no acerto de contas:** Dúvidas e desgaste emocional sobre quem pagou mais despesas da casa no final do mês.
3. **Falsa ilusão de liquidez:** Saldo alto na conta corrente que acaba sendo gasto porque o dinheiro da reserva de emergência e das férias estava misturado no mesmo saldo.
4. **Descompasso de datas e faturas:** Boletos vencendo antes do salário cair e compras parceladas no cartão de crédito comprometendo meses futuros sem que ninguém perceba.
5. **Fadiga de cadastro e senhas:** Desistência do uso quando o aplicativo exige cadastros burocráticos e redigitação mensal de orçamentos.

---

## 👥 Personas Mapeadas

### Persona 1: O "Gestor Familiar" (Ex: Mariana, 34 anos)
- **Papel:** Acompanha os compromissos a pagar, monitora as previsões, define tetos por categoria e protege as reservas.
- **Dores:** Cansaço de cobrar o parceiro para anotar gastos e medo de pagar contas em duplicidade ou com atraso.
- **Objetivo no App:** Ver em 3 segundos quanto a família ainda pode gastar no mês em cada categoria e saber se os próximos 7 dias estão cobertos financeiramente.

### Persona 2: O "Membro Colaborador" (Ex: Lucas, 36 anos)
- **Papel:** Participa ativamente da renda e das despesas, mas tem rotina corrida e busca praticidade máxima.
- **Dores:** Não sabe quanto pode gastar no dia a dia sem prejudicar as metas da casa; acha formulários lentos.
- **Objetivo no App:** Login com 1 clique com sua conta Google, registro ágil de compras e visão clara do acerto de contas do mês.

---

## 🗺️ Matriz Consolidada de Necessidades (NEED-001 a NEED-012)

Todas as necessidades estão detalhadas em arquivos modulares nesta pasta:

| ID | Necessidade de Negócio | Release Alvo | Resumo da Dor e Valor Entregue |
| :--- | :--- | :---: | :--- |
| **[`NEED-012`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-012-autenticacao-social-google.md)** | **Autenticação com Conta Google** | **AP0 (MVP)** | Login imediato com 1 clique via Google Sign-In, eliminando senhas e importando avatar e nome. |
| **[`NEED-001`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-001-membros-e-responsaveis.md)** | **Membros & Tripla Responsabilidade** | **AP0 (MVP)** | Saber quem cadastrou (`autor`), quem realizou a compra (`gastador`) e quem vai quitar (`pagador`). |
| **[`NEED-002`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-002-contas-bancarias-e-compartilhamento.md)** | **Contas Bancárias & Transferências** | **AP0 (MVP)** | Múltiplas contas compartilhadas no grupo familiar e transferências atômicas entre elas. |
| **[`NEED-003`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-003-cartoes-de-credito-e-parcelamentos.md)** | **Cartões de Crédito & Parcelamentos** | **AP0 / AP1** | Cartão como entidade autônoma (não mexe no saldo bancário até pagar a fatura) + parcelamentos futuros (10x). |
| **[`NEED-004`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-004-despesas-previstas-e-recorrentes.md)** | **Despesas Previstas & Recorrência** | **AP0 / AP1** | Compromissos futuros (`PREVISTO` vs `PAGO`), baixa em conta e contas fixas recorrentes automáticas. |
| **[`NEED-005`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-005-ciclo-e-tetos-orcamentarios.md)** | **Ciclo Customizado & Auto-Clonagem** | **AP1** | Ciclo que fecha no dia desejado pela família, tetos dinâmicos por mês e cópia automática do mês anterior. |
| **[`NEED-006`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-006-disponibilidade-e-relatorios.md)** | **Disponibilidade por Categoria** | **AP0 / AP1** | Painel de autocontrole ("quanto ainda podemos gastar") com termômetros visuais sem travamentos. |
| **[`NEED-007`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-007-acerto-de-contas-familiar.md)** | **Acerto de Contas Familiar (Split)** | **AP2** | Balanço de despesas comuns entre membros com cálculo automático da transferência de compensação. |
| **[`NEED-008`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-008-desdobramento-de-despesas.md)** | **Desdobramento de Despesa Única** | **AP2** | Rateio de compras de supermercado/farmácia em múltiplas categorias e múltiplos membros responsáveis. |
| **[`NEED-009`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-009-caixinhas-e-saldo-livre.md)** | **Caixinhas & Foco no Saldo Livre** | **AP2** | Caixinhas no detalhe da conta e exibição estrita do saldo livre para gastar na tela principal. |
| **[`NEED-010`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-010-conciliacao-e-auditoria-de-ajustes.md)** | **Conciliação Rápida & Auditoria** | **AP2** | Ajuste rápido digitando o saldo real do banco com indicador de auditoria de desvios acumulados. |
| **[`NEED-011`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-011-termometro-de-liquidez-imediata.md)** | **Termômetro de Liquidez (7 Dias)** | **AP2** | Previsão de contas a vencer nos próximos 7 dias vs saldo livre para blindagem contra cheque especial. |

---

## 📌 Relação com Outros Agentes
- **Product Owner (PO):** Utiliza este panorama e os arquivos `NEED-001` a `NEED-012` para construir os fluxos (`flows/`) e o backlog de histórias BDD (`backlog/`).
- **Tech Lead:** Avalia a viabilidade dos requisitos, modela as entidades e gera os contratos de engenharia (`sdd/`).
