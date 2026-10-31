# US-060 — Resumo por conta na tela "A pagar" (saldo previsto por conta)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **UR-1 (uso real, 1ª da fila)** — antes "v0 alpha (Should)" |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Must** (subiu de Should; prioridade 1 do usuário, 2026-10-26) · 4,2 (V9/U7/R5) · **5** (era 3: ganhou a coluna de saldo previsto por conta, a linha "Sem conta definida" e a regra do "Só meu") |
| Status | **Entregue e aceita pelo Gestor (D-GES-65)** (TASK-054) (2026-10-30): [SDD-029](../../../tech-lead/sdd/SDD-029-resumo-por-conta-no-a-pagar-us-060.md). 8 dos 9 cenários verdes; "Fatura entra na conta pagadora" fica `@pendente-us-089` |
| Depende de | US-059, US-055, US-057 (todas implementadas). **Completa-se com** US-089 (fatura na conta pagadora), US-051 (receita prevista) e US-100 (transferência prevista): sem elas as linhas ficam como abaixo, sem quebrar |
| Corte | Não cortar: é a 1ª do pacote do uso real |
| Rastreabilidade | **NEED-033** (RN-033.1..7) · **Q-U24 (usuário, 2026-10-26)** · feedback-usuario-v0 U3 · escopo-v0-alpha (d) · NEED-003, NEED-004, NEED-011 · FLUXO-018 · D-PO-99 |

## História
Como **membro da família**, quero **ver, para o mês escolhido, uma tabela por conta com saldo atual, o que ainda sai dela e o saldo previsto**, para **saber se alguma conta não aguenta o mês antes do vencimento**.

## Regras
- Bloco no topo do "A pagar" (abaixo do seletor de mês): uma linha por conta com **Saldo atual · A pagar (em aberto, que sai dessa conta) · Saldo previsto = atual − a pagar**.
- **Recorte do mês = o mesmo de "A pagar"** (vencimento no mês; no mês corrente, mais os atrasados anteriores). A **soma da coluna "A pagar" de todas as linhas** (incluindo "Sem conta definida") é **igual ao total de "A pagar"** do mesmo recorte e ao do Resumo do Mês (mesma fonte, `collectOpenPayables`).
- **Saldo atual** é o saldo de hoje da conta; em mês futuro vale D-PO-42 (saldo atual menos só os vencimentos daquele mês, sem projeção acumulada).
- **Q-U24 (usuário):** o "a pagar" da conta **inclui previstas "Só meu" de outro membro**. Todos já enxergam o lançamento; só o controle é restrito. O saldo previsto exibido, portanto, nunca diverge do real por causa de privacidade.
- **Previstas sem conta de pagamento** não somem: linha **"Sem conta definida"** (só com "A pagar", sem saldo).
- **Fatura do cartão em aberto** entra na **conta pagadora padrão do cartão** quando existir (US-089); sem ela, em "Sem conta definida". Fatura de cartão sem conta continua com o rótulo "Fatura" na lista.
- **Saldo previsto negativo é destacado** com cor **e** texto ("Falta R$ X"), sem bloqueio (como já ocorre com conta negativa); nunca só cor (NEED-017).
- Contas "fora do saldo disponível" (US-057) aparecem só se tiverem a pagar; conta arquivada só se ainda tiver a pagar.
- **Nada grava**: o saldo previsto é um número derivado; o saldo real, o extrato, os totais e o acerto não mudam (prevista segue sem efeito até a baixa).
- Receita prevista (US-051) e transferência prevista (US-100) **entram no saldo previsto quando existirem** (RN-033.7): coluna "A receber"/"Transferências" aparece **só** quando há valores; sem elas, o cálculo desta história permanece.
- Ocultar valores (US-027) mascara todos os números; a ordem das linhas segue o saldo previsto crescente (as que faltam primeiro), depois o nome.
- Estados: skeleton, vazio ("Nada a pagar neste mês" mantém as contas com saldo), erro com "Tentar de novo". Mobile 375 px: cada conta vira um cartão (nome + três valores rotulados), sem rolagem horizontal.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Resumo por conta no A pagar

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Saldo previsto por conta
    Dado "Corrente" com saldo "R$ 1.000,00"
    E previstas de "R$ 650,00" e "R$ 120,00" com "Pagar com: Corrente" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" mostra atual "R$ 1.000,00", a pagar "R$ 770,00" e previsto "R$ 230,00"

  Cenário: Conta que vai faltar
    Dado "Corrente" com saldo "R$ 500,00" e a pagar "R$ 770,00"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" destaca "Falta R$ 270,00"

  Cenário: Prevista sem conta
    Dado uma prevista de "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    Então aparece a linha "Sem conta definida" com "R$ 100,00"

  Cenário: Prevista Só meu de outro membro entra no cálculo
    Dado "Corrente" com saldo "R$ 1.000,00"
    E Lucas tem uma prevista "Só meu" de "R$ 300,00" com "Pagar com: Corrente"
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" mostra a pagar "R$ 300,00" e previsto "R$ 700,00"

  Cenário: A soma das contas bate com o total de A pagar
    Dado previstas de "R$ 650,00" na "Corrente", "R$ 200,00" na "Poupança" e "R$ 100,00" sem conta
    Quando Mariana abre "A pagar" de outubro de 2026
    Então o total de "A pagar" é "R$ 950,00"
    E a soma das linhas por conta, incluindo "Sem conta definida", é "R$ 950,00"

  Cenário: Fatura entra na conta pagadora do cartão
    Dado o cartão "Nubank Lucas" com conta pagadora "Corrente" e fatura fechada de "R$ 1.500,00" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Corrente" inclui "R$ 1.500,00" na coluna "A pagar"

  Cenário: Fatura de cartão sem conta pagadora
    Dado o cartão "Nubank Lucas" sem conta pagadora e fatura fechada de "R$ 1.500,00" vencendo em outubro
    Quando Mariana abre "A pagar" de outubro de 2026
    Então "Sem conta definida" inclui "R$ 1.500,00"

  Cenário: Prevista paga sai do cálculo
    Dado "Corrente" com saldo "R$ 1.000,00" e a pagar "R$ 770,00"
    Quando Mariana dá baixa em uma prevista de "R$ 650,00" pela "Corrente"
    Então "Corrente" mostra atual "R$ 350,00" e a pagar "R$ 120,00"
    E o previsto continua "R$ 230,00"

  Cenário: Valores ocultos
    Dado que os valores estão ocultos
    Quando Mariana abre "A pagar" de outubro de 2026
    Então os valores por conta aparecem mascarados
    E o aviso "Falta" continua visível sem número
```

## Fora de escopo
Sugerir transferência para cobrir o saldo; projeção acumulada entre meses (AP1); alterar saldo real. Transferência prevista e receita prevista têm história própria (US-100, US-051).
