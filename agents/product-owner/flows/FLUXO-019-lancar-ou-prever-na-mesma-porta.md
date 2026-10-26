# FLUXO-019: Lançar ou prever na mesma porta (inclui repetir, assinatura e transferência prevista)

- **Objetivo**: uma única interface para o gesto mais frequente: "esta despesa já aconteceu ou vai acontecer?", sem piorar a meta de lançar em < 10 s.
- **Personas**: Mariana (lança no mercado), Lucas (cadastra contas fixas e assinaturas).
- **Rastreabilidade**: [NEED-031](../../stakeholder/needs/NEED-031-previsao-na-mesma-porta-do-lancamento.md) (Q-U21), [NEED-029](../../stakeholder/needs/NEED-029-assinatura-recorrente-no-cartao.md), [NEED-030](../../stakeholder/needs/NEED-030-transferencia-prevista-entre-contas.md) · [US-090](../backlog/stories/US-090-prever-na-mesma-porta-do-lancamento.md), [US-091](../backlog/stories/US-091-repetir-todo-mes-na-mesma-porta.md), [US-096](../backlog/stories/US-096-assinatura-mensal-no-cartao.md), [US-100](../backlog/stories/US-100-transferencia-prevista.md), [US-101](../backlog/stories/US-101-transferencia-prevista-recorrente.md), [US-085](../backlog/stories/US-085-destaque-despesa-receita.md) · estende [FLUXO-001](FLUXO-001-lancamento-rapido.md) e [FLUXO-005](FLUXO-005-despesas-previstas.md) · D-PO-102

## 1. Diagrama

```mermaid
flowchart TD
    FAB["FAB '+' / Nova despesa"] --> TIPO["Tipo: Despesa | Receita | Transferência (seletor único, US-085)"]
    TIPO --> QUANDO{"Quando?"}
    QUANDO -->|Já aconteceu (padrão)| REAL["Lançamento real: data não futura, conta ou cartão"]
    QUANDO -->|Vai acontecer| PREV["Prevista: vencimento, 'Pagar com' opcional, 'Só meu' por padrão"]
    QUANDO -->|Cartão escolhido| ASSIN["Assinatura (todo mês): US-096"]
    PREV --> REP{"Repetir?"}
    REP -->|Não| SAVEP["Salvar previsão"]
    REP -->|Todo mês| SERIE["Série mensal: dia, início, fim, Pagar com obrigatório"]
    REAL --> SAVE["Salvar lançamento"]
    SAVEP --> APAGAR["A pagar (não muda saldo nem extrato)"]
    SERIE --> APAGAR
    SAVE --> EXTRATO["Extrato e saldos"]
    TIPO -->|Transferência + Vai acontecer| TPREV["Transferência prevista (US-100): origem, destino, valor, data"]
    TPREV -->|Repetir todo mês| TSERIE["Série de transferências (US-101)"]
    TPREV --> PREVIAS["Previstas ▸ Transferências + coluna no resumo por conta"]
```

## 2. Especificação de interface
1. **Uma tela**, os mesmos campos (valor, descrição, categoria, responsável, conta/cartão, divisão, "Só meu", tags); **"Quando?" é um segundo seletor segmentado**, logo abaixo do tipo, com **"Já aconteceu" selecionado por padrão**: quem só lança não faz nenhum toque a mais.
2. **Efeito explícito antes de salvar**: linha de apoio muda com o modo ("entra no extrato e nos saldos agora" / "fica em A pagar até você dar baixa; não muda saldo nem extrato") e o botão vira "Salvar lançamento" / "Salvar previsão".
3. **Campos que só existem em "Vai acontecer"**: vencimento (data pode ser futura), "Pagar com" (opcional), "Repetir: Não | Todo mês" (dia, início, fim; "Pagar com" obrigatório se repete).
4. **Padrões por modo**: previsão nasce "Só meu"; lançamento real segue o padrão atual; ao trocar de modo aparece "Padrão deste modo: …" e **nada digitado se perde**.
5. **Cartão escolhido**: "Vai acontecer" some (compra no cartão não tem data futura); aparece **"Assinatura (todo mês)"** (US-096), com dia de cobrança, fim e quem gastou.
6. **Tipo Transferência**: origem e destino; "Já aconteceu" = transferência real (US-010); "Vai acontecer" = transferência prevista (neutra, fora de "A pagar").
7. **Receita + Vai acontecer** só aparece quando a US-051 existir.
8. Mobile 375 px: cabe sem rolagem com os campos principais (US-086); desktop: o mesmo drawer centrado.

## 3. Regras
A unificação é só de **porta**: cada modo chama o mesmo serviço de hoje (lançamento, prevista, série, transferência) com as mesmas regras e travas (SEC-025/026/038). Tela "Previstas" e cadastros próprios continuam existindo.

## 4. Histórico
- 2026-10-26 — Criado no refinamento do uso real (NEED-031/029/030).
