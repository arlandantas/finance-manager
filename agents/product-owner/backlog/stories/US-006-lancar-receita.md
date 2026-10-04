# US-006 — Lançar uma receita

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-3 Transações & Categorização · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 5,0 · 2 |
| Status | Refinada (PO) |
| Depende de | US-005 |
| Rastreabilidade | NEED-002 (entradas) · NEED-001 · RN-002.2 · FLUXO-001 (rev. 2) |

## História
Como **membro da família**, quero **registrar salários e outras entradas em uma conta**, para que **o saldo reflita a realidade**.

## Regras de negócio aplicáveis
- Receita **aumenta o saldo** da conta escolhida.
- Categorias de receita padrão: Salário, Rendimentos, Outras receitas.
- Autor automático; **responsável pelo recebimento** = membro escolhido (padrão: usuário logado).
- **Receita não entra no rateio** do acerto de contas no MVP (sem *switch* de divisão).
- Valor > 0, centavos inteiros; data padrão hoje; sem data futura (previsão de receita não está no MVP).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Lançamento de receita

  Cenário: Registrar salário
    Dado a conta "Itaú Mariana" com saldo "R$ 1.500,00"
    Quando Mariana alterna para "Nova Receita", digita "R$ 5.000,00", escolhe "Salário" e salva
    Então a receita é registrada com autor e responsável "Mariana"
    E o saldo de "Itaú Mariana" passa a "R$ 6.500,00"

  Cenário: Receita em nome de outro membro
    Quando Lucas lança "R$ 300,00" em "Outras receitas" com "Quem recebeu: Mariana"
    Então o autor é "Lucas" e o responsável pelo recebimento é "Mariana"

  Cenário: Interface de receita não exibe divisão
    Quando abro o lançamento no modo "Nova Receita"
    Então o switch "Dividir com a família" não é exibido
    E as categorias exibidas são as de receita

  Cenário: Valor inválido
    Quando tento salvar a receita com "R$ 0,00"
    Então vejo "Informe um valor maior que zero"

  Cenário: Duplo clique não duplica
    Quando toco duas vezes em "Salvar Receita"
    Então apenas uma receita é registrada
```

## Experiência
Mesma *drawer* de US-005 com o alternador *Nova Despesa / Nova Receita* (FLUXO-001 rev. 2).

## Fora de escopo
Receita prevista/recorrente (AP1), rateio proporcional por renda (a regra *proporcional* de US-008 usa percentuais definidos manualmente, não a renda lançada), transferência (US-010).

## Perguntas em aberto / pontos para o Tech Lead
- Nenhuma bloqueante. Reaproveitar contratos de US-005 (`type = INCOME`).
