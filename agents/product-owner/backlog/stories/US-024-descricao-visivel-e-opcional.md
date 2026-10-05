# US-024 — Descrição visível e opcional ao lançar

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 3,7 (recalc.) · 3 (PO: 2) |
| Status | **Especificada** (SDD-013, pronta para o Dev) · tamanho re-estimado pelo TL |
| Depende de | US-005, US-006, US-016a |
| Corte | **Não cortar** |
| Rastreabilidade | Parecer item 5, Q-F13 · NEED-022 · DEV-10, Q-05 · FLUXO-008 · D-PO-20 |

## História
Como **membro da família**, quero **ver o campo de descrição ao lançar uma despesa (ou receita), sem ser obrigado a preenchê-lo**, para **identificar o lançamento no extrato sem perder a velocidade do lançamento rápido**.

## Regras de negócio aplicáveis
- **Causa confirmada** (DEV-10): a descrição ficava dentro de "Mais detalhes", recolhido. Passa a ser um campo **visível** na área principal do formulário, **abaixo da categoria**, com o texto de apoio "Descrição (opcional)".
- **Vazio** assume o **nome da categoria** (Q-F13) tanto no Extrato quanto na Home.
- Tamanho: 2 a 100 caracteres quando preenchida; espaços nas pontas são removidos; só espaços equivale a vazio.
- Em **despesa, receita e compra no cartão** (e na baixa de previsão, que já tem descrição).
- Descrição **não bloqueia** o salvar e **não é focada** automaticamente (o foco continua no valor): **mesmos quatro toques** do fluxo mínimo (valor, categoria, salvar).
- Sugestões de descrições recentes ao digitar (auto-completar) ficam para o futuro.
- Edição de lançamento (US-013a) mostra e permite alterar a descrição.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Descrição visível e opcional

  Contexto:
    Dado a "Família Silva" com a conta "Nubank Conjunta" (saldo R$ 1.000,00)
    E os membros "Mariana" e "Lucas"
    E Lucas está autenticado

  Cenário: Campo de descrição visível sem abrir Mais detalhes
    Quando Lucas abre o formulário "Nova despesa"
    Então vê o campo "Descrição (opcional)"
    E não precisa tocar em "Mais detalhes" para vê-lo

  Cenário: Salvar com descrição
    Quando Lucas digita "R$ 150,50" escolhe a categoria "Supermercado" e informa a descrição "Mercado do bairro"
    E toca em "Salvar Despesa"
    Então o Extrato mostra "Mercado do bairro" como descrição da despesa

  Cenário: Descrição vazia assume a categoria
    Quando Lucas digita "R$ 150,50" escolhe a categoria "Supermercado" e toca em "Salvar Despesa"
    Então o Extrato mostra "Supermercado" como descrição da despesa

  Cenário: Descrição só com espaços equivale a vazia
    Quando Lucas informa a descrição "   " e salva uma despesa de "R$ 20,00" em "Lazer e restaurantes"
    Então o Extrato mostra "Lazer e restaurantes" como descrição da despesa

  Cenário: Descrição curta demais
    Quando Lucas informa a descrição "a"
    Então vê "A descrição precisa ter entre 2 e 100 caracteres"
    E o botão "Salvar Despesa" fica desabilitado

  Cenário: Descrição longa demais
    Quando Lucas informa uma descrição com 101 caracteres
    Então vê "A descrição precisa ter entre 2 e 100 caracteres"

  Cenário: Foco continua no valor
    Quando Lucas abre o formulário "Nova despesa"
    Então o foco está no campo de valor

  Cenário: Lançamento rápido continua com quatro toques
    Quando Lucas abre o formulário e digita "R$ 80,00" e escolhe a categoria "Saúde" e salva sem tocar na descrição
    Então a despesa é registrada com a descrição "Saúde"

  Cenário: Receita também tem o campo
    Quando Lucas troca para "Nova receita"
    Então vê o campo "Descrição (opcional)"

  Cenário: Compra no cartão também tem o campo
    Dado o cartão "Nubank Lucas" cadastrado
    Quando Lucas escolhe "Pagar com" o cartão "Nubank Lucas"
    Então vê o campo "Descrição (opcional)"

  Cenário: Editar a descrição de um lançamento
    Dado uma despesa de "R$ 150,50" com a descrição "Supermercado"
    Quando Lucas edita a descrição para "Mercado do bairro" e salva
    Então o Extrato mostra "Mercado do bairro"

  Cenário: Busca por descrição encontra o lançamento
    Dado uma despesa com a descrição "Mercado do bairro"
    Quando Lucas busca por "bairro" no Extrato
    Então a despesa aparece no resultado
```

## Experiência (UX/estados)
[FLUXO-008](../../flows/FLUXO-008-lancar-despesa-r21-r3.md): campo de uma linha, altura compacta (≥ 44 px), com teclado alfabético só quando tocado. Mensagem de erro some assim que o campo fica válido (achado 5, ver US-039).

## Fora de escopo
Auto-completar por descrições anteriores; descrição obrigatória por família; anexos/comprovantes.

## Perguntas em aberto / pontos para o Tech Lead
- Manter `min(2)` do contrato com preenchimento do padrão (nome da categoria) no cliente ou no servidor (Q-05); definir onde ocorre para que a API e a UI concordem.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 5, Q-F13). Revisa o parágrafo "Descrição" da [US-005](US-005-lancar-despesa.md) (campo visível, não mais em "Mais detalhes").
