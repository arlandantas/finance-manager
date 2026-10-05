# US-050 — Cor por conta e cartão

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Could · 1,3 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-004, US-015, US-037 (tema, contraste nos dois temas) |
| Corte | **Cortável (primeiro dos Could da R3 depois da US-051)** |
| Rastreabilidade | Parecer item 11 · NEED-017 (RN-017.1..4) · FLUXO-014 · D-PO-30 |

## História
Como **membro da família**, quero **uma cor para cada conta e cartão**, para **reconhecer a origem do lançamento de relance**.

## Regras de negócio aplicáveis
- Paleta curta de **10 cores nomeadas** (ex.: Azul, Verde, Roxo, Laranja, Rosa, Turquesa, Vermelho, Amarelo, Cinza, Marrom) com contraste adequado **nos dois temas** (RN-017.2).
- **Atribuição automática** ao cadastrar: a primeira cor ainda não usada por conta/cartão da família; **editável** depois em "Editar conta/cartão" (RN-017.4: pode repetir cor; o sistema só **sugere** as não usadas).
- A cor aparece como **marcador (ponto/etiqueta) ao lado do nome** em Extrato, Home, seletores "Pagar com", faturas e cartões; **o nome nunca some** (RN-017.1).
- Cores são **por conta/cartão**, não por membro nem categoria (RN-017.3).
- Contas/cartões **existentes** recebem cor automática na primeira exibição após a entrega.
- Conta arquivada mantém a cor.
- Seletor de cor acessível: cada cor tem **nome** e o estado selecionado indica texto.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Cor por conta e cartão

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" e "Nubank Conjunta" e o cartão "Nubank Lucas"
    E Mariana está autenticada

  Cenário: Conta nova recebe uma cor ainda não usada
    Dado que as contas existentes usam "Azul" e "Verde"
    Quando Mariana cadastra a conta "Poupança"
    Então a conta "Poupança" recebe uma cor diferente de "Azul" e "Verde"

  Cenário: Editar a cor de uma conta
    Quando Mariana edita a conta "Itaú Mariana" e escolhe a cor "Laranja"
    Então a conta "Itaú Mariana" aparece com a cor "Laranja"

  Cenário: Duas contas podem repetir a cor
    Quando Mariana escolhe "Laranja" para "Nubank Conjunta" e "Itaú Mariana" já é "Laranja"
    Então a alteração é salva sem erro

  Cenário: Cor aparece nos lançamentos junto do nome
    Dado uma despesa na conta "Itaú Mariana" de cor "Laranja"
    Quando Mariana abre o Extrato
    Então a despesa mostra um marcador "Laranja" ao lado de "Itaú Mariana"

  Cenário: Cor nos seletores de pagamento
    Quando Mariana abre o formulário "Nova despesa"
    Então cada opção de "Pagar com" mostra o marcador de cor e o nome

  Cenário: Nome continua visível sem depender da cor
    Quando Mariana abre o Extrato em escala de cinza
    Então todas as origens continuam identificáveis pelo nome

  Cenário: Cartão também tem cor
    Quando Mariana edita o cartão "Nubank Lucas" e escolhe a cor "Roxo"
    Então as compras do cartão mostram o marcador "Roxo"

  Cenário: Cores legíveis nos dois temas
    Quando Mariana alterna entre os temas "Claro" e "Escuro"
    Então cada cor da paleta mantém contraste mínimo contra o fundo

  Cenário: Contas antigas recebem cor automática
    Dado contas criadas antes desta entrega
    Quando Mariana abre a tela "Contas"
    Então cada conta aparece com uma cor

  Cenário: Seletor de cor acessível
    Quando Mariana abre o seletor de cor
    Então cada opção tem um nome falado por leitor de tela
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): ponto de 10 px (≥ 3:1 de contraste) + nome; seletor em grade de 10 opções.

## Fora de escopo
Cor por categoria, tag ou membro; cores personalizadas livres (hex); ícones por instituição.

## Perguntas em aberto / pontos para o Tech Lead
- Campo `color` por conta/cartão (enum curto) e migração dos existentes.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 11).
