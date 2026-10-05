# US-049 — Visão sintética: quebras por membro, conta/cartão e tag, com filtros combináveis

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,0 · 5 |
| Status | **Esboçada** (SDD-016, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-048, US-045, US-047 |
| Corte | **Cortável** (segunda fatia; a US-048 já responde "para onde foi o dinheiro") |
| Rastreabilidade | Parecer item 7, Q-F10 · NEED-016 (RN-016.3, RN-016.5) · NEED-013 · FLUXO-014 · D-PO-29 |

## História
Como **membro da família**, quero **alternar a quebra por membro, conta/cartão ou tag e combinar filtros**, para **recortar o gasto por quem, onde e por quê**.

## Regras de negócio aplicáveis
- Seletor **"Agrupar por"**: **Categoria** (padrão, US-048), **Membro** (quem pagou), **Conta/Cartão**, **Tag**.
- **Filtros combináveis** (E entre filtros diferentes; OU dentro do mesmo): períodos, contas/cartões, categorias, tags, membros. Totais e quebra se ajustam.
- **Tag** (RN-016.3): um lançamento com várias tags entra em **cada tag selecionada**; a **soma das tags pode exceder o total** e a tela mostra o aviso "Um lançamento com várias tags é contado em cada uma".
- Lançamentos **sem tag** aparecem na linha "Sem tag".
- **Conta/Cartão**: compra no cartão aparece no **cartão**; transferências nunca entram.
- **Drill-down** em qualquer linha abre o Extrato com os mesmos filtros e o mesmo total (excluindo a duplicidade de tag: o Extrato mostra o lançamento uma vez).
- Respeita "ocultar valores".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Visão sintética com quebras e filtros

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E em julho de 2026 "Hotel" de "R$ 800,00" em "Lazer e restaurantes" pago por "Mariana" com a tag "viagem-nordeste"
    E "Passagem" de "R$ 600,00" em "Transporte" pago por "Lucas" com a tag "viagem-nordeste"
    E "Restaurante" de "R$ 250,00" em "Lazer e restaurantes" pago por "Mariana" com a tag "viagem-nordeste"
    E Lucas está autenticado na tela "Análise" de julho de 2026

  Cenário: Agrupar por tag
    Quando Lucas escolhe "Agrupar por" "Tag"
    Então vê "viagem-nordeste R$ 1.650,00"

  Cenário: Filtro por tag mostra a quebra por categoria
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então vê "Lazer e restaurantes R$ 1.050,00 63,6%" e "Transporte R$ 600,00 36,4%"

  Cenário: Agrupar por membro
    Quando Lucas escolhe "Agrupar por" "Membro"
    Então vê "Mariana R$ 1.050,00" e "Lucas R$ 600,00"

  Cenário: Agrupar por conta ou cartão
    Dado que "Passagem" foi paga no cartão "Nubank Lucas" e as demais na conta "Itaú Mariana"
    Quando Lucas escolhe "Agrupar por" "Conta/Cartão"
    Então vê "Itaú Mariana R$ 1.050,00" e "Nubank Lucas R$ 600,00"

  Cenário: Várias tags somam mais que o total
    Dado que "Passagem" tem também a tag "ferias"
    Quando Lucas escolhe "Agrupar por" "Tag"
    Então vê "viagem-nordeste R$ 1.650,00" e "ferias R$ 600,00"
    E vê o aviso "Um lançamento com várias tags é contado em cada uma"
    E o total de despesas continua "R$ 1.650,00"

  Cenário: Lançamentos sem tag aparecem em Sem tag
    Dado "Mercado" de "R$ 300,00" sem tags em julho de 2026
    Quando Lucas escolhe "Agrupar por" "Tag"
    Então vê "Sem tag R$ 300,00"

  Cenário: Filtros combinados
    Quando Lucas filtra pelo membro "Mariana" e pela tag "viagem-nordeste"
    Então o total de despesas é "R$ 1.050,00"

  Cenário: Drill-down de uma linha
    Quando Lucas toca em "viagem-nordeste" na quebra por tag
    Então vê o Extrato de julho de 2026 filtrado pela tag "viagem-nordeste"
    E o total de despesas do Extrato é "R$ 1.650,00"

  Cenário: Filtros ficam na URL
    Quando Lucas filtra pela tag "viagem-nordeste" e recarrega a página
    Então o filtro "viagem-nordeste" continua aplicado

  Cenário: Combinação sem resultado
    Quando Lucas filtra pelo membro "Lucas" e pela categoria "Lazer e restaurantes"
    Então vê "Nada lançado com esses filtros"

  Cenário: Limpar filtros
    Dado que Lucas aplicou dois filtros
    Quando Lucas toca em "Limpar filtros"
    Então os totais voltam ao período inteiro
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): seletor "Agrupar por" em controle segmentado; filtros em painel recolhível.

## Fora de escopo
Construtor de relatórios, salvar visões, exportação (RN-016.5); tags com orçamento; comparativos avançados.

## Perguntas em aberto / pontos para o Tech Lead
- Consulta única parametrizada por `groupBy` e filtros; custo com N:N de tags.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 7, Q-F10).
