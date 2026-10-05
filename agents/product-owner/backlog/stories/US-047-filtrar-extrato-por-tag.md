# US-047 — Filtrar o Extrato por tag

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise · **R3** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 3,5 · 2 |
| Status | **Esboçada** (SDD-016, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-045, US-007 |
| Corte | **Cortável** (mas é o drill-down das visões, US-048/049) |
| Rastreabilidade | Parecer item 1 · NEED-013 (§2.3) · NEED-006 · FLUXO-014 · D-PO-28 |

## História
Como **membro da família**, quero **filtrar o Extrato por uma ou mais tags e ver o total**, para **saber quanto custou uma viagem ou reforma**.

## Regras de negócio aplicáveis
- Novo filtro **"Tag"** (seleção múltipla) no Extrato; combina com os demais filtros (E entre filtros diferentes).
- Várias tags selecionadas = lançamentos que tenham **qualquer** uma delas (OU); cada lançamento aparece **uma vez** e o total **não soma em dobro**.
- O total do filtro segue a **mesma soma do Extrato** (RN-016.1): transferências e acertos não são despesa/receita; lançamento excluído não entra.
- Compra parcelada: cada parcela é uma linha com a tag (US-045); o total considera as parcelas **do período filtrado**.
- Estado do filtro entra na URL (compartilhável dentro da família); "Limpar filtros" (US-039) o remove.
- Respeita "ocultar valores".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Filtrar o Extrato por tag

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E "Hotel" de "R$ 800,00" e "Restaurante" de "R$ 250,00" com a tag "viagem-nordeste" em julho de 2026
    E "Mercado" de "R$ 300,00" sem tags em julho de 2026
    E "Passagem" de "R$ 600,00" com as tags "viagem-nordeste" e "ferias" em julho de 2026
    E Lucas está autenticado no Extrato de julho de 2026

  Cenário: Filtrar por uma tag
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então vê "Hotel" e "Restaurante" e "Passagem"
    E não vê "Mercado"

  Cenário: Total do filtro
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então o total de despesas do filtro é "R$ 1.650,00"

  Cenário: Duas tags contam cada lançamento uma vez
    Quando Lucas filtra pelas tags "viagem-nordeste" e "ferias"
    Então vê "Passagem" uma única vez
    E o total de despesas do filtro é "R$ 1.650,00"

  Cenário: Combinar tag com categoria
    Dado que "Hotel" e "Restaurante" estão em "Lazer e restaurantes" e "Passagem" em "Transporte"
    Quando Lucas filtra pela tag "viagem-nordeste" e pela categoria "Transporte"
    Então vê apenas "Passagem"

  Cenário: Tag sem lançamentos no período
    Quando Lucas filtra pela tag "ferias" no Extrato de agosto de 2026
    Então vê "Nenhum lançamento com essa tag neste período"

  Cenário: Excluído não entra no total
    Dado que "Hotel" foi excluído
    Quando Lucas filtra pela tag "viagem-nordeste"
    Então o total de despesas do filtro é "R$ 850,00"

  Cenário: Filtro na URL
    Quando Lucas filtra pela tag "viagem-nordeste" e recarrega a página
    Então o filtro "viagem-nordeste" continua aplicado

  Cenário: Limpar o filtro de tag
    Dado que Lucas filtrou pela tag "viagem-nordeste"
    Quando Lucas toca em "Limpar filtros"
    Então vê "Mercado" de novo
```

## Experiência (UX/estados)
Seletor múltiplo com busca no painel "Filtros" do Extrato (recolhível no mobile).

## Fora de escopo
Filtro "todas as tags" (E); filtro por ausência de tag; salvar filtros.

## Perguntas em aberto / pontos para o Tech Lead
- Consulta com N:N sem duplicar linhas e totais; índice.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 1).
