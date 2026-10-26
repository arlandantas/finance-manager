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

## 🗺️ Matriz Consolidada de Necessidades (NEED-001 a NEED-034)

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

| **[`NEED-013`](NEED-013-tags-livres.md)** | **Tags Livres nas Transações** | **R3** (Should) | Rótulos livres complementares às categorias para análises transversais (viagem, reforma). |
| **[`NEED-014`](NEED-014-ocultar-valores-na-tela.md)** | **Ocultar Valores na Tela** | **R2.1** (Must) | Usar o app em público sem expor saldos. |
| **[`NEED-015`](NEED-015-resumo-do-mes-na-home.md)** | **Resumo do Mês na Início** | **R2.1** (Must) | A Início responde "como está o mês?"; saldos viram card recolhível. |
| **[`NEED-016`](NEED-016-visoes-sinteticas-filtraveis.md)** | **Visões Sintéticas com Filtros** | **R3** (Should) | Totais por categoria/tag/membro/conta em qualquer período. |
| **[`NEED-017`](NEED-017-identificacao-visual-por-cor.md)** | **Cor por Conta/Cartão** | **R3** (Could) | Reconhecer a origem das movimentações de relance. |
| **[`NEED-018`](NEED-018-divisao-opcional-e-por-lancamento.md)** | **Divisão Opcional e por Lançamento** | **R2.1** (Must) / **R3** (Should) | Dividir só o que é comum e decidir como no lançamento; resolve o rótulo enganoso do acerto. |
| **[`NEED-019`](NEED-019-acerto-de-contas-opcional.md)** | **Acerto de Contas Opcional e Discreto** | **R2.1** (Must) | Família escolhe usar o acerto; nada de "fulano deve" em destaque. |
| **[`NEED-020`](NEED-020-ciclo-de-vida-de-contas-familia-e-membros.md)** | **Gerenciar Contas, Família e Membros** | **R2.1** (Must/Should) | Editar nome, remover/arquivar conta, remover membro, sair. |
| **[`NEED-021`](NEED-021-grupos-e-multiplos-grupos.md)** | **Grupos e Múltiplos Grupos** | **Futuro** | Grupos não familiares / pessoa em vários grupos / contas privadas. Só spike de modelo em R3. |
| **[`NEED-022`](NEED-022-preferencias-de-uso-e-ergonomia.md)** | **Preferências e Ergonomia** | **R2.1** | Descrição visível, detalhe da transação, tema, navegação no desktop. |
| **[`NEED-023`](NEED-023-assistente-de-ia-para-organizacao.md)** | **Assistente de IA** | **Futuro** | Guarda-chuva de privacidade e princípios de IA; a análise concreta está no NEED-027 (atualizado em 2026-10-24). |
| **[`NEED-024`](NEED-024-parcelas-ja-pagas-na-entrada.md)** | **Parcelas Já Pagas na Entrada** | **Proposta: próxima entrega** (Alta) | Lançar compra parcelada com parcelas já pagas, para quem começa com parcelamentos em andamento (estende NEED-003). |
| **[`NEED-025`](NEED-025-acesso-por-llm-via-mcp.md)** | **Acesso por LLM via MCP** | **Proposta: pós-importação** (Média) | Ver e lançar registros conversando com a LLM do usuário, sem abrir a interface; começa só leitura. |
| **[`NEED-026`](NEED-026-importacao-de-fatura-por-arquivo.md)** | **Importar Fatura por Arquivo (LLM)** | **Proposta: após NEED-024** (Alta) | Arquivo da fatura validado e extraído por LLM, com revisão humana obrigatória e anti-duplicidade. Antecipa item do AP3. |
| **[`NEED-027`](NEED-027-analise-de-gastos-evitaveis-por-ia.md)** | **Análise de Gastos Evitáveis por IA** | **Proposta: depois da importação** (Média) | Sugestões de categorias e gastos evitáveis com base em educação financeira; concretiza o NEED-023. |

| **[`NEED-028`](NEED-028-membro-sem-conta-ativa-e-convite-posterior.md)** | **Membro sem Conta Ativa (Convite Posterior)** | **Aprovada: 5ª na ordem do usuário** (Should/Alta; depende de spike do TL) | Cadastrar o membro antes de ele entrar, atrelar contas e lançamentos e convidar depois; reabre Q-01/US-021. Q-U15..U17 respondidas (usuário, 2026-10-26). |
| **[`NEED-029`](NEED-029-assinatura-recorrente-no-cartao.md)** | **Assinatura Recorrente no Cartão** | **Aprovada: 6ª na ordem do usuário** (Should/Média-Alta) | Cobrança mensal sem fim no cartão; a recorrência atual só aceita conta. Q-U18/U19 respondidas (usuário, 2026-10-26). |
| **[`NEED-030`](NEED-030-transferencia-prevista-entre-contas.md)** | **Transferência Prevista entre Contas** | **Aprovada: 7ª na ordem do usuário** (Could→Should) | Prever movimento entre contas, neutro para totais, que afeta o saldo previsto; **pode repetir todo mês** (Q-U20, usuário, 2026-10-26). |
| **[`NEED-031`](NEED-031-previsao-na-mesma-porta-do-lancamento.md)** | **Previsão na Mesma Porta do Lançamento** | **Aprovada: 4ª na ordem do usuário** (Should/Alta) | Uma só interface para lançar real ou previsto (despesa e, depois, receita); "repetir todo mês" na mesma porta (Q-U21). |
| **[`NEED-032`](NEED-032-conta-que-paga-a-fatura-no-cartao.md)** | **Conta que Paga a Fatura** | **Aprovada: 3ª na ordem do usuário** (Should/Média-Alta) | Conta pagadora padrão (opcional) no cartão, só sugerida ao pagar, com aviso de vencimento (Q-U22/U23, usuário, 2026-10-26). |
| **[`NEED-033`](NEED-033-visao-sintetica-por-conta-em-contas-a-pagar.md)** | **Visão Sintética por Conta (Saldo Previsto)** | **Aprovada: 1ª na ordem do usuário** (Must/Alta) | Tabela por conta: saldo atual, previstas em aberto, saldo previsto (inclui "Só meu" de outro membro, Q-U24); é a US-060 refinada. |
| **[`NEED-034`](NEED-034-polimento-de-ux-formularios-selecoes-e-extrato.md)** | **Polimento de UX Agregado** | **Aprovada: 2ª na ordem do usuário** (Should) | Destaque despesa/receita, espaçamento de formulários, alinhamento do extrato, "ver compra" no card. |


**Ordem de prioridade dos NEED-028..034 (decisão do usuário, 2026-10-26):** 1) NEED-033, 2) NEED-034, 3) NEED-032, 4) NEED-031, 5) NEED-028, 6) NEED-029, 7) NEED-030. Q-U15..Q-U24 respondidas (usuário, 2026-10-26): todas as hipóteses do Stakeholder aprovadas, **exceto Q-U20** (a transferência prevista pode ter recorrência mensal).

---

## 📌 Relação com Outros Agentes
- **Product Owner (PO):** Utiliza este panorama e os arquivos `NEED-001` a `NEED-034` para construir os fluxos (`flows/`) e o backlog de histórias BDD (`backlog/`).
- **Tech Lead:** Avalia a viabilidade dos requisitos, modela as entidades e gera os contratos de engenharia (`sdd/`).
