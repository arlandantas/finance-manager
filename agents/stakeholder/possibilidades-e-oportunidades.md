# Possibilidades e Oportunidades de Negócio - Stakeholder

Este documento compila ideias, cenários de uso reais e oportunidades de expansão de produto identificadas pelo **Stakeholder**, servindo de insumo para o **Product Owner (PO)** analisar e priorizar.

---

## 📌 Status das Oportunidades Mapeadas

| Oportunidade / Recurso | Status Atual | Destino no Projeto |
| :--- | :--- | :--- |
| **1. Recorrência Automática de Despesas** | ✅ Aprovado como Requisito | Integrado a [`NEED-004`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-004-despesas-previstas-e-recorrentes.md) |
| **2. Cartões de Crédito Autônomos & Fatura** | ✅ Aprovado como Requisito | Integrado a [`NEED-003`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-003-cartoes-de-credito-e-parcelamentos.md) |
| **3. Matriz de Tripla Responsabilidade** | ✅ Aprovado como Requisito | Integrado a [`NEED-001`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-001-membros-e-responsaveis.md) |
| **4. Compras Parceladas no Cartão (10x, etc.)** | ✅ Aprovado como Requisito | Integrado a [`NEED-003`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-003-cartoes-de-credito-e-parcelamentos.md) |
| **5. Tetos Dinâmicos & Auto-Clonagem Mensal** | ⭐ Aprovado (Primordial) | Integrado a [`NEED-005`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-005-ciclo-e-tetos-orcamentarios.md) |
| **6. Painel de Disponibilidade por Categoria** | ⭐ Aprovado (Primordial) | Integrado a [`NEED-006`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-006-disponibilidade-e-relatorios.md) |
| **7. Acerto de Contas Familiar (Split)** | ✅ Aprovado como Requisito | Integrado a [`NEED-007`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-007-acerto-de-contas-familiar.md) |
| **8. Desdobramento de Despesa Única** | ✅ Aprovado como Requisito | Integrado a [`NEED-008`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-008-desdobramento-de-despesas.md) |
| **9. Caixinhas Protegidas & Saldo Livre** | ✅ Aprovado como Requisito | Integrado a [`NEED-009`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-009-caixinhas-e-saldo-livre.md) |
| **10. Conciliação Rápida & Auditoria de Desvios**| ✅ Aprovado como Requisito | Integrado a [`NEED-010`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-010-conciliacao-e-auditoria-de-ajustes.md) |
| **11. Termômetro de Liquidez Imediata (7 Dias)** | ✅ Aprovado como Requisito | Integrado a [`NEED-011`](file:///home/arlan/ai-tests/finance-manager/agents/stakeholder/needs/NEED-011-termometro-de-liquidez-imediata.md) |
| **12. Importação de Extratos (OFX / CSV)** | 📌 To-Do Prioritário | Mapeado no Roadmap Fase 2 |
| **13. Notificações / Alertas via WhatsApp/Telegram** | 💡 Backlog de Ideias | Detalhado na Seção 1 abaixo |
| **14. Metas com Barra de Progresso e Prazo** | 💡 Backlog de Ideias | Detalhado na Seção 2 abaixo |
| **15. Assistente de IA para analisar o mês** | 🔮 Futuro (pós-v0) | [`NEED-023`](needs/NEED-023-assistente-de-ia-para-organizacao.md), Seção 4 |
| **16. Grupos não familiares / múltiplos grupos / contas privadas** | 🔮 Futuro | [`NEED-021`](needs/NEED-021-grupos-e-multiplos-grupos.md), Seção 5 |
| **17. Sugestão de categoria por histórico (determinística)** | 💡 Ideia, pós-tags | Seção 4 |
| **18. Construtor de relatórios configuráveis** | ❌ Não agora | Seção 6 |

---

## 1. Notificações e Lembretes de Vencimento (Fase 3)
- **Dor Identificada:** Em meio à correria, os membros podem não abrir o sistema todos os dias e esquecer contas na véspera.
- **Oportunidade Futura:** Notificação direta no WhatsApp ou Telegram avisando sobre boletos a vencer e resumo matinal do saldo livre.

---

## 2. Metas com Prazo e Acompanhamento de Caixinhas (Fase 3)
- **Dor Identificada:** Juntar dinheiro em uma caixinha sem meta clara de prazo pode desestimular a família.
- **Oportunidade Futura:** Definir meta final (ex: "Viagem de Férias: R$ 8.000 até Dezembro") com barra de progresso e cálculo de aporte mensal sugerido.

---

## 3. Importação de Extratos Bancários (OFX / CSV - Fase 2)
- **Dor Identificada:** Para famílias com alto volume de compras no cartão, a alimentação manual pode gerar cansaço a longo prazo.
- **Oportunidade Prioritária:** Upload de extratos `.ofx` e `.csv` conciliando automaticamente os lançamentos já existentes e sugerindo novos lançamentos para confirmação rápida pelo usuário.

---

## 4. Assistente de IA generativa para analisar o mês (Futuro, pós-v0)
- **Dor:** ao fechar o mês, a família quer entender o que mudou e organizar categorias/tags sem esforço.
- **Pré-condições:** v0 em produção com 2-3 fechamentos reais; categorias e tags estáveis; visões sintéticas como fonte dos números (a IA explica, não calcula); ADR de privacidade.
- **Riscos:** vazamento de dados financeiros e de terceiros (LGPD), respostas plausíveis porém erradas, custo, sensação de vigilância no casal.
- **Regras:** opt-in por família, desligado por padrão; enviar agregados, nunca descrições livres; só sugerir; sem aconselhamento financeiro; mostrar o que foi enviado.
- **Passo intermediário:** **sugestão de categoria** por descrições já usadas (sem IA generativa, sem risco de privacidade).
- **Decisão que fica com o usuário:** Q-U01 (envio de agregados a provedor externo).

## 5. Grupos não familiares, múltiplos grupos e contas privadas (Futuro)
- Três necessidades distintas (pessoa em vários grupos, visibilidade restrita, grupos de amigos/república). **Não construir agora.**
- Candidata mais provável: **conta privada dentro da família** (reavalia D-PO-02/US-020). Só com pedido real.
- Ação imediata barata: **spike do Tech Lead na R3** sobre o modelo usuário↔grupo (N:N).

## 6. O que não vale fazer agora
Construtor de relatórios, hierarquia/cor/orçamento de tags, menu inferior sofisticado no desktop, exclusão da família inteira.
