# US-100 — Transferência prevista entre contas

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-26 Previsão unificada · **UR-2 (uso real)** — última da fila |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Could → Should** (sobe após a US-060) · 2,0 (V5/U2/R3) · **5** |
| Status | Proposta pelo PO em 2026-10-26; **precisa de ADR/SDD do TL** (família de previstas com `kind`: DESPESA, RECEITA, TRANSFERÊNCIA; ADR-023) |
| Depende de | **US-060** (saldo previsto por conta), **US-090** (porta única), US-010 (transferência real), US-018/019 (padrão de prevista); alinhar com **US-051** (receita prevista, mesmo `kind`) |
| Corte | Cortável; é a última da fila de prioridade do usuário |
| Rastreabilidade | **NEED-030** (RN-030.1..4, 030.6) · NEED-002, NEED-004, NEED-011, NEED-033 · FLUXO-018, FLUXO-019 · D-PO-105 |

## História
Como **membro da família**, quero **prever uma transferência entre contas (origem, destino, valor e data)**, para **que o saldo previsto de cada conta reflita o dinheiro que vou mover**.

## Regras
- **Cadastro:** na porta única (tipo **Transferência** + "Vai acontecer", US-090) ou na tela Previstas ("Nova transferência prevista"). Campos: **conta de origem**, **conta de destino** (diferentes, ativas, da família), **valor** (> 0), **data prevista**, descrição opcional.
- **Sem efeito até efetivar (RN-030.1):** não altera saldo, extrato, totais, acerto nem limite. Prevista segue a mesma disciplina das demais (`version`, exclusão lógica, atrasada se data < hoje).
- **Neutra para o orçamento (RN-030.2):** **não é despesa nem receita**, não entra nos totais do mês e **não entra em "A pagar"** (nem no total, nem na lista de dívidas, nem no Início). Aparece em lista própria: tela Previstas, aba/filtro **"Transferências"**.
- **Afeta o saldo previsto por conta (RN-030.3, RN-033.7):** na tabela da US-060, a coluna **"Transferências previstas"** (só aparece quando há) soma **saída (−) na origem e entrada (+) no destino** das transferências com data no mês escolhido; **saldo previsto = atual − a pagar ± transferências**. Em mês futuro vale D-PO-42.
- **Efetivar (RN-030.4):** "Efetivar" abre a transferência real (US-010) com valor e data efetivos (data ≤ hoje; valor padrão = previsto, pode diferir) e marca a prevista como EFETIVADA, **de forma atômica**. **Desfazer a transferência** devolve a prevista a PREVISTA (como o estorno da baixa). Efetivada não se edita nem exclui.
- **Travas das transferências (RN-030.6):** origem ≠ destino, mesma família, contas ativas; **conta arquivada** impede efetivar (mensagem clara) e é citada no diálogo de arquivar (US-054).
- **Permissões:** qualquer membro cadastra, edita, exclui e efetiva (como a transferência real hoje); sem "Só meu" (TL-U6 confirma). Registro do autor no histórico.
- Receita/despesa prevista e esta compartilham a **mesma porta e os mesmos padrões de lista**, mas **efeitos distintos** (esta é neutra).
- Liquidez de 7 dias (NEED-011): considerar a transferência prevista fica para quando o termômetro existir.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Transferência prevista entre contas

  Contexto:
    Dado a "Família Silva" com as contas "Salário" de "R$ 5.000,00" e "Contas fixas" de "R$ 300,00"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Prever uma transferência
    Quando Mariana prevê a transferência de "R$ 2.000,00" de "Salário" para "Contas fixas" em 20/10/2026
    Então vê "Transferência prevista cadastrada"
    E os saldos de "Salário" e "Contas fixas" não mudam
    E o Extrato não mostra a transferência

  Cenário: Não é despesa, receita nem a pagar
    Dado a transferência prevista de "R$ 2.000,00" de "Salário" para "Contas fixas"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então o total de "A pagar" não inclui "R$ 2.000,00"
    E os totais de despesa e receita do mês não mudam

  Cenário: Afeta o saldo previsto por conta
    Dado a transferência prevista de "R$ 2.000,00" de "Salário" para "Contas fixas" em 20/10/2026
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Salário" mostra transferências "−R$ 2.000,00" e previsto "R$ 3.000,00"
    E "Contas fixas" mostra transferências "+R$ 2.000,00" e previsto "R$ 2.300,00"

  Cenário: Coluna de transferências só aparece quando há
    Dado que não há transferências previstas no mês
    Quando Mariana abre "A pagar" de outubro de 2026
    Então não aparece a coluna "Transferências previstas"

  Cenário: Efetivar vira transferência real
    Dado a transferência prevista de "R$ 2.000,00" de "Salário" para "Contas fixas"
    Quando Mariana efetiva com o valor "R$ 2.000,00" em 12/10/2026
    Então "Salário" passa a "R$ 3.000,00" e "Contas fixas" a "R$ 2.300,00"
    E o Extrato mostra a transferência real
    E a prevista aparece como "Efetivada"

  Cenário: Desfazer devolve a prevista
    Dado a transferência efetivada
    Quando Mariana desfaz a transferência
    Então os saldos voltam
    E a prevista volta a "Prevista"

  Cenário: Origem e destino devem ser diferentes
    Quando Mariana prevê a transferência de "Salário" para "Salário"
    Então vê "Origem e destino devem ser diferentes"

  Cenário: Conta arquivada impede efetivar
    Dado a transferência prevista para "Contas fixas" e a conta arquivada
    Quando Mariana tenta efetivar
    Então vê que a conta de destino está arquivada

  Cenário: Atrasada
    Dado a transferência prevista para 05/10/2026 ainda não efetivada
    Quando Mariana abre "Previstas"
    Então a transferência aparece como "Atrasada"

  Cenário: Efetivar com valor diferente
    Dado a transferência prevista de "R$ 2.000,00"
    Quando Mariana efetiva com o valor "R$ 1.800,00"
    Então a transferência real é de "R$ 1.800,00"
```

## Fora de escopo
Aporte automático ou transferência automática (o app não movimenta dinheiro real); recorrência (US-101); liquidez de 7 dias; sugerir transferência para cobrir saldo negativo.
