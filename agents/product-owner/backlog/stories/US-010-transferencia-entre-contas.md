# US-010 — Transferir dinheiro entre contas da família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-2 Contas & Movimentações · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,3 · 3 |
| Status | Refinada (PO) |
| Depende de | US-004 |
| Rastreabilidade | NEED-002 · RN-002.2, RN-002.3 · ADR-001 (atomicidade) |

## História
Como **membro da família**, quero **registrar uma transferência entre duas contas da família**, para que **os saldos reflitam a realidade sem distorcer gastos ou receitas**.

## Regras de negócio aplicáveis
- Uma operação debita a **origem** e credita o **destino** do **mesmo valor**, **atomicamente** (tudo ou nada).
- **Não altera o patrimônio total** (RN-002.3) e **não conta como despesa ou receita** em extrato, totais ou acerto.
- Origem ≠ destino; valor > 0 (centavos inteiros).
- O histórico preserva o **vínculo entre as duas pernas**.
- Pode deixar a origem negativa (aviso, sem bloqueio).
- Autor automático; data padrão hoje, sem data futura.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Transferência entre contas

  Cenário: Transferir com sucesso
    Dado "Itaú Lucas" com "R$ 3.000,00" e "Nubank Conjunta" com "R$ 500,00"
    Quando Lucas transfere "R$ 1.000,00" de "Itaú Lucas" para "Nubank Conjunta"
    Então "Itaú Lucas" fica com "R$ 2.000,00" e "Nubank Conjunta" com "R$ 1.500,00"
    E o saldo consolidado da família permanece "R$ 3.500,00"

  Cenário: Transferência aparece vinculada no extrato
    Quando abro o extrato após a transferência
    Então vejo uma linha de saída em "Itaú Lucas" e uma de entrada em "Nubank Conjunta"
    E ambas indicam que fazem parte da mesma transferência

  Cenário: Não é despesa nem receita
    Quando consulto os totais de despesas e receitas do mês
    Então a transferência não é contabilizada em nenhum deles
    E não aparece no cálculo do acerto de contas

  Cenário: Origem igual ao destino
    Quando escolho a mesma conta nos dois campos
    Então vejo "Escolha contas diferentes" e nada é registrado

  Cenário: Valor inválido
    Quando informo "R$ 0,00"
    Então vejo "Informe um valor maior que zero"

  Cenário: Origem sem saldo suficiente
    Dado "Itaú Lucas" com "R$ 200,00"
    Quando transfiro "R$ 500,00" para "Nubank Conjunta"
    Então vejo o aviso "A conta de origem ficará negativa" e posso confirmar
    E após confirmar, "Itaú Lucas" fica com "-R$ 300,00"

  Cenário: Atomicidade
    Dado que ocorre uma falha ao registrar a perna de crédito
    Quando a transferência é processada
    Então nenhuma das duas pernas é registrada e os saldos permanecem iguais

  Cenário: Duplo clique não duplica
    Quando toco duas vezes em "Confirmar transferência"
    Então apenas uma transferência é registrada

  Cenário: Menos de duas contas
    Dado uma família com apenas uma conta
    Quando tento iniciar uma transferência
    Então sou orientado a cadastrar outra conta
```

## Experiência
Atalho "Transferir" na tela *Contas*; *drawer* com origem, destino, valor (máscara BRL) e data em *Mais detalhes*. Mostra o saldo resultante das duas contas antes de confirmar.

## Fora de escopo
Transferência para cartão/fatura (US-017), para caixinhas (AP2), agendamento, taxas/tarifas, câmbio, acerto familiar (US-011, que **reaproveita** esta transferência).

## Perguntas em aberto / pontos para o Tech Lead
- Modelar o par de movimentações com identificador comum; reaproveitar para o acerto (RN-007.3).
