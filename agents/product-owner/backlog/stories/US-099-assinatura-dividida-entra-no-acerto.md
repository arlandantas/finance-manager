# US-099 — Assinatura dividida entra no acerto

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão / EPIC-20 · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,0 (V4/U2/R3) · **3** |
| Status | Proposta pelo PO em 2026-10-26; precisa de decisão do TL sobre qual percentual vale em cada cobrança (TL-U5) |
| Depende de | **US-096**, EN-002 (percentual por lançamento, implementada), US-028/030, US-043 |
| Corte | Cortável: sem ela a assinatura é "Só meu" (padrão) |
| Rastreabilidade | **NEED-029** (RN-029.6) · **Q-U19 (usuário, 2026-10-26)** · NEED-007, NEED-018, NEED-019 · `estado/acerto-divisao.md` · D-PO-104 |

## História
Como **membro da família**, quero **dividir uma assinatura com a família e vê-la no acerto**, para **que o streaming compartilhado seja rateado como qualquer despesa comum**.

## Regras
- **Q-U19 (usuário):** a assinatura **dividida entra no acerto** de contas, **desde que a divisão esteja ligada**; senão é "Só meu" (padrão de "Dividir" desligado, US-030). O parcelado fora do acerto (US-042 não liberada) **não** se aplica: assinatura não é parcelamento.
- Cada cobrança lançada é uma despesa dividida normal: **entra no acerto pelo valor e pela data da cobrança** (competência = mês da cobrança), com o **percentual gravado no lançamento** (EN-002) conforme a regra de divisão vigente **na data em que é lançada** (hipótese do PO, TL-U5 confirma). Mudar a regra familiar depois não reescreve cobranças já lançadas.
- Pagador/quem gastou da assinatura é o **responsável** escolhido; o crédito do acerto vai a ele (regra do cartão: quem comprou, não quem paga a fatura, Q-20).
- **Dividir exige acerto ligado** (`assertCanShare`); acerto desligado ⇒ o formulário não oferece "Dividir" e a assinatura nasce "Só meu".
- Tornar uma assinatura "Só meu" ⇄ dividida vale **da próxima cobrança em diante**; as já lançadas mantêm seu estado (a tela avisa).
- Membro sem conta (US-093) pode ser responsável e participante da divisão.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Assinatura dividida no acerto

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas" e regra de divisão 50% e 50%
    E o acerto de contas está ligado
    E o cartão "Nubank Lucas"
    E Lucas está autenticado

  Cenário: Assinatura dividida entra no acerto
    Quando Lucas cadastra a assinatura "Streaming" de "R$ 40,00" dividida
    E a cobrança de outubro é lançada
    Então o Acerto mostra "Mariana" devendo "R$ 20,00" a "Lucas"

  Cenário: Assinatura Só meu fica fora do acerto
    Quando Lucas cadastra a assinatura "Música" de "R$ 20,00" como "Só meu"
    E a cobrança de outubro é lançada
    Então o Acerto não inclui "Música"

  Cenário: Cada cobrança entra pelo mês em que foi lançada
    Dado a assinatura "Streaming" dividida de "R$ 40,00"
    Quando a cobrança de novembro é lançada
    Então o Acerto de novembro inclui "R$ 40,00" de "Streaming"
    E o Acerto de outubro não muda

  Cenário: Mudar a regra familiar não reescreve o passado
    Dado a cobrança de outubro lançada com 50% e 50%
    Quando a regra familiar muda para 70% e 30% em novembro
    Então a cobrança de outubro continua 50% e 50%
    E a de novembro usa 70% e 30%

  Cenário: Acerto desligado não oferece dividir
    Dado que o acerto de contas está desligado
    Quando Lucas abre "Nova assinatura"
    Então não vê a opção "Dividir"

  Cenário: Alternar para dividida vale da próxima cobrança
    Dado a cobrança de outubro lançada "Só meu"
    Quando Lucas altera a assinatura para dividida
    Então a cobrança de outubro continua "Só meu"
    E vê o aviso "Vale a partir da próxima cobrança"
```

## Fora de escopo
Dividir cobranças já lançadas em lote; regras de divisão por assinatura diferentes da familiar além da US-043.
