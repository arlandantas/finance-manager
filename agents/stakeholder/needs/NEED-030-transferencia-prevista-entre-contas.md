# NEED-030: Transferência Prevista entre Contas

## 📋 Metadados
- **ID:** `NEED-030`
- **Área:** Contas e Previstas (estende NEED-002 e NEED-004; alimenta NEED-011)
- **Status:** Levantado em 2026-10-26 (uso real, item 5) — aguardando Q-U20
- **Prioridade de valor:** **Could → Should** (sobe se o saldo previsto por conta, NEED-033, for entregue)
- **Consumidores:** Product Owner, Tech Lead
- **Origem:** Item 5 do feedback de uso real

---

## 1. Dor
A família sabe que no dia 10 vai mover R$ 2.000 da conta do salário para a conta das contas fixas, ou que vai guardar um valor na reserva. Como só despesas podem ser previstas, esse movimento fica de fora da previsão: o **saldo previsto da conta de origem parece maior** do que será e o de destino menor, e a pessoa tem que lembrar de fazer a transferência.

## 2. Situação atual (verificada)
- Previsão só de **despesa** (`estado/previstas-series.md`); receita prevista só especificada (US-051), sem código.
- Transferência real existe (2 pernas atômicas, `lancamentos-contas-extrato.md` regra 14), não é despesa nem receita e não entra em totais nem acerto.
- Não há "transferência prevista" nem na tela nem no modelo.

## 3. Regras de negócio propostas (RN)
- **RN-030.1:** é possível prever uma transferência futura (origem, destino, valor, data); ela não altera saldo, extrato, totais ou acerto até ser **efetivada** (mesma regra das previstas).
- **RN-030.2 (neutra para o orçamento):** transferência prevista **não conta como despesa** nem como receita nos totais do mês (RN12 vigente) e não aparece em "contas a pagar" como dívida.
- **RN-030.3:** ela **afeta o saldo previsto por conta** (NEED-033): sai da origem e entra no destino na data prevista, e é visível ao avaliar liquidez (NEED-011).
- **RN-030.4:** efetivar vira uma transferência real com valor e data efetivos (como a baixa da prevista); desfazer devolve o estado.
- **RN-030.5:** recorrência (ex.: todo mês) é desejável mas não é pré-requisito (Q-U20).
- **RN-030.6:** as mesmas travas das transferências (contas diferentes, família, conta arquivada) valem.

## 4. Conflitos com regras vigentes
| Regra vigente | Conflito | Proposta |
| :--- | :--- | :--- |
| "Prevista = compromisso de despesa" | Conceito ampliado | Depende da decisão de receita prevista (NEED-031/US-051, ADR-023): uma só família de "previstas" com tipo |
| Transferência fora de totais | Prevista também fica de fora | Consistente |
| "A pagar" lista despesas e faturas | Transferência prevista não é "a pagar" | Fica em lista própria ou filtro; desenho é do PO |

## 5. Perguntas em aberto
- **Q-U20:** a transferência prevista precisa **repetir todo mês** (ex.: aporte fixo)? Hipótese: pontual primeiro; recorrência depois.
