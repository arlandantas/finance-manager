# US-033 — Arquivar e reativar cartão de crédito

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should · 2,5 · 2 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-015, US-017a, US-032 |
| Corte | **Cortável** |
| Rastreabilidade | Parecer item 13 · NEED-020 (RN-020.3) · NEED-003 · FLUXO-010 · D-PO-17 |

## História
Como **membro da família**, quero **arquivar um cartão que não uso mais**, para **tirá-lo dos seletores sem perder as faturas e compras passadas**.

## Regras de negócio aplicáveis
- Só arquiva **sem fatura em aberto ou não paga** (aberta com compras, fechada ou vencida) e **sem parcelas futuras** (US-040; até a R3 existir, a regra de parcelas é trivialmente satisfeita).
- Cartão arquivado some da lista de cartões e do "Pagar com"; compras, faturas pagas e limite histórico permanecem; aparece em "Cartões arquivados" com **Reativar**.
- **Exclusão definitiva** só de cartão **sem nenhuma compra**, pelo Administrador, com confirmação.
- Mensagem de bloqueio **diz o motivo** e o próximo passo ("Pague a fatura de out/2026 antes de arquivar").

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Arquivar cartão de crédito

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas"
    E o cartão "Nubank Lucas" sem fatura em aberto e com compras já pagas
    E o cartão "Cartão novo" sem nenhuma compra
    E Mariana está autenticada em "Cartões"

  Cenário: Arquivar cartão sem pendências
    Quando Mariana arquiva o cartão "Nubank Lucas" e confirma
    Então vê "Cartão arquivado"
    E "Nubank Lucas" não aparece na lista de cartões

  Cenário: Cartão arquivado some do Pagar com
    Dado que o cartão "Nubank Lucas" foi arquivado
    Quando Mariana abre o formulário "Nova despesa"
    Então "Nubank Lucas" não aparece em "Pagar com"

  Cenário: Compras antigas continuam no Extrato
    Dado que o cartão "Nubank Lucas" foi arquivado
    Quando Mariana abre o Extrato
    Então as compras antigas do "Nubank Lucas" continuam visíveis com "(arquivado)"

  Cenário: Fatura em aberto bloqueia o arquivamento
    Dado uma fatura fechada de "R$ 479,00" do "Nubank Lucas" ainda não paga
    Quando Mariana tenta arquivar o cartão "Nubank Lucas"
    Então vê "Pague a fatura antes de arquivar o cartão"
    E o cartão continua ativo

  Cenário: Fatura aberta com compras bloqueia o arquivamento
    Dado uma compra de "R$ 90,00" na fatura aberta do "Nubank Lucas"
    Quando Mariana tenta arquivar o cartão "Nubank Lucas"
    Então vê "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar."

  Cenário: Reativar cartão
    Dado que o cartão "Nubank Lucas" foi arquivado
    Quando Mariana abre "Cartões arquivados" e toca em "Reativar" no "Nubank Lucas"
    Então "Nubank Lucas" volta à lista de cartões e ao "Pagar com"

  Cenário: Excluir cartão sem nenhuma compra
    Quando Mariana exclui o cartão "Cartão novo" e confirma
    Então vê "Cartão excluído"

  Cenário: Cartão com compras só arquiva
    Quando Mariana abre as ações do cartão "Nubank Lucas"
    Então vê "Arquivar"
    E não vê "Excluir"

  Cenário: Membro arquiva mas não exclui
    Dado que Lucas está autenticado em "Cartões"
    Quando Lucas abre as ações do cartão "Cartão novo"
    Então vê "Arquivar"
    E não vê "Excluir"

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Mariana tenta arquivar o cartão "Visa Souza" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
Mesmo padrão da conta ([FLUXO-010](../../flows/FLUXO-010-arquivar-conta-e-cartao.md)).

## Fora de escopo
Cancelar cartão no banco; transferir faturas entre cartões; arquivar cartão com parcelas futuras (bloqueado).

## Perguntas em aberto / pontos para o Tech Lead
- Consulta "fatura aberta com compras ou parcelas futuras" (reuso do SDD-008). Depende de US-040 para o critério de parcelas.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 13).
