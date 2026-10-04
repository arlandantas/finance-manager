# US-014 — Gerenciar categorias da família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Could · 2,3 · 3 |
| Status | Refinada (PO) |
| Depende de | US-002 (categorias padrão), US-005 (drawer de lançamento) |
| Rastreabilidade | NEED-006 (extrato por categoria) · NEED-005 (tetos por categoria, AP1, depende de categorias estáveis) · FLUXO-001 · D-PO-04 |

## História
Como **membro da família**, quero **criar, renomear e arquivar categorias**, para **classificar os gastos e as receitas do jeito da minha casa sem perder o histórico**.

## Regras de negócio aplicáveis
- Toda categoria pertence a um **tipo** (Despesa ou Receita), escolhido na criação e **imutável**.
- **Nome**: 2 a 30 caracteres, único **por tipo** na família, sem distinguir maiúsculas/minúsculas nem espaços nas pontas. O mesmo nome pode existir em tipos diferentes (ex.: "Presentes" em Despesa e em Receita).
- **Ícone**: escolhido de uma lista fixa (galeria de ícones). Não há upload nem emoji livre.
- **Renomear** vale para todo o histórico: lançamentos antigos passam a exibir o novo nome (a categoria é a mesma, só muda o rótulo).
- **Arquivar** (substitui "excluir"): a categoria some da grade de novos lançamentos e de novas despesas previstas, mas **permanece** nos lançamentos existentes e no filtro de categoria do extrato (marcada "arquivada"). Pode ser **reativada**.
- **Não há exclusão definitiva** nesta release (preserva auditoria e totais).
- Não é permitido arquivar a **última categoria ativa** de um tipo (todo lançamento exige categoria).
- Limite de **40 categorias por tipo** (ativas + arquivadas), para evitar poluição acidental.
- Novas categorias entram **no fim** da grade; reordenar está fora de escopo.
- **Qualquer membro** gerencia categorias (D-PO-02 / D-PO-04): a lista é da família, não pessoal.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Gerenciar categorias

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a família tem as 8 categorias de despesa e as 3 de receita padrão
    E Lucas está autenticado

  Cenário: Criar categoria de despesa
    Quando Lucas abre "Categorias", escolhe "Despesa", toca em "Nova categoria", informa "Pet", escolhe o ícone de patinha e salva
    Então a categoria "Pet" aparece na lista de despesas
    E aparece como última opção na grade do drawer de nova despesa

  Cenário: Usar a categoria nova em um lançamento
    Dado a categoria de despesa "Pet"
    Quando Lucas lança "R$ 120,00" na categoria "Pet"
    Então a despesa é registrada na categoria "Pet"

  Cenário: Mesmo nome em tipos diferentes
    Dado a categoria de despesa "Presentes"
    Quando Lucas cria a categoria de receita "Presentes"
    Então as duas categorias existem, cada uma no seu tipo

  Cenário: Nome duplicado no mesmo tipo
    Dado a categoria de despesa "Supermercado"
    Quando Lucas tenta criar a categoria de despesa " supermercado "
    Então vê "Já existe uma categoria com este nome"
    E nada é criado

  Cenário: Nome igual ao de uma categoria arquivada
    Dado a categoria de despesa "Pet" arquivada
    Quando Lucas tenta criar a categoria de despesa "Pet"
    Então vê "Já existe uma categoria arquivada com este nome" com a ação "Reativar"

  Cenário: Nome muito curto
    Quando Lucas tenta criar uma categoria de despesa com o nome "A"
    Então vê "Informe um nome com ao menos 2 caracteres"

  Cenário: Nome muito longo
    Quando Lucas tenta criar uma categoria com 31 caracteres
    Então vê "O nome deve ter no máximo 30 caracteres"

  Cenário: Renomear preserva o histórico
    Dado uma despesa de "R$ 150,50" na categoria "Supermercado"
    Quando Lucas renomeia a categoria "Supermercado" para "Mercado"
    Então a despesa de "R$ 150,50" passa a aparecer na categoria "Mercado"
    E o total gasto na categoria não muda

  Cenário: Arquivar categoria em uso
    Dado uma despesa de "R$ 80,00" na categoria "Lazer e restaurantes"
    Quando Lucas arquiva a categoria "Lazer e restaurantes"
    Então ela some da grade do drawer de nova despesa
    E a despesa de "R$ 80,00" continua no extrato com a categoria "Lazer e restaurantes"
    E o filtro de categoria do extrato ainda lista "Lazer e restaurantes (arquivada)"

  Cenário: Reativar categoria arquivada
    Dado a categoria de despesa "Lazer e restaurantes" arquivada
    Quando Lucas reativa a categoria
    Então ela volta à grade do drawer de nova despesa

  Cenário: Não arquivar a última categoria ativa do tipo
    Dado que só resta a categoria de receita "Salário" ativa
    Quando Lucas tenta arquivá-la
    Então vê "Mantenha ao menos uma categoria de receita ativa"
    E a categoria continua ativa

  Cenário: Limite de categorias por tipo
    Dado que a família tem 40 categorias de despesa
    Quando Lucas tenta criar mais uma
    Então vê "Limite de 40 categorias por tipo atingido"

  Cenário: Conflito de edição
    Dado que Lucas e Mariana abriram a edição da categoria "Transporte"
    Quando Mariana renomeia para "Locomoção" e salva
    E Lucas tenta renomear para "Carro" e salvar
    Então Lucas vê "Esta categoria foi alterada por Mariana. Recarregue para continuar."

  Cenário: Membro comum também gerencia
    Dado que Lucas é "Membro" e não "Administrador"
    Quando Lucas cria a categoria de despesa "Pet"
    Então a categoria é criada

  Cenário: Falha de rede ao salvar
    Dado que não há conexão
    Quando Lucas toca em "Salvar" na nova categoria
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E o formulário preserva o que foi digitado

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a categoria "Pet"
    Quando Lucas abre "Categorias"
    Então não vê a categoria "Pet" da outra família
```

## Experiência (UX/estados)
- Tela **Categorias** (`/categorias`), acessada pelo menu e pelo atalho "Gerenciar categorias" no fim da grade do drawer de lançamento. Abas **Despesa** | **Receita**; lista com ícone, nome e menu "⋯" (Renomear, Mudar ícone, Arquivar). Seção recolhida **"Arquivadas (n)"**, só visível se houver alguma, com a ação *Reativar*.
- *Drawer* "Nova categoria": nome, galeria de ícones (grade, o primeiro selecionado), botão fixo "Salvar".
- Estados: skeleton da lista, erro de leitura com "Tentar de novo", enviando ("Salvando…"), sem conexão (padrão do SDD-000 §7). Toast: "Categoria criada", "Categoria atualizada", "Categoria arquivada" (com *Desfazer* por 5 s), "Categoria reativada".

## Fora de escopo
Exclusão definitiva; reordenar; cores personalizadas; subcategorias; mesclar categorias; teto por categoria (AP1, NEED-005); categorias por membro.

## Perguntas em aberto / pontos para o Tech Lead
- **Q-D04 (Stakeholder, não bloqueante)**: confirmar que qualquer membro gerencia categorias e que "arquivar" basta (sem excluir). Hipótese adotada: sim (D-PO-04).
- Ao TL: `Category` já tem `archivedAt`; precisa de `version` (conflito de edição) e do índice único sem distinção de caixa (hoje é `(familyId, kind, name)` exato). O drawer e o extrato precisam diferenciar categorias ativas de arquivadas.

## Histórico
- 2026-10-04 — Refinada a partir do esboço do backlog (Rascunho → Refinada).
