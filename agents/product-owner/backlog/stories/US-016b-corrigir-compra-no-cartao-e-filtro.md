# US-016b — Corrigir ou excluir compra no cartão e filtrar o extrato por cartão

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-6 Cartões de Crédito (fase 1) · R2 |
| MoSCoW · WSJF · Tamanho (PO) | Should · 2,7 · 3 |
| Status | Refinada (PO) · **cortável** |
| Depende de | US-016, US-013a (editar/excluir), US-007 |
| Rastreabilidade | NEED-003 · NEED-006 (filtro por cartão) · RN-003.1 · US-013 · FLUXO-004 |

## História
Como **membro da família**, quero **corrigir ou excluir uma compra no cartão e filtrar o extrato por cartão**, para **manter a fatura e o limite fiéis ao que realmente foi comprado**.

## Regras de negócio aplicáveis
- A compra no cartão segue as regras da US-013a (editar com auditoria, excluir, restaurar, conflito de versão), com estas particularidades:
  - Alterar **valor** recalcula **na hora** o total da fatura e o limite disponível.
  - Alterar a **data** pode mudar a **fatura** (mesma regra de fechamento da US-016).
  - **O meio de pagamento não é editável** entre conta e cartão nem entre cartões: para mudar, exclui-se e lança-se de novo.
  - Excluir **libera o limite**; restaurar volta a consumi-lo.
- O extrato ganha o filtro **"Cartão"**. Filtrar por uma **conta** não traz compras de cartão (elas não saem da conta). Totais do filtro seguem a regra única (compra no cartão conta como despesa).
- Compras em fatura **paga** não podem ser alteradas (regra e cenários na US-017b).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Corrigir compra no cartão e filtrar por cartão

  Contexto:
    Dado a "Família Silva" com a conta "Itaú Lucas" (saldo R$ 3.000,00)
    E o cartão "Nubank Mariana" com limite "R$ 5.000,00", fechamento dia 25 e vencimento dia 5
    E uma compra de "R$ 300,00" no cartão "Nubank Mariana" em 15/10/2026
    E hoje é 20/10/2026
    E Mariana está autenticada

  Cenário: Corrigir o valor da compra
    Quando Mariana edita a compra para "R$ 250,00"
    Então o total da fatura de "out/2026" passa a "R$ 250,00"
    E o limite disponível passa a "R$ 4.750,00"
    E o detalhe mostra "Editado por Mariana"

  Cenário: Mudar a data para depois do fechamento muda a fatura
    Dado que hoje é 28/10/2026
    Quando Mariana edita a data da compra para 27/10/2026
    Então a compra passa para a fatura de "nov/2026"
    E o total da fatura de "out/2026" passa a "R$ 0,00"

  Cenário: Excluir libera o limite
    Quando Mariana exclui a compra
    Então o limite disponível volta a "R$ 5.000,00"
    E a compra some da fatura e do extrato padrão

  Cenário: Restaurar a compra excluída
    Dado que Mariana excluiu a compra
    Quando ela restaura a compra
    Então o limite disponível volta a "R$ 4.700,00"
    E a compra volta à fatura de "out/2026"

  Cenário: Forma de pagamento não é editável
    Quando Mariana abre a edição da compra
    Então o campo "Pagar com" aparece desabilitado com a dica "Para mudar a forma de pagamento, exclua e lance novamente"

  Cenário: Conflito de edição da compra
    Dado que Mariana e Lucas abriram a edição da compra
    Quando Mariana salva um novo valor
    E Lucas tenta salvar outro valor
    Então Lucas vê "Este lançamento foi alterado por Mariana. Recarregue para continuar."

  Cenário: Filtrar o extrato por cartão
    Dado também uma despesa de "R$ 80,00" na conta "Itaú Lucas"
    Quando filtro o extrato pelo cartão "Nubank Mariana"
    Então vejo apenas a compra de "R$ 300,00"
    E o total de despesas do filtro é "R$ 300,00"

  Cenário: Filtrar por conta não mostra compras de cartão
    Quando filtro o extrato pela conta "Itaú Lucas"
    Então a compra no cartão não aparece

  Cenário: Detalhe da compra mostra cartão e fatura
    Quando Mariana abre o detalhe da compra
    Então vê o cartão "Nubank Mariana" e a fatura "out/2026"
    E vê "Registrado por" e "Pago por"

  Cenário: Acerto recalculado ao excluir compra compartilhada
    Dado a regra de divisão "igualitária" e que a compra de "R$ 300,00" é de Mariana e compartilhada
    Quando Mariana exclui a compra
    Então o acerto de outubro deixa de mostrar dívida por essa compra
```

## Experiência (UX/estados)
Reaproveita o drawer/detalhe da US-013a. No detalhe da compra: linha "Cartão Nubank Mariana · Fatura out/2026 (vence 05/11)". No extrato, o filtro "Cartão" fica ao lado de "Conta" (chip e drawer de filtros no mobile); a URL ganha o parâmetro de cartão.

## Fora de escopo
Trocar a forma de pagamento; mover compra entre cartões; editar fatura paga (US-017b); ajustes manuais na fatura.

## Perguntas em aberto / pontos para o Tech Lead
- Interação com US-013a: o formulário de edição precisa omitir/desabilitar `accountId` para compras de cartão e tratar a mudança de fatura ao editar a data.

## Histórico
- 2026-10-04 — Criada na fatia 016b da US-016.
