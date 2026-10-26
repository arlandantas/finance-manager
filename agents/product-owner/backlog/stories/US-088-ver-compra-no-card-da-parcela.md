# US-088 — "Ver compra" como ação do próprio card da compra parcelada

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (polimento) · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Could** · 4,0 (V2/U1/R1) · **1** |
| Status | Proposta pelo PO em 2026-10-26; sem SDD (mover o controle dentro do card e trocar por ícone com rótulo) |
| Depende de | US-040b (já implementada), US-087 (mesma linha; pode andar junto) |
| Corte | **1ª a cortar do polimento** (Could) |
| Rastreabilidade | **NEED-034** item 10 (RN-034.4, 034.5) · NEED-003 · FLUXO-014 · D-PO-100 |

## História
Como **membro que consulta uma compra parcelada**, quero **a ação "Ver compra" dentro do card da parcela, junto das demais ações**, para **não procurá-la fora da linha**.

## Regras
- Em linha de parcela (Extrato, fatura do cartão e detalhe da transação), **"Ver compra" é uma ação do próprio card**, no mesmo grupo e estilo das outras ações do card (editar, excluir, etc.); não fica mais fora do card (RN-034.4).
- Apresentação: **ícone (por exemplo, lista/olho) + rótulo "Ver compra"**; em largura estreita pode ficar só o ícone, com `aria-label` "Ver compra" e dica ao passar/segurar; alvo ≥ 44 px.
- Mesmo comportamento de hoje: abre o diálogo do plano (total, parcelas e fatura de cada uma, excluir a compra inteira com Desfazer, US-040b); nenhuma regra muda.
- Compra à vista e demais linhas não mostram a ação.
- Vale a ordem das ações: "Ver compra" aparece logo após a ação principal da linha e antes das destrutivas.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Ver compra no card da parcela

  Contexto:
    Dado a "Família Silva" com o cartão "Nubank Lucas"
    E Lucas tem a compra "Notebook" em 10x no cartão
    E Lucas está autenticado

  Cenário: Ação dentro do card
    Quando Lucas abre o Extrato
    Então a parcela "Notebook 2/10" mostra "Ver compra" dentro do próprio card

  Cenário: Abre o plano da compra
    Dado que Lucas vê a parcela "Notebook 2/10"
    Quando Lucas toca em "Ver compra"
    Então vê o total da compra e as 10 parcelas com a fatura de cada uma

  Cenário: Compra à vista não tem a ação
    Dado uma compra à vista no cartão
    Quando Lucas abre o Extrato
    Então a linha dessa compra não mostra "Ver compra"

  Cenário: Acessível por leitor de tela
    Quando Lucas navega até a ação da parcela
    Então o leitor anuncia "Ver compra"
```

## Fora de escopo
Alterar o conteúdo do diálogo do plano; ações em lote.
