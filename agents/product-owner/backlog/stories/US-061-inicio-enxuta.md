# US-061 — Início enxuta: ações rápidas, vence em breve, extrato recente

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 5 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | US-055 (faturas no A pagar); US-058/059 para as recorrentes aparecerem |
| Rastreabilidade | feedback-usuario-v0 U2 · escopo-v0-alpha decisão (a) · NEED-003, NEED-015 |

## História
Como **membro da família**, quero **uma Início simples com lançar, o que vence nos próximos dias e o extrato recente**, para **acompanhar o dia a dia em segundos**.

## Regras
- Ordem: (1) **ações rápidas** (nova despesa, receita, transferência); (2) **"Vence nos próximos dias"**: previstas e faturas pendentes dos próximos **7 dias** + atrasadas, por vencimento, com "Ver tudo" ➔ A pagar; (3) **extrato recente**: últimos **10** lançamentos, com "Ver extrato".
- **Resumo do mês e saldos** num **card colapsado (fechado por padrão)** com um número-síntese; ao expandir mostram os **mesmos valores de hoje** (nenhum cálculo muda). Aberto/fechado lembrado por dispositivo.
- Fonte única com a tela A pagar (mesmas linhas e valores).

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Início enxuta

  Cenário: Estrutura inicial
    Quando Mariana abre o app
    Então vê ações rápidas, "Vence nos próximos dias" e "Extrato recente"
    E o card "Resumo do mês" está fechado

  Cenário: Vence nos próximos dias inclui fatura
    Dado a prevista "Condomínio" vencendo em 3 dias e a fatura "Nubank" vencendo em 5 dias
    Quando Mariana abre o app
    Então vê as duas linhas ordenadas por vencimento

  Cenário: Item fora da janela não aparece
    Dado uma prevista vencendo em 20 dias
    Quando Mariana abre o app
    Então ela não aparece em "Vence nos próximos dias"

  Cenário: Expandir o resumo mostra os valores de hoje
    Quando Mariana expande o card "Resumo do mês"
    Então vê os mesmos valores do Resumo do Mês

  Cenário: Extrato recente limitado
    Dado 25 lançamentos no mês
    Quando Mariana abre o app
    Então "Extrato recente" mostra os 10 mais recentes

  Cenário: Nada a vencer
    Dado nenhuma prevista ou fatura nos próximos 7 dias
    Quando Mariana abre o app
    Então vê "Nada vence nos próximos dias"
```

## Experiência
Skeleton, vazio e erro por bloco; 375 e 1280 px; respeita ocultar valores.

## Fora de escopo
Gráficos, personalização da Início, notificações.
