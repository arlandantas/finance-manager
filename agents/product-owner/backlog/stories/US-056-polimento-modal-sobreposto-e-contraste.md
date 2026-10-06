# US-056 — Polimento: modal de confirmação sobreposto e contraste de estados nos dois temas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Polimento · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 3 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | — |
| Rastreabilidade | feedback-usuario-v0 U1 e U5 · escopo-v0-alpha (§2, decisão i) · NEED-014 |

## História
Como **membro da família**, quero **que confirmações apareçam sempre por cima do que as abriu e que todo estado de hover, foco e ativo seja legível no claro e no escuro**, para **usar o app no dia a dia sem texto invisível nem botões inalcançáveis**.

## Regras
- Diálogo aberto a partir de outro diálogo (ex.: "Excluir" dentro do detalhe do lançamento) **cobre** o diálogo de baixo: overlay e foco próprios; Esc/clique fora fecham só o de cima.
- Revisão **única** de contraste (WCAG AA, 4,5:1 para texto) dos estados **hover, foco visível, ativo/selecionado e desabilitado** nos dois temas; correção nos tokens, não bug a bug.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Polimento de diálogos e contraste

  Cenário: Confirmação cobre o detalhe
    Dado o detalhe de um lançamento aberto
    Quando Mariana toca em "Excluir"
    Então o diálogo de confirmação aparece acima do detalhe, com overlay próprio
    E o detalhe fica inerte atrás

  Cenário: Esc fecha só o diálogo de cima
    Dado a confirmação aberta sobre o detalhe
    Quando Mariana pressiona Esc
    Então a confirmação fecha
    E o detalhe continua aberto

  Cenário: Hover legível no tema escuro
    Dado o tema escuro
    Quando Mariana passa o mouse sobre um item de menu, botão ou linha de lista
    Então o texto tem contraste mínimo de 4,5:1 com o fundo do hover

  Cenário: Foco e ativo legíveis nos dois temas
    Dado o tema claro ou escuro
    Quando Mariana navega por teclado e seleciona um item
    Então o foco é visível e o item ativo mantém contraste mínimo de 4,5:1
```

## Checklist de componentes (cada item verificado em claro e escuro)
Botões (primário/secundário/perigo/ghost) · itens de menu e navegação · linhas de lista/extrato · selects e dropdowns · abas/chips de filtro · toggles · campos de texto · cards clicáveis · diálogos aninhados (detalhe ➔ confirmação; formulário ➔ confirmação; arquivar ➔ aviso).

## Fora de escopo
Redesenho visual, novos temas, modo de alto contraste dedicado.

## Para o Tech Lead
- Camada única de diálogos (z-index/portal/pilha de foco) para todos os diálogos; teste visual/axe nos dois temas.
