# US-007 — Consultar o extrato de lançamentos com filtros

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 5,7 · 3 |
| Status | Refinada (PO) |
| Depende de | US-005, US-006 |
| Rastreabilidade | NEED-006 (extrato simples AP0) · NEED-001 · RN-001.1 · Histórico de alinhamentos (visão detalhada) |

## História
Como **membro da família**, quero **ver o extrato unificado com filtros**, para **saber o que foi lançado, por quem e em qual conta**.

## Regras de negócio aplicáveis
- O extrato mostra **todos os lançamentos da família** ordenados do mais recente para o mais antigo (data, depois criação).
- Cada linha exibe: data, descrição, categoria, **valor** (verde para receita, neutro/vermelho para despesa), **quem pagou/recebeu** (avatar), conta e marcador **comum/pessoal**.
- O detalhe mostra também o **autor do cadastro** (RN-001.1).
- Filtros combináveis: **período** (padrão: mês corrente), **conta**, **membro** (quem pagou/recebeu *ou* autor), **categoria**, **tipo** (despesa/receita), **comum/pessoal**.
- Totais do filtro: soma de receitas, soma de despesas e saldo do filtro.
- Paginação/rolagem infinita; nunca carregar tudo de uma vez.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Extrato de lançamentos

  Contexto:
    Dado que em outubro há: despesa comum de "R$ 150,50" de Lucas em "Supermercado",
      despesa pessoal de "R$ 80,00" de Mariana em "Lazer e restaurantes"
      e receita de "R$ 5.000,00" de Mariana em "Salário"

  Cenário: Extrato padrão
    Quando abro o extrato
    Então vejo os três lançamentos de outubro do mais recente ao mais antigo
    E cada linha mostra valor, categoria, conta, avatar de quem pagou e marcador comum ou pessoal

  Cenário: Filtrar por membro
    Quando filtro por "Lucas"
    Então vejo apenas os lançamentos em que Lucas pagou, recebeu ou foi o autor

  Cenário: Filtrar por categoria e tipo
    Quando filtro por categoria "Supermercado" e tipo "Despesa"
    Então vejo apenas a despesa de "R$ 150,50"
    E o total de despesas do filtro é "R$ 150,50"

  Cenário: Filtrar por período
    Quando seleciono o mês anterior
    Então vejo somente lançamentos desse mês

  Cenário: Detalhe mostra o autor
    Dado que Lucas registrou a despesa em nome de Mariana
    Quando abro o detalhe do lançamento
    Então vejo "Registrado por Lucas" e "Pago por Mariana"

  Cenário: Estado vazio com filtro
    Quando aplico um filtro sem resultados
    Então vejo "Nenhum lançamento encontrado" e a ação "Limpar filtros"

  Cenário: Estado vazio sem lançamentos
    Dado uma família sem nenhum lançamento
    Quando abro o extrato
    Então vejo um convite para fazer o primeiro lançamento

  Cenário: Novo lançamento aparece sem recarregar
    Dado que estou no extrato
    Quando registro uma despesa pelo botão "+"
    Então ela aparece no topo da lista sem recarregar a página

  Cenário: Isolamento entre famílias
    Quando um usuário de outra família abre o extrato
    Então não vê nenhum lançamento da "Família Silva"
```

## Experiência
Lista em cards no mobile, tabela compacta no desktop; filtros em *drawer*/barra de chips; skeleton ao carregar; totais fixos no topo.

## Fora de escopo
Exportação (V2), busca textual, gráficos, filtro por cartão e status Previsto/Pago (chegam com US-016..US-019), edição/exclusão (US-013).

## Perguntas em aberto / pontos para o Tech Lead
- Definir estratégia de paginação e índices por `familyId` + data.
- Os filtros devem ser **refletidos na URL** (compartilhável/recarregável) — recomendação do PO.
