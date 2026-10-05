# US-051 — Receitas previstas e saldo previsto completo

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-21 Classificação e Análise (extensão do EPIC-17/EPIC-7) · **R3** |
| MoSCoW · WSJF · Tamanho (TL) | Could · 1,4 · 5 |
| Status | **Esboçada** (SDD-017, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-018, US-019, US-025 |
| Corte | **Primeiro Could a cortar na R3** |
| Rastreabilidade | Parecer Q-F03 · NEED-015 (RN-015.4) · NEED-004 · FLUXO-006, FLUXO-005 · D-PO-31 |

## História
Como **membro da família**, quero **cadastrar receitas previstas (ex.: salário) e vê-las no saldo previsto**, para **saber o que sobra no fim do mês considerando o que ainda vai entrar**.

## Regras de negócio aplicáveis
- **Receita prevista** é um compromisso (como a despesa prevista, D-PO-11): `PREVISTO` → `RECEBIDO`; **não** altera saldo, extrato nem totais até a **baixa**.
- Campos: descrição, valor, categoria de receita, **data esperada**, conta de destino sugerida, responsável.
- **Dar baixa** ("Receber"): informa conta, data e **valor efetivo** (pode diferir); gera a **receita real**; "Desfazer recebimento" volta a `PREVISTO` (mesma mecânica da US-019).
- **A receber** do mês (caixa) = receitas previstas pendentes com data esperada no mês; atrasadas destacadas.
- **Saldo previsto** (RN-015.4 completo) = saldo atual − **A pagar** + **A receber**. Rótulo: "Saldo atual, menos o que falta pagar, mais o que falta receber".
- O Resumo do Mês (US-025) ganha a linha **"A receber"** só quando há receitas previstas no mês; sem elas, o cálculo e o rótulo da R2.1 permanecem.
- Não há recorrência na R3 (recorrência é AP1); cada receita prevista é pontual.
- Receita prevista **não** entra no acerto.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Receitas previstas e saldo previsto

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Mariana" e os membros "Mariana" e "Lucas"
    E o saldo atual das contas "R$ 7.349,50"
    E a "A pagar" de outubro de 2026 em "R$ 1.258,90"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Cadastrar uma receita prevista
    Quando Mariana cadastra a receita prevista "Salário" de "R$ 5.000,00" com data esperada 20/10/2026
    Então vê "Receita prevista cadastrada"
    E o saldo da conta não muda

  Cenário: Saldo previsto soma o que falta receber
    Dado a receita prevista "Salário" de "R$ 5.000,00" com data esperada 20/10/2026
    Quando Mariana abre a Home
    Então o Resumo do Mês mostra "A receber R$ 5.000,00"
    E mostra "Saldo previsto R$ 11.090,60"
    E vê "Saldo atual, menos o que falta pagar, mais o que falta receber"

  Cenário: Sem receitas previstas o saldo previsto não muda
    Quando Mariana abre a Home
    Então o Resumo do Mês não mostra a linha "A receber"
    E mostra "Saldo previsto R$ 6.090,60"

  Cenário: Receber com valor efetivo diferente
    Dado a receita prevista "Salário" de "R$ 5.000,00" com data esperada 20/10/2026
    Quando Mariana dá baixa recebendo "R$ 5.100,00" na conta "Itaú Mariana" em 20/10/2026
    Então o saldo de "Itaú Mariana" aumenta "R$ 5.100,00"
    E o Extrato mostra uma receita de "R$ 5.100,00"

  Cenário: Receita prevista pendente não entra nas receitas do mês
    Dado a receita prevista "Salário" de "R$ 5.000,00" pendente
    Quando Mariana abre a Home
    Então "Receitas" do mês não inclui "R$ 5.000,00"

  Cenário: Desfazer o recebimento
    Dado que Mariana recebeu o "Salário" de "R$ 5.000,00"
    Quando Mariana toca em "Desfazer recebimento" e confirma
    Então o saldo da conta volta ao valor anterior
    E a receita volta a "Previsto"

  Cenário: Receita atrasada
    Dado a receita prevista "Freelance" de "R$ 800,00" com data esperada 05/10/2026
    Quando Mariana abre a Home
    Então "A receber" mostra o selo "Atrasada" em "Freelance"

  Cenário: Receita prevista não entra no acerto
    Dado a receita prevista "Salário" de "R$ 5.000,00" recebida
    Quando Mariana abre o painel de Acerto
    Então o acerto do mês não considera o "Salário"

  Cenário: Valor inválido
    Quando Mariana cadastra a receita prevista com valor "R$ 0,00"
    Então vê "Informe um valor maior que zero"

  Cenário: Baixa única
    Dado que a receita prevista "Salário" já foi recebida
    Quando Mariana tenta dar baixa de novo com a versão atual
    Então vê "Esta receita prevista já foi recebida"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com a receita prevista "Salário Souza"
    Quando Mariana tenta dar baixa nela por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-006](../../flows/FLUXO-006-home-resumo-do-mes.md) (linha "A receber") e [FLUXO-005](../../flows/FLUXO-005-despesas-previstas.md) (aba "A receber" em Contas a pagar, renomeada para "Previstas").

## Fora de escopo
Recorrência de receita (AP1); metas de receita; projeção de vários meses.

## Perguntas em aberto / pontos para o Tech Lead
- Reaproveitar a entidade de previsão (ADR-015) com `kind` receita/despesa ou criar entidade própria; impacto na rota `/previstas`.

## Histórico
- 2026-10-04 — Criada a partir do parecer (Q-F03; NEED-015 RN-015.4).
