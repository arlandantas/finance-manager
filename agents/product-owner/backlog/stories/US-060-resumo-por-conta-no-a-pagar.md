# US-060 — Resumo por conta na tela "A pagar"

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **v0 alpha (Should)** |
| MoSCoW · Tamanho (PO) | **Should** · 3 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | US-059, US-055, US-057 |
| Corte | 2º a cortar dos Should (ver `release-v0-alpha.md`) |
| Rastreabilidade | feedback-usuario-v0 U3 · escopo-v0-alpha decisão (d) · NEED-003, NEED-004 |

## História
Como **membro da família**, quero **ver por conta o saldo atual, o total em aberto e o saldo previsto**, para **saber se falta dinheiro em alguma conta antes de vencer**.

## Regras
- Bloco no topo do "A pagar": uma linha por conta com **Saldo atual · A pagar (previstas dessa conta) · Saldo previsto = atual − a pagar**.
- Saldo previsto negativo é destacado (cor + texto "Falta R$ X").
- Contas "fora do saldo disponível" (US-057) aparecem só se tiverem a pagar. Previstas sem conta ficam em "Sem conta definida".

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Resumo por conta no A pagar

  Cenário: Saldo previsto por conta
    Dado "Corrente" com saldo "R$ 1.000,00"
    E previstas de "R$ 650,00" e "R$ 120,00" com "Pagar com: Corrente"
    Quando Mariana abre "A pagar"
    Então "Corrente" mostra atual "R$ 1.000,00", a pagar "R$ 770,00" e previsto "R$ 230,00"

  Cenário: Conta que vai faltar
    Dado "Corrente" com saldo "R$ 500,00" e a pagar "R$ 770,00"
    Quando Mariana abre "A pagar"
    Então "Corrente" destaca "Falta R$ 270,00"

  Cenário: Prevista sem conta
    Dado uma prevista de "R$ 100,00" sem conta
    Quando Mariana abre "A pagar"
    Então aparece a linha "Sem conta definida" com "R$ 100,00"
```

## Fora de escopo
Sugerir transferência para cobrir o saldo; transferência agendada (pós-v0).
