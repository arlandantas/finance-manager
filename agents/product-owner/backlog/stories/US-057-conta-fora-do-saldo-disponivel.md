# US-057 — Conta fora do saldo disponível (reserva)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Contas · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 3 |
| Status | Refinada (PO) · aguarda SDD/estimativa do TL |
| Depende de | US-032, US-026 |
| Rastreabilidade | feedback-usuario-v0 U6 · escopo-v0-alpha decisão (e) · NEED-004 |

## História
Como **membro da família**, quero **marcar uma conta como "não conta no saldo disponível" (ex.: reserva de emergência)**, para **o saldo disponível refletir só o dinheiro que posso gastar**.

## Regras
- Flag por conta, **padrão desligada**; editável ao criar/editar conta.
- A conta **continua movimentável** (receita, despesa, transferência) e visível em Contas, com selo "Reserva".
- Sai do **card de saldo disponível**, da soma de saldos e do saldo previsto; aparece à parte como **"Reservas"** (soma própria). Transferir disponível ➔ reserva reduz o disponível; reserva ➔ disponível aumenta.
- **Não** afeta o acerto do casal nem receitas/despesas do Resumo (só saldos).

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Conta fora do saldo disponível

  Contexto:
    Dado a conta "Corrente" com saldo "R$ 2.000,00"
    E a conta "Reserva" com saldo "R$ 10.000,00"

  Cenário: Marcar conta como reserva
    Quando Mariana marca "Reserva" como "não conta no saldo disponível"
    Então o saldo disponível mostra "R$ 2.000,00"
    E "Reservas" mostra "R$ 10.000,00"

  Cenário: Conta continua movimentável
    Dado "Reserva" marcada como fora do saldo disponível
    Quando Mariana transfere "R$ 500,00" de "Corrente" para "Reserva"
    Então o saldo disponível mostra "R$ 1.500,00"
    E "Reservas" mostra "R$ 10.500,00"

  Cenário: Saldo previsto também ignora a reserva
    Dado "Reserva" marcada como fora do saldo disponível
    Quando Mariana abre o saldo previsto
    Então a reserva não entra no cálculo

  Cenário: Desmarcar devolve ao disponível
    Dado "Reserva" marcada como fora do saldo disponível
    Quando Mariana desmarca a opção
    Então o saldo disponível mostra "R$ 12.000,00"

  Cenário: Acerto do casal não muda
    Dado "Reserva" marcada como fora do saldo disponível
    Então o acerto do mês tem os mesmos valores de antes
```

## Experiência
Opção "Não conta no saldo disponível" com texto de ajuda; selo "Reserva" na lista; linha "Reservas" no card; loading/vazio/erro; 375 e 1280 px; respeita ocultar valores.

## Fora de escopo
Metas/objetivos de poupança, rendimento, contas privadas (NEED-021).

## Para o Tech Lead
- Onde aplicar o filtro (fonte única do saldo disponível, soma e previsto); migração (default false).
