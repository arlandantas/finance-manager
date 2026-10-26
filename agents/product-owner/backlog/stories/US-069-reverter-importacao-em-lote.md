# US-069 — Reverter uma importação em lote

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-B (proposta)** · fatia 4/4 da importação |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 2,0 · 3 |
| Status | Refinada, aguarda SDD do TL (R5 adiada); não iniciada |
| Depende de | US-068, US-041 (exclusão/Desfazer) |
| Corte | Cortável (1º do bloco da fatura): sem ela o usuário exclui lançamento a lançamento; RN-026.10 pede, mas não é vital |
| Rastreabilidade | **NEED-026** (RN-026.10) · RF44 · FLUXO-015 · D-PO-60 |

## História
Como **membro da família**, quero **desfazer uma importação inteira**, para **corrigir de uma vez um arquivo importado na fatura errada ou com extração ruim**.

## Regras de negócio aplicáveis
- A lista de importações do cartão mostra cada lote (data, quem, arquivo, nº de itens, total) e a ação "Desfazer importação".
- Desfazer **exclui logicamente** todos os lançamentos do lote e restaura limite, totais e Resumo; o lote fica "Revertido" no histórico.
- **Só enquanto a fatura não estiver paga**; fatura paga trava a reversão (D-PO-09).
- Se algum lançamento do lote foi **editado depois** da importação, o app avisa quais e exige confirmação extra (D-PO-60, hipótese conservadora: desfaz tudo, mas avisa).
- Qualquer membro pode desfazer (D-PO-02); a ação é registrada na atividade da família.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Reverter importação em lote

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E uma importação de 3 itens gravada pelo Lucas na fatura "nov/2026" do cartão "Nubank Lucas"
    E Lucas está autenticado

  Cenário: Importações aparecem na lista do cartão
    Quando Lucas abre o cartão "Nubank Lucas" e "Importações"
    Então vê o lote com data, autor, 3 itens e total

  Cenário: Desfazer remove todos os itens do lote
    Quando Lucas toca em "Desfazer importação" e confirma
    Então a fatura "nov/2026" não mostra mais os 3 lançamentos
    E o lote aparece como "Revertido"

  Cenário: Limite e totais voltam ao que eram
    Dado que o limite disponível do cartão é "R$ 4.380,00"
    Quando Lucas desfaz a importação
    Então o limite disponível do cartão volta a "R$ 5.000,00"

  Cenário: Fatura paga trava a reversão
    Dado que a fatura "nov/2026" está paga
    Quando Lucas abre o lote
    Então o botão "Desfazer importação" está desabilitado
    E vê "A fatura já foi paga. Desfaça o pagamento antes"

  Cenário: Item editado depois exige confirmação extra
    Dado que Lucas editou a categoria do item "Mercado" depois da importação
    Quando Lucas toca em "Desfazer importação"
    Então vê "1 lançamento foi editado depois de importado: Mercado"
    E precisa confirmar de novo para desfazer

  Cenário: Reverter duas vezes não gera efeito
    Dado que o lote já está "Revertido"
    Quando Lucas tenta desfazer o mesmo lote
    Então vê "Esta importação já foi desfeita"

  Cenário: Reimportar o mesmo arquivo depois de reverter é permitido
    Dado que o lote do arquivo "fatura-nubank.pdf" está "Revertido"
    Quando Lucas envia o mesmo arquivo para a fatura "nov/2026"
    Então a importação segue para a revisão sem o aviso de arquivo já importado
```

## Histórico
- 2026-10-24 — Criada (fatia 4/4; D-PO-60).
