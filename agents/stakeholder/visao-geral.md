# Visão Geral do Produto - Stakeholder

## 1. Contexto de Negócio
No contexto da **Gestão Financeira Familiar**, a tomada de decisão muitas vezes é prejudicada pela dispersão das informações entre membros da família (cônjuges, filhos, dependentes), contas bancárias e cartões de crédito.

A principal dor não é apenas saber "quanto dinheiro tem no banco", mas sim responder com clareza: **"Quanto ainda podemos gastar este mês em cada área da nossa vida sem estourar o orçamento?"**.

---

## 2. Proposta de Valor & Filosofia do Produto
- **Autonomia & Responsabilidade Consciente:** O sistema não bloqueia operações arbitrariamente; ele empodera os membros da família através de **alertas visuais claros** e transparência sobre o saldo restante disponível por categoria.
- **Flexibilidade Orçamentária Real:** A vida financeira familiar muda mês a mês (férias, volta às aulas, datas festivas). Os tetos de gastos não são estáticos: a família pode ajustá-los dinamicamente a cada ciclo, mantendo histórico para aprendizado.
- **Rastreabilidade Tripla sem Fricção:** Saber quem digitou, quem realizou o gasto e quem é encarregado de efetuar o pagamento.
- **Independência da Fatura do Cartão:** Gestão autônoma de cartões e compras parceladas sem comprometer a leitura do saldo bancário imediato.

---

## 3. Pilares Fundamentais do Sistema

```mermaid
graph TD
    A[Gestão Financeira Familiar] --> B[Membros & Governança]
    A --> C[Orçamento & Tetos Flexíveis]
    A --> D[Contas & Cartões de Crédito]
    A --> E[Painel de Disponibilidade]

    B --> B1[Tripla Responsabilidade: Autor, Gastador e Pagador]
    B --> B2[Compartilhamento Familiar de Recursos]

    C --> C1[Ciclo Orçamentário Customizado]
    C --> C2[Tetos Mensais Dinâmicos por Categoria]
    C --> C3[Histórico Comparativo: Orçado vs Realizado]

    D --> D1[Contas Bancárias com Saldo Real]
    D --> D2[Cartões com Parcelamento Automático]
    D --> D3[Despesas Previstas Recorrentes]

    E --> E1[Foco Primário: Saldo Disponível por Categoria]
    E --> E2[Alertas Visuais Não-Bloqueantes]
    E --> E3[Extrato Mensal Analítico Multidimensional]
```

---

## 4. Próximos Passos Estratégicos
1. Consumo deste material pelo **Product Owner (PO)** para decomposição em Épicos e Histórias de Usuário.
2. Análise pelo **Arquiteto** para desenhar o modelo de dados e a arquitetura técnica correspondente.
