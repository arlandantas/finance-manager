# US-086 — Espaçamento compacto e consistente nos formulários

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 5,0 (V5/U3/R2) · **2** |
| Status | **Reestimada pelo TL: 3 pts (era 2), sem SDD** (2026-10-26): [notas técnicas](../../../tech-lead/architecture/notas-polimento-us-085-088.md) — a meta 375x667 exige rodapé fixo e tiles menores, além dos tokens; slot de erro da US-039 mantido; **PO confirma se "data" fica em "Mais detalhes"**; aprovada para Dev |
| Depende de | — |
| Corte | 2º a cortar das quatro do polimento |
| Rastreabilidade | **NEED-034** item 2 (RN-034.1, 034.5) · NEED-022 (lançar em < 10 s) · FLUXO-001, FLUXO-010 · D-PO-100 |

## História
Como **membro da família que lança no celular**, quero **formulários mais compactos, com espaço uniforme entre os campos**, para **ver mais campos de uma vez e lançar mais rápido**.

## Regras
- Define-se **um único espaçamento vertical entre campos** (token de design) e **um único** entre grupos, aplicado a **todos** os formulários e drawers: nova conta, novo cartão, lançar despesa/receita, transferência, prevista, série, categoria, família/convite, perfil. Hoje o espaço é excessivo (achado do uso real, "nova conta"); o novo é **menor, nunca menor que o alvo de toque (≥ 44 px por controle)**.
- Rótulo acima do campo, mensagem de erro logo abaixo sem deslocar os demais campos além da própria altura.
- Meta de aferição: o formulário "Nova despesa" com os campos principais (valor, descrição, categoria, conta/cartão, data) cabe **sem rolagem em 375 × 667 px**, com o teclado fechado.
- Com teclado aberto, o campo com foco permanece visível e o botão de salvar continua alcançável (sem ficar escondido).
- Não muda campos, ordem, validações nem regras; sem regressão de BDD.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Espaçamento compacto nos formulários

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada
    E a tela tem 375 por 667 pixels

  Cenário: Nova despesa sem rolagem
    Quando Mariana abre "Nova despesa"
    Então os campos valor, descrição, categoria, conta e data aparecem sem rolagem

  Cenário: Nova conta com espaço uniforme
    Quando Mariana abre "Nova conta"
    Então o espaço entre os campos é o mesmo do formulário de lançamento

  Cenário: Alvos de toque preservados
    Quando Mariana abre qualquer formulário
    Então cada controle de entrada e botão tem pelo menos 44 pixels de altura

  Cenário: Erro de validação não desloca os campos acima
    Dado que Mariana deixa o valor vazio
    Quando Mariana toca em "Salvar"
    Então a mensagem aparece logo abaixo do campo
    E os campos acima não mudam de posição

  Cenário: Campo com foco visível com o teclado aberto
    Dado que o teclado está aberto
    Quando Mariana toca no campo "Descrição"
    Então o campo e o botão "Salvar" continuam alcançáveis
```

## Fora de escopo
Redesenho de telas; novos campos; modo "denso" configurável pelo usuário.
