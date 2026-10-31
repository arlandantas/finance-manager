# US-085 — Seleção despesa x receita inequívoca em todo formulário

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 6,0 (V5/U4/R3) · **2** |
| Status | **Estimativa confirmada pelo TL (2 pts), sem SDD** (2026-10-26): [notas técnicas](../../../tech-lead/architecture/notas-polimento-us-085-088.md) — `SegmentedChoice` genérico (radio/tabs); atualizar 3 passos E2E da US-006; aprovada para Dev |
| Depende de | — (pode andar em paralelo com a US-060) |
| Corte | 3º a cortar das quatro do polimento (antes: US-088; depois: US-086) |
| Rastreabilidade | **NEED-034** item 1 (RN-034.1, 034.2, 034.5) · NEED-017 (cor nunca é o único sinal) · NEED-022 · FLUXO-001, FLUXO-019 · D-PO-100 |

## História
Como **membro da família**, quero **ver de relance se estou lançando uma despesa ou uma receita**, para **não registrar ou criar categoria do tipo errado**.

## Regras
- **Um componente único** de seleção de tipo (Despesa | Receita) usado em **todo** lugar onde o tipo é escolhido: nova despesa/receita (drawer e FAB), gestão de categorias, nova prevista e, quando existirem, receita prevista (US-051) e a porta unificada (US-090). Mesma densidade e mesmo destaque em qualquer tela (RN-034.1).
- Controle segmentado com **dois botões de largura igual**, o selecionado **preenchido** (cor + **ícone + texto**, ex.: seta para baixo "Despesa", seta para cima "Receita"); o não selecionado em contorno. Cor nunca é o único sinal (daltonismo) e o contraste cumpre WCAG AA nos dois temas.
- O título e o rótulo do botão de salvar mudam com o tipo ("Salvar despesa" / "Salvar receita"), reforçando o efeito.
- Alvo de toque ≥ 44 px; teclado: setas alternam, Enter confirma; leitor de tela lê "Despesa, selecionado".
- Não muda regra de negócio nem o padrão de tipo (despesa por padrão); sem regressão de BDD.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Seleção despesa x receita inequívoca

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada

  Cenário: Tipo selecionado é claro de relance no lançamento
    Quando Mariana abre "Nova despesa"
    Então "Despesa" aparece selecionado com ícone e texto
    E "Receita" aparece não selecionado

  Cenário: Trocar o tipo muda o título e o botão
    Dado que Mariana abre "Nova despesa"
    Quando Mariana seleciona "Receita"
    Então o título é "Nova receita"
    E o botão de salvar é "Salvar receita"

  Cenário: O mesmo seletor na gestão de categorias
    Quando Mariana abre "Nova categoria"
    Então o seletor "Despesa | Receita" tem o mesmo destaque do lançamento

  Cenário: Não depende só de cor
    Dado que o tema é escuro
    Quando Mariana abre "Nova despesa"
    Então o tipo selecionado se distingue pelo ícone e pelo texto além da cor

  Cenário: Navegação por teclado
    Dado que o foco está no seletor de tipo
    Quando Mariana pressiona a seta para a direita
    Então "Receita" fica selecionada
```

## Fora de escopo
Mudar o tipo padrão; permitir trocar o tipo de um lançamento já salvo (regra de edição inalterada).
