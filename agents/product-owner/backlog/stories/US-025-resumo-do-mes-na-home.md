# US-025 — Resumo do Mês como foco da Home

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês e Privacidade de Exibição · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 3,6 · 5 |
| Status | **Especificada** (SDD-010, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-012, US-017a (faturas), US-018 (previstas), US-007 (Extrato, reconciliação) |
| Corte | **Não cortar** (item 8 do usuário) |
| Rastreabilidade | Parecer item 8, Q-F03, Q-F03b · NEED-015 (RN-015.1..7) · NEED-009 (RN08 rebaixado) · FLUXO-006 · D-PO-13 |

## História
Como **membro da família**, quero **abrir a Home e ver como está o mês (receitas, despesas, resultado, a pagar e saldo previsto)**, para **saber se estamos bem sem ser enganado por um saldo alto que esconde contas a pagar**.

## Regras de negócio aplicáveis (definições fixadas por NEED-015)
- Período = **mês-calendário selecionado** (padrão: o corrente), com setas "mês anterior / próximo".
- **Receitas** = receitas realizadas do mês (data do lançamento no mês).
- **Despesas** (RN-015.1, competência) = despesas do mês: compra no cartão conta **no mês da compra**; **pagamento de fatura, transferência e acerto não são despesa**; despesa prevista só conta após a **baixa**.
- **Resultado do mês** = receitas − despesas (RN-015.3).
- **A pagar** (RN-015.2, caixa) = previstas **pendentes** com vencimento no mês + **faturas** de cartão com vencimento no mês e ainda não pagas, em **linha própria "Faturas"** (Q-F03b), sem entrar em "Despesas". Itens **atrasados** (vencimento anterior a hoje) destacados e somados em "A pagar" do mês corrente.
- **Saldo previsto** (RN-015.4) = saldo atual das contas − **A pagar do mês**. Rótulo fixo: "Saldo atual menos o que ainda vai pagar neste mês". Sem receitas previstas na R2.1 (Q-F03); por isso o valor é conservador.
- Meses passados: "A pagar" e "Saldo previsto" mostram só o que **permanece pendente**; para meses futuros o cálculo usa os vencimentos **daquele mês** e o saldo **atual** (sem projetar os meses intermediários: D-PO-42, TL-09; a projeção acumulada fica para o AP1).
- **Definições do TL** (SDD-010 §4.2): "A pagar" = previstas pendentes + faturas **não pagas**, abertas ou fechadas, por vencimento; atrasadas de meses anteriores só entram no mês corrente.
- **Reconciliação** (RN-015.5): Receitas, Despesas e o total por membro batem com o **Extrato** do mesmo período e filtros.
- Linhas "Acerto do mês" e "Acertos pendentes" pertencem à US-029; "Participação por membro" da US-012 é mantida abaixo do resumo.
- Respeita "ocultar valores" (US-027).
- O **saldo da família** deixa de ser o destaque: vive no card recolhível da US-026.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Resumo do Mês na Home

  Contexto:
    Dado a "Família Silva" com as contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    E os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Lucas está autenticado na Home

  Cenário: Resumo do mês corrente com os cinco números
    Dado receitas realizadas de "R$ 5.000,00" em outubro de 2026
    E despesas realizadas de "R$ 1.200,00" em outubro de 2026
    E despesas previstas pendentes de "R$ 650,00" e "R$ 129,90" com vencimento em outubro de 2026
    E uma fatura aberta de "R$ 479,00" com vencimento em 15/10/2026
    Quando Lucas abre a Home
    Então o Resumo do Mês mostra "Receitas R$ 5.000,00" e "Despesas R$ 1.200,00"
    E mostra "Resultado do mês R$ 3.800,00"
    E mostra "A pagar R$ 1.258,90"
    E mostra "Saldo previsto R$ 6.090,60"

  Cenário: Fórmula do saldo previsto é explicada
    Quando Lucas abre a Home
    Então vê junto ao saldo previsto "Saldo atual menos o que ainda vai pagar neste mês"

  Cenário: Pagamento de fatura e transferência não são despesa
    Dado despesas realizadas de "R$ 1.200,00" em outubro de 2026
    E uma transferência de "R$ 1.000,00" e um pagamento de fatura de "R$ 479,00" em outubro de 2026
    Quando Lucas abre a Home
    Então "Despesas" mostra "R$ 1.200,00"

  Cenário: Compra no cartão conta no mês da compra
    Dado uma compra de "R$ 300,00" no cartão feita em 10/10/2026 que cai na fatura de novembro
    Quando Lucas abre a Home
    Então "Despesas" de outubro inclui "R$ 300,00"

  Cenário: Fatura aparece em linha própria e não duplica despesa
    Dado uma compra de "R$ 300,00" no cartão feita em 10/10/2026
    E uma fatura fechada de "R$ 479,00" com vencimento em 15/10/2026
    Quando Lucas abre a Home
    Então "A pagar" mostra a linha "Faturas R$ 479,00"
    E "Despesas" não soma "R$ 479,00"

  Cenário: Itens atrasados são destacados
    Dado a despesa prevista "Internet fibra" de "R$ 129,90" com vencimento em 04/10/2026
    Quando Lucas abre a Home
    Então "A pagar" mostra "1 atrasada R$ 129,90" com o selo "Atrasada"

  Cenário: Totais reconciliam com o Extrato
    Dado despesas realizadas de "R$ 1.200,00" e receitas de "R$ 5.000,00" em outubro de 2026
    Quando Lucas abre o Extrato filtrado por outubro de 2026
    Então o total de despesas do Extrato é "R$ 1.200,00"
    E o total de receitas do Extrato é "R$ 5.000,00"

  Cenário: Navegar para o mês anterior
    Dado despesas de "R$ 900,00" em setembro de 2026
    Quando Lucas navega para o mês anterior no Resumo do Mês
    Então o Resumo do Mês mostra "Despesas R$ 900,00"
    E o título mostra "Setembro de 2026"

  Cenário: Mês sem movimento
    Dado que não há lançamentos em novembro de 2026
    Quando Lucas navega para o mês seguinte no Resumo do Mês
    Então vê "Nada lançado neste mês ainda"
    E o resultado do mês é "R$ 0,00"

  Cenário: Saldo alto não esconde conta a pagar
    Dado o saldo atual de "R$ 1.000,00" e A pagar de "R$ 1.258,90" no mês
    Quando Lucas abre a Home
    Então o saldo previsto aparece como "-R$ 258,90" em destaque de atenção
    E vê o texto "Seu saldo não cobre o que falta pagar"

  Cenário: Família nova sem dados mantém o passo a passo
    Dado uma família sem contas nem lançamentos
    Quando Lucas abre a Home
    Então vê o passo a passo "1. Cadastre uma conta  2. Convide quem divide as contas  3. Faça seu primeiro lançamento"

  Cenário: Carregamento do resumo
    Quando a Home está carregando
    Então o Resumo do Mês mostra skeletons sem saltos de layout

  Cenário: Erro ao carregar o resumo
    Dado que o serviço está indisponível
    Quando Lucas abre a Home
    Então vê "Não foi possível carregar o resumo do mês" com o botão "Tentar de novo"
    E o botão "+" continua disponível

  Cenário: Resumo legível no celular e no desktop
    Dado viewports de 375 px e 1280 px
    Quando Lucas abre a Home
    Então o Resumo do Mês é legível sem rolagem horizontal
```

## Experiência (UX/estados)
[FLUXO-006](../../flows/FLUXO-006-home-resumo-do-mes.md): card herói no topo; cinco linhas com hierarquia (Resultado e Saldo previsto em destaque); "A pagar" expansível com Previstas/Faturas/Atrasadas; "Ver contas a pagar" leva a `/previstas`. Estados skeleton, vazio, erro e mês sem movimento.

## Fora de escopo
Receitas previstas (US-051, R3); tetos e disponibilidade por categoria (AP1); gráficos; comparativo entre meses; "Livre para gastar" com caixinhas (AP2, RN-015.7).

## Perguntas em aberto / pontos para o Tech Lead
- Agregado único (`GET` de resumo) reaproveitando as regras do Extrato para garantir RN-015.5; testes de reconciliação (propriedade: soma do resumo = soma do Extrato).
- Meses futuros: confirmar o cálculo de "A pagar" por vencimento no mês e o que o saldo previsto significa (hipótese do PO acima).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 8). **Substitui** os itens 1 a 3 da Home da [US-012](US-012-home-dashboard.md) (saldo como destaque, card de acerto e resumo simples).
- 2026-10-04 — **Revisão pós-TL (D-PO-42, D-PO-35):** tamanho 5 confirmado (limite superior; entregar API ➔ UI); depende também da US-027 (valores já em `Money`); saldo previsto em mês futuro documentado (TL-09).
