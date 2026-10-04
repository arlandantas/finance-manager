# US-015 — Cadastrar cartão de crédito

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-6 Cartões de Crédito (fase 1) · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,0 · 3 |
| Status | Refinada (PO) |
| Depende de | US-002 |
| Rastreabilidade | NEED-003 (§2.1, RN-003.1) · NEED-001 (titular) · FLUXO-004 · D-PO-02, D-PO-05, D-PO-07 |

## História
Como **membro da família**, quero **cadastrar um cartão de crédito com limite, dia de fechamento e dia de vencimento**, para **separar o que é gasto no cartão do saldo das contas e saber quando a fatura fecha e vence**.

## Regras de negócio aplicáveis
- O **cartão é uma entidade distinta da conta bancária**: não tem saldo, tem **limite**. Não entra no "Saldo da família".
- Campos: **nome** (2 a 60 caracteres, único na família sem distinguir caixa), **instituição** (opcional, mesmas sugestões das contas, padrão "Outro"), **titular** (membro; padrão = usuário logado; informativo), **limite total** (centavos inteiros, maior que zero), **dia de fechamento** e **dia de vencimento** (inteiros de 1 a 28).
- **Fechamento x vencimento** (define a data de vencimento de cada fatura):
  - se o dia de vencimento for **maior** que o de fechamento, a fatura vence **no mesmo mês** do fechamento (fecha dia 10, vence dia 20);
  - se for **menor ou igual**, vence **no mês seguinte** (fecha dia 25, vence dia 05; fecha dia 28, vence dia 28).
- Dias 29 a 31 não existem nesta release (evita meses curtos; D-PO-05).
- **Todos os membros veem e usam todos os cartões** (D-PO-02). O titular é só informação.
- Limite e nome podem ser **editados** a qualquer momento. **Os dias de fechamento e de vencimento só podem ser alterados enquanto o cartão não tiver nenhuma compra** (D-PO-07): depois, mudar o ciclo reescreveria faturas já formadas.
- **Limite disponível** = limite − soma das compras que ainda estão em faturas **não pagas** (abertas ou fechadas). Cartão novo: disponível = limite.
- Cartão não é arquivável/excluível nesta release.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Cadastro de cartão de crédito

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E Mariana está autenticada

  Cenário: Cadastrar cartão com sucesso
    Quando Mariana cadastra o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    Então o cartão aparece na lista com limite "R$ 5.000,00" e disponível "R$ 5.000,00"
    E mostra "Fecha dia 25 · vence dia 5 do mês seguinte"

  Cenário: Titular padrão
    Quando Mariana cadastra um cartão sem escolher o titular
    Então o titular do cartão é "Mariana"

  Cenário: Vencimento no mesmo mês do fechamento
    Quando Mariana cadastra o cartão "Itaú Visa" com fechamento dia 10 e vencimento dia 20
    Então a lista mostra "Fecha dia 10 · vence dia 20 do mesmo mês"

  Cenário: Vencimento no mesmo dia do fechamento
    Quando Mariana cadastra o cartão "Inter" com fechamento dia 28 e vencimento dia 28
    Então a lista mostra "Fecha dia 28 · vence dia 28 do mês seguinte"

  Cenário: Cartão não altera o saldo da família
    Dado as contas "Itaú Mariana" com "R$ 6.500,00" e "Nubank Conjunta" com "R$ 849,50"
    Quando Mariana cadastra o cartão "Nubank Mariana" com limite "R$ 5.000,00"
    Então o saldo da família continua "R$ 7.349,50"

  Cenário: Campos obrigatórios
    Quando Mariana tenta salvar um cartão sem nome, sem limite e sem dias
    Então vê "Informe o nome do cartão"
    E vê "Informe um limite maior que zero"
    E vê "Escolha o dia de fechamento (1 a 28)"
    E vê "Escolha o dia de vencimento (1 a 28)"
    E nada é criado

  Cenário: Dia fora do intervalo
    Quando Mariana informa o dia de fechamento 31
    Então vê "Escolha o dia de fechamento (1 a 28)"

  Cenário: Limite inválido
    Quando Mariana informa o limite "R$ 0,00"
    Então vê "Informe um limite maior que zero"

  Cenário: Nome duplicado na família
    Dado o cartão "Nubank Mariana"
    Quando Mariana tenta cadastrar o cartão "nubank mariana "
    Então vê "Já existe um cartão com este nome"

  Cenário: Cartão visível para todos os membros
    Dado o cartão "Nubank Mariana" cadastrado por Mariana
    Quando Lucas abre "Cartões"
    Então vê o cartão "Nubank Mariana" com o mesmo limite

  Cenário: Editar nome e limite
    Dado o cartão "Nubank Mariana" com limite "R$ 5.000,00"
    Quando Mariana altera o nome para "Nubank Roxinho" e o limite para "R$ 6.000,00"
    Então o cartão aparece como "Nubank Roxinho" com limite "R$ 6.000,00"

  Cenário: Dias do ciclo editáveis antes da primeira compra
    Dado o cartão "Nubank Mariana" sem compras
    Quando Mariana altera o fechamento para o dia 20
    Então o cartão passa a mostrar "Fecha dia 20"

  Cenário: Dias do ciclo travados depois da primeira compra
    Dado o cartão "Nubank Mariana" com uma compra de "R$ 300,00"
    Quando Mariana tenta alterar o dia de fechamento
    Então o campo está desabilitado com a explicação "Os dias de fechamento e vencimento não podem ser alterados porque já há compras neste cartão"
    E nome e limite continuam editáveis

  Cenário: Conflito de edição
    Dado que Mariana e Lucas abriram a edição do cartão "Nubank Mariana"
    Quando Mariana salva um novo limite
    E Lucas tenta salvar outro limite
    Então Lucas vê "Este cartão foi alterado por Mariana. Recarregue para continuar."

  Cenário: Nenhum cartão cadastrado
    Dado que a família não tem cartões
    Quando Mariana abre "Cartões"
    Então vê "Cadastre seu primeiro cartão" com o botão "Novo cartão"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Mariana abre "Cartões"
    Então não vê o cartão "Visa Souza"
```

## Experiência (UX/estados)
- Tela **Cartões** (`/cartoes`): um *card* por cartão com nome, instituição, avatar do titular, **barra de uso do limite** (usado / disponível), frase do ciclo ("Fecha dia 25 · vence dia 5 do mês seguinte") e, quando existir, a fatura aberta (US-017a). Botão "Novo cartão".
- *Drawer* "Novo cartão": nome, instituição, titular, limite (máscara BRL), fechamento e vencimento (seletor 1–28, com a **frase explicativa** atualizada ao vivo: "A fatura fecha no dia 25 e vence no dia 5 do mês seguinte").
- Estados: skeleton, vazio, erro de leitura, enviando, sem conexão (padrão SDD-000 §7).
- Mobile 375 px e desktop 1280 px.

## Fora de escopo
Arquivar/excluir cartão; cartão adicional/virtual; bandeira e últimos dígitos; anuidade e juros; alterar ciclo após compras (D-PO-07, AP1 com parcelamento); permissões por cartão (US-020).

## Perguntas em aberto / pontos para o Tech Lead
- **Q-18 (Stakeholder, não bloqueante)**: compras feitas **no dia do fechamento** entram na fatura que fecha naquele dia (D-PO-06) — confirmar com a prática do banco da família.
- **Q-19 (Stakeholder, não bloqueante)**: confirmar que travar os dias do ciclo após a primeira compra é aceitável (alternativa: ciclo versionado por vigência, como a regra de divisão — mais caro).

## Histórico
- 2026-10-04 — Refinada a partir do esboço (Rascunho → Refinada).
