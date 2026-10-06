# Histórico de Alinhamentos com o Stakeholder

Este documento registra os alinhamentos estratégicos, solicitações e refinamentos discutidos com o time/usuário.

---

## [2026-10-03] - Alinhamento Inicial: Definição do Escopo do Projeto

### Participantes
- **Usuário / Product Owner / Arquiteto**
- **Agente Stakeholder**

### Pauta
Definição do escopo inicial da aplicação de gestão financeira familiar e organização do repositório de requisitos.

### Resumo das Decisões e Necessidades
1. **Foco do Projeto:**
   - Gestão Financeira Familiar.
2. **Organização da Documentação:**
   - Criação da pasta `agents/stakeholder` para abrigar a documentação de negócio, visões e requisitos levantados.
3. **Mapeamento de Entidades e Recursos:**
   - Cadastro de **Contas Bancárias** com identificação expressa dos seus respectivos **Owners** (titulares/membros da família).
   - Movimentações de **Entradas e Saídas** em cada conta bancária.
   - Suporte a **Transferências entre contas bancárias** da família.
   - Planejamento de **Gastos/Despesas Previstas** com acompanhamento dos estados **Previsto** ou **Pago**.
   - Emissão de pagamentos e liquidação de saídas diversas.
4. **Requisitos de Visibilidade e Relatórios:**
   - **Visões Sintéticas:**
     - Consolidado por conta;
     - Consolidado por tipo de transação (entradas, saídas, transferências);
     - Consolidado por estado (previsto vs pago).
   - **Visões Detalhadas:**
     - Extrato e movimentações analíticas por mês, por conta, com filtros e histórico completo.

### Ações Imediatas
- [x] Estruturação da pasta `agents/stakeholder`.
- [x] Elaboração do `README.md`, `visao-geral.md` e `requisitos-negocio.md`.
- [x] Definição de fronteiras claras de atuação do Stakeholder vs PO vs Arquiteto.

---

## [2026-10-03] - Alinhamento: Fronteiras de Atuação e Papel do Stakeholder

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Pauta
Delimitação do papel do Stakeholder no ecossistema multiagente.

### Resumo das Diretrizes
1. **Foco Estrito de Negócio:**
   - O Stakeholder não define nem opina sobre arquitetura, stack de desenvolvimento, linguagens, infraestrutura ou modelagem técnica de banco de dados (responsabilidade do **Arquiteto**).
   - O Stakeholder não redige histórias de usuário detalhadas ou critérios de aceitação refinados (responsabilidade do **Product Owner**).
2. **Missão Central do Stakeholder:**
   - Atuar como a voz do negócio, levantando dores, necessidades essenciais, oportunidades de expansão, regras de negócio e cenários do cotidiano familiar.
   - Prover a visão estratégica do produto que alimentará o trabalho do PO e do Arquiteto.
3. **Novas entregas documentais:**
   - Criação de [possibilidades-e-oportunidades.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/possibilidades-e-oportunidades.md) com ideias complementares de negócio (recorrência, cartão de crédito, orçamentos, rateio familiar e caixinhas/metas).

---

## [2026-10-03] - Alinhamento: Divisão Familiar, Cartões de Crédito e Recorrência

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Decisões e Necessidades Consolidadas
1. **Divisão de Gastos e Responsabilidade:**
   - Toda movimentação (débito, crédito, despesa no cartão) deve registrar obrigatoriamente qual membro da família a realizou.
   - Visão sintetizada e analítica para comparar quem gastou o quê no mês.
2. **Entidade Cartão de Crédito:**
   - Tratado como entidade autônoma (não é conta bancária).
   - Possui titular principal, limite, dia de fechamento e dia de vencimento.
   - Despesas no cartão abatem do limite e compõem a fatura, sem afetar saldo bancário imediato.
   - O pagamento da fatura gera a saída na conta bancária.
3. **Compartilhamento de Recursos:**
   - Contas bancárias e cartões de crédito podem ser compartilhados entre os membros do grupo familiar para lançamentos e acompanhamento.
4. **Despesas Recorrentes:**
   - Suporte nativo a despesas com repetição periódica (ex: mensalidades, contas de consumo).

### Entregas
- [x] Atualização de [requisitos-negocio.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/requisitos-negocio.md) com novo diagrama ER, requisitos RF01 a RF21 e regras RN01 a RN05.

---

## [2026-10-03] - Alinhamento: Tetos Orçamentários, Parcelamentos e Papéis de Responsabilidade

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Decisões e Necessidades Consolidadas
1. **Tetos Orçamentários (Prioridade Primordial):**
   - Existência de limites mensais por categoria.
   - Ponto de destaque visual no sistema, com transparência para todos os membros saberem o teto, o valor gasto e o saldo disponível.
2. **Compras Parceladas no Cartão (Fundamental):**
   - Cadastro de compras com número de parcelas (ex: 1/10).
   - O sistema gera automaticamente as parcelas projetadas para as faturas dos meses subsequentes.
3. **Evolução da Alimentação de Dados:**
   - MVP: Foco 100% em lançamentos manuais rápidos e intuitivos.
   - To-do Futuro (Prioritário): Importação de extratos e faturas em arquivos OFX e CSV.
4. **Matriz de Responsabilidade Tripla:**
   - `Autor do Cadastro`: Quem registrou no sistema (preenchido automaticamente).
   - `Responsável pelo Gasto`: Membro que realizou o gasto / foi o beneficiário.
   - `Responsável pelo Pagamento`: Para despesas futuras/previstas, quem ficou encarregado de efetuar a liquidação.

### Entregas
- [x] Atualização do diagrama ER e dos requisitos funcionais (RF01 a RF25) em [requisitos-negocio.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/requisitos-negocio.md).
- [x] Atualização da matriz de oportunidades em [possibilidades-e-oportunidades.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/possibilidades-e-oportunidades.md).

---

## [2026-10-03] - Alinhamento: Ciclo Orçamentário, Tetos Mensais Dinâmicos e Autocontrole

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Decisões e Necessidades Consolidadas
1. **Ciclo Orçamentário Customizável:**
   - O dia de fechamento/corte do ciclo mensal é configurável pela família (ex: dia 05, dia 01, etc.).
2. **Tetos Orçamentários Dinâmicos por Mês:**
   - O teto de uma categoria não é estático. Cada mês pode ter valores diferentes conforme os focos e sazonalidades familiares.
   - Histórico preservado para comparar o orçado vs realizado ao longo dos meses.
3. **Visão Central Focada em "Saldo Disponível por Categoria":**
   - O painel principal orienta o usuário no dia a dia destacando quanto ainda resta para gastar em cada categoria antes de atingir o teto.
4. **Alerta Estritamente Visual (Autocontrole):**
   - Sem bloqueios rígidos. O sistema sinaliza visualmente (cores/termômetro), deixando o controle e responsabilidade nas mãos dos membros.

### Entregas
- [x] Atualização de [requisitos-negocio.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/requisitos-negocio.md) com novo diagrama ER (entidade `MONTHLY_CATEGORY_BUDGET`), requisitos RF01 a RF27 e regras RN01 a RN07.
- [x] Atualização de [visao-geral.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/visao-geral.md) para destacar o princípio de autocontrole orçamentário.

---

## [2026-10-03] - Reorganização Estrutural dos Artefatos do Stakeholder

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Pauta
Reestruturação e organização da pasta `agents/stakeholder` para máxima clareza, alinhando à governança do projeto (`AGENTS.md`).

### Decisões e Entregas
1. **Criação da subpasta `needs/`:**
   - Criação de artefatos modulares com padrão de rastreabilidade formal `NEED-XXX` para que o Product Owner gere histórias (`US-XXX`) e o Arquiteto gere decisões (`ADR-XXX`):
     - [`NEED-001`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-001-membros-e-responsaveis.md): Membros e Tripla Responsabilidade (autor, gastador, pagador).
     - [`NEED-002`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-002-contas-bancarias-e-compartilhamento.md): Contas Bancárias e Compartilhamento.
     - [`NEED-003`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-003-cartoes-de-credito-e-parcelamentos.md): Cartões de Crédito e Compras Parceladas.
     - [`NEED-004`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-004-despesas-previstas-e-recorrentes.md): Despesas Previstas, Recorrentes e Quitação.
     - [`NEED-005`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-005-ciclo-e-tetos-orcamentarios.md): Ciclo Orçamentário e Tetos Flexíveis por Mês.
     - [`NEED-006`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-006-disponibilidade-e-relatorios.md): Painel de Disponibilidade por Categoria e Relatórios.
2. **Índice Central de Necessidades:**
   - Criação de [`needs/README.md`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/README.md) com tabela consolidada e diagrama ER.
3. **Guia de Operações do Stakeholder:**
   - Atualização do [`README.md`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/README.md) principal com navegação orientada a perfis (PO, Arquiteto e Gestor).

---

## [2026-10-03] - Alinhamento: Aprovação de Melhorias e Refinamentos de Negócio

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Pauta
Apresentação, debate e validação de 6 sugestões estratégicas de produto para gestão financeira familiar.

### Deliberações e Decisões
1. **Acerto de Contas Familiar (Split) - Aprovado:**
   - Cálculo automático do balanço de despesas comuns entre os membros, indicando o valor líquido de compensação ("quem transfere quanto para quem").
   - Formalizado em [`NEED-007`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-007-acerto-de-contas-familiar.md).
2. **Desdobramento de Despesa Única (Split de Compra) - Aprovado:**
   - Possibilidade de desdobrar uma compra única em múltiplos subitens com categorias e responsáveis pelo gasto distintos.
   - Formalizado em [`NEED-008`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-008-desdobramento-de-despesas.md).
3. **Caixinhas / Reservas e Foco no Saldo Livre - Aprovado com Ajuste do Usuário:**
   - Na **Home/Tela Principal**, exibir **estritamente o valor "Livre para Gastar"** de cada conta.
   - As caixinhas são visíveis apenas na tela de detalhe da conta.
   - Permitir transferências internas entre a conta bancária e suas caixinhas como contas separadas.
   - Formalizado em [`NEED-009`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-009-caixinhas-e-saldo-livre.md).
4. **Auto-Clonagem do Orçamento Mensal - Aprovado com Ajuste do Usuário:**
   - O sistema copia automaticamente os tetos do mês anterior para o novo mês, eliminando a fadiga de recadastro e permitindo apenas edições pontuais.
   - Atualizado em [`NEED-005`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-005-ciclo-e-tetos-orcamentarios.md).
5. **Conciliação Rápida e Auditoria de Desvios - Aprovado com Ajuste do Usuário:**
   - Ajuste rápido digitando o saldo real do banco, gerando transação de ajuste.
   - Indicador visível de auditoria acumulada por conta para monitorar e prevenir gastos não lançados.
   - Formalizado em [`NEED-010`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-010-conciliacao-e-auditoria-de-ajustes.md).
6. **Termômetro de Liquidez Imediata (7 Dias) - Aprovado:**
   - Card de alerta no topo do painel monitorando despesas dos próximos 7 dias vs saldo livre disponível para evitar cheque especial ou descasamento de datas.
   - Formalizado em [`NEED-011`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-011-termometro-de-liquidez-imediata.md).

### Entregas
- [x] Criação de `NEED-007`, `NEED-008`, `NEED-009`, `NEED-010` e `NEED-011` em `agents/stakeholder/needs/`.
- [x] Atualização de `NEED-005` com cópia automática de orçamento.
- [x] Atualização do catálogo `needs/README.md` e do portal `stakeholder/README.md`.
- [x] Atualização da matriz de oportunidades em `possibilidades-e-oportunidades.md`.

---

## [2026-10-03] - Alinhamento: Cronograma de Releases e Priorização Estratégica (Roadmap)

### Participantes
- **Usuário**
- **Agente Stakeholder**

### Pauta
Definição da esteira de prioridades e faseamento das entregas em releases (**AP0/MVP**, **AP1**, **AP2** e **AP3**) para orientar o time de produto (PO) e o Arquiteto.

### Estrutura do Cronograma
1. **Release AP0 (MVP - Fundação Operacional):**
   - Foco em viabilizar o primeiro registro real da família: membros, contas bancárias, transferências, cartões básicos e despesas previstas pontuais (`NEED-001`, `NEED-002`, `NEED-003` Fase 1, `NEED-004` Fase 1 e `NEED-006` extrato simples).
2. **Release AP1 (Orçamento & Autocontrole - Diferencial do Produto):**
   - Ciclo orçamentário configurável, tetos dinâmicos com auto-clonagem, compras parceladas no cartão (10x), contas recorrentes e Painel Central de Disponibilidade por Categoria (`NEED-005`, `NEED-006`, `NEED-003` parcelamentos, `NEED-004` recorrência).
3. **Release AP2 (Maturidade & Harmonia Familiar):**
   - Caixinhas de reserva com foco em saldo livre, acerto de contas familiar (split), desdobramento de compras mistas, conciliação com auditoria e termômetro de liquidez imediata (`NEED-007`, `NEED-008`, `NEED-009`, `NEED-010`, `NEED-011`).
4. **Release AP3 (Automação & Escala):**
   - Importação de arquivos OFX/CSV, notificações via WhatsApp/Telegram e metas de prazo para caixinhas.

### Entregas
- [x] Criação do documento oficial [cronograma-e-releases.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/cronograma-e-releases.md).
- [x] Mapeamento dos 15 Épicos direcionados ao Product Owner.
- [x] Atualização do portal [README.md](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/README.md).

---

## [2026-10-04] - Validação das Decisões do PO e do Gestor (D-PO-01..03, Q-01/03/08/13/17)

### Participantes
- **Agente Stakeholder**
- Insumos: `agents/product-owner/backlog/backlog.md`, `mvp-definition.md` e `agents/manager/decisoes-do-gestor.md` (D-GES-01..11)

### Pauta
Validar, como dono do problema, as decisões provisórias do PO (aprovadas pelo Gestor em D-GES-05) e as respostas do Gestor às perguntas abertas, sob a ótica de valor de negócio.

### Validações
| Item | Decisão | Parecer do Stakeholder | Justificativa de valor |
| :-- | :-- | :-: | :-- |
| **D-PO-01** | Um único campo "Quem pagou?" preenche responsável pelo gasto e pagador; `responsavel_pagamento` só nas previstas | ✅ Validada | Preserva a regra de responsabilidade (NEED-001) no cenário real do casal, em que quem gasta é quem paga, e protege a meta de lançar em menos de 10 s. A distinção volta nas previstas, onde ela de fato importa. |
| **D-PO-02** | Todos veem e lançam em todas as contas e cartões | ✅ Validada | Transparência total é o princípio do produto; permissões granulares (US-020) não são dor do MVP. Reavaliar se surgir uso com conta estritamente pessoal. |
| **D-PO-03** | Período = mês-calendário; ciclo com dia de corte no AP1 | ✅ Validada, com observação | Aceito para a R1, pois o acerto de contas é mensal. Observação: o ciclo configurável (NEED-005) é diferencial prioritário; o cálculo de período deve nascer como função de `cutDay` (padrão 1) para não gerar retrabalho. |
| **Q-01 / D-GES-06** | Dependentes sem login fora do MVP (US-021) | ✅ Aceita | Os dois responsáveis do casal cobrem a dor vital. Item futuro, não esquecido. |
| **Q-03 / D-GES-07** | Convite válido por 7 dias | ✅ Aceita | Prazo adequado à realidade do casal; sem impacto de negócio. |
| **Q-08 / D-GES-08** | Regra de divisão com vigência por data | ✅ Aceita, e a considero necessária | Mudar a regra não pode reescrever acertos de meses já quitados; seria fonte direta de nova discussão familiar. |
| **Q-13 / D-GES-03** | US-013 (corrigir/excluir) continua *Should*, dentro da R1, último a ser cortado | ✅ Aceita, com observação | Erros de lançamento são certos no cotidiano. Se o prazo apertar e a US-013 for cortada, a R1 só é homologável se houver contorno claro (ex.: lançamento de estorno). Peço aviso ao Gestor caso o corte ocorra. |
| **Q-17 / D-GES-04** | Pagar fatura como *Should* na R2 | ✅ Aceita, com observação | Compatível com o cronograma (cartão à vista no AP0). Do ponto de vista de negócio, sem pagar a fatura o ciclo do cartão fica incompleto; peço que permaneça na R2 e não escorregue para o AP1. |

### Objeções
Nenhuma objeção bloqueante. As observações acima (D-PO-03, Q-13, Q-17) são recomendações e não impedem o fluxo.

### Escopo e cronograma
- **D-GES-01 / D-GES-02:** de acordo com o fatiamento R1/R2 e com a antecipação do **NEED-007 (split) para o AP0** (ADR-006). Homologação de valor após a R1.
- Registro de que, no AP0, o acerto de contas cobre a dor vital; o desdobramento de compra (NEED-008) permanece no AP2.

### Entregas
- [x] Atualização de [`cronograma-e-releases.md`](cronograma-e-releases.md): NEED-007 no AP0/R1, fatiamento R1/R2, AP1..AP3 coerentes.
- [x] Esta entrada de validação.

---

## [2026-10-04] - Homologação de valor R1 + R2 (teste pelo navegador)

- **Participantes:** Agente Stakeholder (execução do teste como usuário real, desktop e mobile 375 px).
- **Resultado:** **Homologa com ressalvas**. Fluxo lançar → acerto → pagar fatura → baixar previstas funciona e é rápido (lançamento em ~4 toques); sem bloqueantes. Ressalvas importantes: rótulo da regra de divisão contradiz os números do acerto, dívida de mês anterior sem sinalização na Início e conta de origem padrão inadequada em pagamentos.
- **Posição Q-18..Q-22:** Q-18/Q-19/Q-21/Q-22 de acordo; Q-20 sensível (decisão do casal pelo Gestor).
- **Entrega:** [`homologacao-r1-r2.md`](homologacao-r1-r2.md). Dados criados no banco de demonstração listados no relatório.


---

## [2026-10-04] - Parecer sobre o feedback do usuário (16 sugestões) e ressalvas da homologação

- **Participantes:** Agente Stakeholder; Gestor do Projeto (decisões delegadas pelo usuário).
- **Pauta:** definir valor, prioridade, regras e riscos das 16 sugestões do usuário e das 4 ressalvas da homologação R1+R2, antes de seguir ao PO.
- **Decisões:**
  - Novas necessidades **NEED-013..NEED-023**; revisão de NEED-003 (parcelamento antecipado do AP1 para a R3), NEED-004 (conta de origem padrão), NEED-007 (ressalvas 1, 2, 4), NEED-009 (Home).
  - **R2.1:** ressalvas, descrição visível, Resumo do Mês, ocultar valores, acerto opcional, "dividir" desligado por padrão, arquivar conta, gestão de família e membros, detalhe da transação, tema. **R3:** parcelamento, percentual por lançamento, tags, visões sintéticas, cores, spike de grupos. **Futuro:** IA e grupos.
  - Conflitos resolvidos: acerto opcional sem perder o valor do AP0; percentual gravado por lançamento preserva Q-08; NEED-009 ajustado ao Resumo do Mês; D-PO-02 não reaberta.
  - O usuário delegou as decisões ao time: **Q-F01..Q-F14 decididas** com hipótese conservadora; permanecem com o usuário apenas Q-U01 (IA/provedor externo) e Q-U02 (exclusão da família).
- **Entrega:** [`parecer-feedback-usuario.md`](parecer-feedback-usuario.md) (tabela de prioridades, decisões e pacote de handover ao PO).


---

## [2026-10-05] - Homologação de valor R2.1 (+ parcelamento R3-A) pelo navegador

- **Participantes:** Agente Stakeholder (teste como usuário real: Mariana e Lucas, painel embutido, mobile 375 px e desktop 1280 px).
- **Resultado:** **Homologa com ressalvas**. As 4 ressalvas importantes da homologação R1+R2 foram **resolvidas** (rótulo da regra, dívida de mês anterior, conta de origem padrão, prévia de impacto/sugestão pela renda); Resumo do Mês, ocultar valores, acerto opcional, "Só meu" por padrão, arquivamento, gestão de família e tema funcionam como pedido, e os números conferem. Sem bloqueantes.
- **Ressalva remanescente (I):** compra parcelada não pode ser dividida ("Disponível em breve") e fica "Pessoal", portanto fora do acerto até a US-042; pedido de aviso mais visível ao casal.
- **Posição:** manter a US-042 (parcela dividida por parcela no mês da fatura, Q-F05) como a próxima prioridade após a janela de reversão, antes de tags e visões.
- **Entrega:** [`homologacao-r21.md`](homologacao-r21.md) (dados de teste criados listados no relatório).

---

## [2026-10-05] - Escopo da v0 (primeiro alpha tester em producao)

- **Participantes:** Agente Stakeholder, em parceria com o Gestor (decisoes delegadas pelo usuario).
- **Resultado:** v0 definida; 6 itens Must (bugs de modal e contraste, aviso do parcelado, conta fora do saldo, despesa recorrente mensal com conta de pagamento, faturas no A pagar, Inicio enxuta com filtros colapsados); 5 Should; pos-v0: transferencia agendada, US-053. Recorrente confirmado como inexistente no codigo.
- **Producao:** bloqueantes = hospedagem, Postgres com backup, Google OAuth de producao, segredos e login de teste desligado; SMTP e Sentry fora da v0.
- **Entrega:** [`escopo-v0-alpha.md`](escopo-v0-alpha.md).
