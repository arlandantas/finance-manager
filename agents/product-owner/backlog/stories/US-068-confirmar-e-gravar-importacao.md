# US-068 — Confirmar e gravar a importação (lote atômico e sem duplicar)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-B (proposta)** · fatia 3/4 da importação |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Must · 2,6 · 5 |
| Status | Refinada, aguarda SDD do TL (R5 adiada); não iniciada |
| Depende de | US-067, US-016a (compra no cartão), US-040a, EN-002 (para itens divididos; ver "Fora de escopo") |
| Corte | Não cortar |
| Rastreabilidade | **NEED-026** (RN-026.5, 026.9, 026.10) · RF44 · RN12, RN15 · FLUXO-015 · D-PO-60, D-PO-62 |

## História
Como **membro da família**, quero **confirmar a revisão e gravar todos os itens escolhidos de uma vez, com segurança contra duplicidade**, para **ter a fatura do app igual à do banco em poucos minutos**.

## Regras de negócio aplicáveis
- A gravação é **tudo-ou-nada** (lote atômico): se qualquer item falhar, nenhum é criado e o usuário vê o motivo.
- Cada lote recebe um **identificador**, guarda quem importou, quando, o cartão/fatura, o nº de itens e o **resumo do arquivo (hash)**; os lançamentos ficam marcados "Importado da fatura".
- **Anti-duplicidade no servidor** (RN-026.5): reenviar o mesmo arquivo ou clicar duas vezes em "Confirmar" não duplica (idempotência por lote + hash); aviso "Este arquivo já foi importado em dd/mm".
- Lançamentos importados entram **Só meu** por padrão (consistente com D-PO-16); o acerto não muda por causa da importação. Divisão em lote é fora de escopo (D-PO-60).
- Limite do cartão, totais da fatura e Resumo do Mês passam a refletir os itens gravados; a fatura deve fechar no total do arquivo quando o usuário marcou todos os itens (conferência exibida de novo).
- O **arquivo original é descartado** ao fim (gravado ou abandonado); fica só o resumo do lote (RN-026.9; D-PO-62).
- Fatura que ficou **paga** entre a revisão e a confirmação rejeita a gravação.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Gravar a importação

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com a fatura "nov/2026" aberta e sem lançamentos
    E uma revisão com 3 itens marcados somando "R$ 620,00"
    E Lucas está autenticado

  Cenário: Confirmar grava todos os itens marcados
    Quando Lucas confirma a importação
    Então a fatura "nov/2026" do cartão "Nubank Lucas" mostra 3 lançamentos
    E o total da fatura é "R$ 620,00"
    E vê "3 lançamentos importados. Você pode desfazer esta importação"

  Cenário: Itens desmarcados não são gravados
    Dado que Lucas desmarcou o item "Padaria" de "R$ 45,00"
    Quando Lucas confirma a importação
    Então a fatura "nov/2026" mostra 2 lançamentos
    E o total da fatura é "R$ 575,00"

  Cenário: Lançamentos nascem Só meu e identificados
    Quando Lucas confirma a importação
    Então os 3 lançamentos aparecem como "Só meu"
    E mostram o selo "Importado da fatura"
    E o acerto de nov/2026 não muda

  Cenário: Duplo clique não duplica
    Quando Lucas confirma a importação duas vezes seguidas
    Então a fatura "nov/2026" mostra apenas 3 lançamentos

  Cenário: Reenviar o mesmo arquivo avisa
    Dado que a importação do arquivo "fatura-nubank.pdf" já foi gravada em 10/11/2026
    Quando Mariana envia o mesmo arquivo para a fatura "nov/2026"
    Então vê "Este arquivo já foi importado em 10/11/2026"
    E nenhum lançamento novo é criado

  Cenário: Falha em um item cancela o lote inteiro
    Dado que um dos itens marcados tem categoria arquivada
    Quando Lucas confirma a importação
    Então vê o motivo da falha do item
    E nenhum dos 3 lançamentos é criado

  Cenário: Fatura paga durante a revisão rejeita a gravação
    Dado que a fatura "nov/2026" foi paga enquanto Lucas revisava
    Quando Lucas confirma a importação
    Então vê "Esta fatura já foi paga e não aceita novos lançamentos"
    E nenhum lançamento é criado

  Cenário: Arquivo descartado após a gravação
    Quando Lucas confirma a importação
    Então o arquivo "fatura-nubank.pdf" não fica armazenado
    E o lote guarda apenas o resumo do arquivo, a data e o número de itens

  Cenário: Limite do cartão reflete os itens gravados
    Dado que o limite disponível do cartão "Nubank Lucas" é "R$ 5.000,00"
    Quando Lucas confirma a importação
    Então o limite disponível do cartão "Nubank Lucas" é "R$ 4.380,00"
```

## Fora de escopo
Dividir itens com a família no ato da importação (o usuário divide depois, lançamento a lançamento); importar para mais de uma fatura por vez; conta de pagamento.

## Histórico
- 2026-10-24 — Criada (fatia 3/4; D-PO-60, D-PO-62).
