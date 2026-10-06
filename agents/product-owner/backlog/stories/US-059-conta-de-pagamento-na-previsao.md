# US-059 — Conta de pagamento na despesa prevista

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 2 |
| Status | Refinada (PO) · aguarda estimativa do TL |
| Depende de | US-006, US-019; entregue **junto com** a US-058 |
| Rastreabilidade | feedback-usuario-v0 U3 · escopo-v0-alpha decisão (d) · NEED-003, NEED-004 |

## História
Como **membro da família**, quero **dizer de qual conta cada despesa prevista vai sair**, para **saber o caixa necessário por conta**.

## Regras
- Campo **"Pagar com"** na prevista (e na série recorrente): conta ou cartão ativos; sugestão padrão = **conta mais usada** do usuário; editável.
- Na **baixa**, o campo vem preenchido com a conta prevista (pode trocar).
- Previstas antigas sem conta continuam válidas (escolhe-se na baixa).
- Conta arquivada nunca é sugerida (US-023).

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Conta de pagamento na previsão

  Cenário: Informar a conta ao prever
    Quando Mariana cria a prevista "Condomínio" de "R$ 650,00" com "Pagar com: Corrente"
    Então a prevista mostra "Corrente"

  Cenário: Baixa usa a conta prevista
    Dado a prevista "Condomínio" com "Pagar com: Corrente"
    Quando Mariana dá baixa
    Então o campo conta vem com "Corrente"
    E o saldo de "Corrente" diminui "R$ 650,00"

  Cenário: Sugestão padrão
    Dado que a conta mais usada de Mariana é "Corrente"
    Quando Mariana abre o formulário de prevista
    Então "Pagar com" vem com "Corrente"

  Cenário: Prevista antiga sem conta
    Dado uma prevista sem conta
    Quando Mariana dá baixa
    Então Mariana escolhe a conta na baixa
```

## Fora de escopo
Resumo por conta (US-060), pagamento parcial.
