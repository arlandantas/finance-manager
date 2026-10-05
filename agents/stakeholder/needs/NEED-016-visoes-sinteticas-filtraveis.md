# NEED-016: Visões Sintéticas com Filtros (Período, Contas, Categorias, Tags)

## 📋 Metadados
- **ID:** `NEED-016`
- **Área:** Análise e Relatórios
- **Status:** Proposto pelo Stakeholder (feedback do usuário, 2026-10-04) — decidido pelo time (Stakeholder + Gestor); usuário delegou as decisões
- **Prioridade de valor:** **Should** · Release **R3** (depois de tags, NEED-013)
- **Consumidores:** Product Owner (`US`/`FLUXO`), Tech Lead (`SDD`)
- **Origem:** Sugestão 7 do usuário. Detalha RF22/RF23 de `requisitos-negocio.md`; relacionada a NEED-006 (AP1) e NEED-013

---

## 1. Contexto e Dor de Negócio
O Extrato lista lançamentos, mas não responde "para onde foi o dinheiro?". Para organizar o orçamento a família precisa de **totais agrupados**: por categoria, por tag, por membro, por conta/cartão, e de **recortar** por período e por essas mesmas dimensões.

## 2. Necessidade
1. Escolher um **período** (mês atual, mês anterior, intervalo livre) e **filtros combináveis**: contas/cartões, categorias, tags, membros.
2. A tela se ajusta e mostra: **total de receitas, despesas e resultado**; **quebra por categoria** (e por tag, por membro, por conta quando escolhido) com participação percentual; evolução diária/mensal simples.
3. Cada número é **clicável** e leva ao Extrato com o mesmo filtro (drill-down).

## 3. Regras de Negócio (RN)
- **RN-016.1:** **Fonte única de números**: a visão sintética e o Extrato usam o mesmo critério de soma (mesmas exclusões: pagamento de fatura, transferência e acerto não são despesa).
- **RN-016.2:** Compra parcelada conta por parcela, no mês em que cai na fatura (NEED-003).
- **RN-016.3:** Lançamento excluído nunca entra; lançamento com várias tags entra em cada tag selecionada (a soma das tags **pode exceder** o total; a tela deve avisar).
- **RN-016.4:** Respeita "ocultar valores" (NEED-014).
- **RN-016.5:** Escopo inicial **fechado**: um conjunto pequeno de quebras pré-definidas guiadas pelos filtros. **Não** é construtor de relatórios/painéis configuráveis.

## 4. O que NÃO fazer agora
Gráficos customizáveis, exportação, comparativos multi-período avançados e previsões. Começar por totais + quebra por categoria/tag + drill-down.

## 5. Decisões sobre pontos em aberto
- **Q-F10 (decidida):** quebras iniciais por categoria, membro, conta/cartão e tag, com drill-down ao Extrato.
