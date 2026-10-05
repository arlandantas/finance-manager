# US-023 — Conta de origem padrão inteligente nos pagamentos

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-19 Ergonomia e Preferências · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must · 3,3 · 3 |
| Status | **Especificada** (SDD-013, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-017b (pagar fatura), US-019 (dar baixa) |
| Corte | **Não cortar** (ressalva 3 da homologação) |
| Rastreabilidade | Homologação achado 3 · Parecer ressalva 3 · NEED-004 (RN-004.x conta de origem padrão) · NEED-003 · FLUXO-012 · D-PO-19 |

## História
Como **membro da família**, quero que **a conta de origem sugerida ao pagar fatura ou dar baixa tenha saldo suficiente**, para **não ver o aviso de "conta ficará negativa" sem necessidade**.

## Regras de negócio aplicáveis
Ordem de escolha da conta **sugerida** (editável; saldo insuficiente continua só **avisando**, D-PO-08):
1. **Conta ativa de titularidade do responsável** (previsão) ou do **titular do cartão** (fatura) **com saldo ≥ valor**; se houver várias, a **mais usada** por quem está pagando; empate ⇒ a de **maior saldo**.
2. Qualquer **outra conta ativa com saldo ≥ valor** (mesmo critério de desempate).
3. Se **nenhuma** conta cobre o valor: a de **maior saldo**, com o aviso normal.
- **Nunca** é sugerida "a última conta usada" quando ela ficaria negativa e existe alternativa suficiente.
- Aplica-se a: **Pagar fatura** (US-017b) e **Dar baixa** (US-019). O **lançamento de despesa** (US-005) mantém "última conta usada" (é escolha de quem está gastando; ver FLUXO-012).
- O seletor mostra o **saldo** de cada conta e **marca** as que não cobrem o valor ("saldo insuficiente").
- Ao mudar o valor pago na baixa, a sugestão **não troca sozinha** depois que o usuário escolheu a conta; antes da escolha, recalcula.
- Contas **arquivadas** nunca são sugeridas (US-032).
- Respeita "ocultar valores" (saldos mascarados; marcação "saldo insuficiente" permanece).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Conta de origem padrão nos pagamentos

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a conta "Dinheiro" de "Lucas" com saldo "R$ 90,00"
    E a conta "Itaú Lucas" de "Lucas" com saldo "R$ 3.000,00"
    E a conta "Itaú Mariana" de "Mariana" com saldo "R$ 6.500,00"
    E Lucas está autenticado

  Cenário: Sugestão não usa a última conta se ela ficaria negativa
    Dado que a última conta usada por Lucas foi "Dinheiro"
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"
    E não vê o aviso "A conta de origem ficará negativa"

  Cenário: Prefere a conta do titular com saldo suficiente
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"

  Cenário: Baixa usa a conta do responsável com saldo suficiente
    Dado a despesa prevista "Condomínio" de "R$ 650,00" com responsável "Lucas"
    Quando Lucas abre "Dar baixa" em "Condomínio"
    Então a conta de origem sugerida é "Itaú Lucas"

  Cenário: Titular sem saldo suficiente cai para outra conta com saldo
    Dado a despesa prevista "Reforma" de "R$ 4.000,00" com responsável "Lucas"
    Quando Lucas abre "Dar baixa" em "Reforma"
    Então a conta de origem sugerida é "Itaú Mariana"

  Cenário: Nenhuma conta cobre o valor
    Dado a despesa prevista "Viagem" de "R$ 9.000,00" com responsável "Lucas"
    Quando Lucas abre "Dar baixa" em "Viagem"
    Então a conta de origem sugerida é "Itaú Mariana"
    E vê o aviso "A conta de origem ficará negativa" com o botão "Confirmar mesmo assim"

  Cenário: Desempate pela conta mais usada
    Dado que Lucas usou "Itaú Lucas" 5 vezes e uma segunda conta sua "Bradesco Lucas" com saldo "R$ 3.500,00" 1 vez
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Lucas"

  Cenário: Seletor marca contas sem saldo suficiente
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre a lista de contas de origem
    Então "Dinheiro" aparece com "saldo insuficiente"
    E "Itaú Lucas" aparece sem marcação

  Cenário: Usuário escolhe outra conta e a escolha é respeitada
    Dado uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas escolhe manualmente "Dinheiro"
    Então vê o aviso "A conta de origem ficará negativa"
    E a sugestão não volta para "Itaú Lucas" sozinha

  Cenário: Mudar o valor antes de escolher recalcula a sugestão
    Dado a despesa prevista "Reforma" de "R$ 2.000,00" com responsável "Lucas"
    E Lucas abriu "Dar baixa" em "Reforma" sem escolher a conta
    Quando Lucas altera o valor pago para "R$ 4.000,00"
    Então a conta de origem sugerida passa a "Itaú Mariana"

  Cenário: Conta arquivada nunca é sugerida
    Dado que a conta "Itaú Lucas" foi arquivada
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre "Pagar fatura"
    Então a conta de origem sugerida é "Itaú Mariana"

  Cenário: Família com uma única conta
    Dado uma família com apenas a conta "Dinheiro" com saldo "R$ 90,00"
    E uma fatura fechada de "R$ 479,00" do cartão "Nubank Lucas" cujo titular é "Lucas"
    Quando Lucas abre "Pagar fatura"
    Então a conta de origem sugerida é "Dinheiro"
    E vê o aviso "A conta de origem ficará negativa"
```

## Experiência (UX/estados)
[FLUXO-012](../../flows/FLUXO-012-conta-de-origem-padrao.md): campo "Pagar com" nos drawers de pagamento mostra a conta sugerida com o motivo em texto secundário ("Conta do titular com saldo suficiente").

## Fora de escopo
Conta de liquidação gravada na previsão (futuro, depende de NEED-004 fase 2); dividir um pagamento em duas contas; mudar o padrão do lançamento de despesa.

## Perguntas em aberto / pontos para o Tech Lead
- Onde calcular a sugestão (servidor, junto com o DTO da fatura/previsão, ou cliente) e como medir "mais usada" sem nova tabela (contagem sobre lançamentos recentes).

## Histórico
- 2026-10-04 — Criada a partir da ressalva 3 da homologação.
