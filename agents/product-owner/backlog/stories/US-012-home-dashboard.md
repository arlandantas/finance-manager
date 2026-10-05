# US-012 — Home: visão essencial da família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-5 Visão Geral (Dashboard) · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 5,3 · 3 |
| Status | Refinada (PO) |
| Depende de | US-004, US-007, US-009 |
| Rastreabilidade | NEED-002 · NEED-006 (visões sintéticas) · NEED-007 · mvp-definition ("Dashboard minimalista") · FLUXO-001, FLUXO-003 |

## História
Como **membro da família**, quero **uma tela inicial que mostre saldos, o acerto do mês e os últimos lançamentos**, para **entender a situação em 3 segundos e lançar rápido**.

## Conteúdo da Home (de cima para baixo) — *versão da R1; a ordem vigente desde a R2.1 está no Histórico (US-025, US-026, US-029)*
1. **Saldo consolidado** da família (soma das contas) e lista de contas com saldo.
2. **Card "Acerto do mês"**: frase-herói do [FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md) (ou "Tudo certo neste mês"); toque abre o painel.
3. **Resumo do mês**: total de receitas, total de despesas e quanto cada membro gastou (percentual de participação).
4. **Últimos 5 lançamentos** com link "Ver extrato".
5. **Botão flutuante "+"** (lançamento rápido, US-005/US-006).

## Regras de negócio aplicáveis
- Totais do mês **excluem transferências e acertos**.
- *Quanto cada membro gastou* = despesas em que o membro é **quem pagou** (comuns e pessoais).
- Tudo derivado de dados da **própria família**.
- Nesta release o título é **"Saldo"**; "Livre para gastar" (NEED-009) só existe com caixinhas no AP2.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Home da família

  Cenário: Home com dados
    Dado contas "Itaú Mariana" (R$ 6.500,00) e "Nubank Conjunta" (R$ 849,50)
    Quando abro a Home
    Então vejo o Resumo do Mês
    E o card "Saldos das contas" recolhido com o total "R$ 7.349,50"
    E a linha "Acerto do mês" dentro do Resumo
    E os últimos 5 lançamentos

  Cenário: Resumo do mês exclui transferências e acertos
    Dado receitas de "R$ 5.000,00", despesas de "R$ 1.200,00" e uma transferência de "R$ 1.000,00"
    Quando abro a Home
    Então "Receitas" mostra "R$ 5.000,00" e "Despesas" mostra "R$ 1.200,00"

  Cenário: Participação por membro
    Dado que Mariana pagou "R$ 900,00" e Lucas "R$ 300,00" em despesas
    Quando abro a Home
    Então vejo "Mariana R$ 900,00 (75%)" e "Lucas R$ 300,00 (25%)"

  Cenário: Linha de acerto abre o painel
    Dado uma diferença a acertar de "R$ 380,00" no mês corrente
    Quando toco na linha "Acerto do mês"
    Então sou levado ao painel de acerto do mês corrente

  Cenário: Botão de lançamento rápido
    Quando toco no botão "+"
    Então o drawer de nova despesa abre com o foco no valor

  Cenário: Família nova sem dados
    Dado uma família sem contas nem lançamentos
    Quando abro a Home
    Então vejo um passo a passo: "1. Cadastre uma conta  2. Convide quem divide as contas  3. Faça seu primeiro lançamento"

  Cenário: Carregamento
    Quando a Home está carregando
    Então vejo skeletons nos blocos, sem saltos de layout

  Cenário: Layout responsivo
    Dado viewports de 375 px e 1280 px
    Quando abro a Home
    Então todos os blocos são legíveis e utilizáveis sem rolagem horizontal
```

## Fora de escopo
Gráficos, orçamento/disponibilidade por categoria (AP1), termômetro de liquidez (AP2), personalização de widgets, "Livre para gastar".

## Perguntas em aberto / pontos para o Tech Lead
- Definir se os agregados são calculados em consulta ou materializados (medir antes, ADR-001).

## Histórico
- 2026-10-04 — **Revisão pós-homologação (R2.1):** o layout (saldo em destaque, card "Acerto do mês" e resumo simples) é **substituído** pelo Resumo do Mês (US-025), card de saldos recolhível (US-026), indicador neutro de acerto (US-029) e detalhe da transação (US-036). Ver FLUXO-006.
- 2026-10-04 — **Cenários atualizados (D-PO-41, SDD-010 §9):** "Home com dados" e "Card de acerto abre o painel" refletem a Home reorganizada (Resumo do Mês, card de saldos recolhido e linha neutra de acerto; ver US-025, US-026, US-029). "Resumo do mês exclui transferências e acertos" e "Participação por membro" continuam válidos.
