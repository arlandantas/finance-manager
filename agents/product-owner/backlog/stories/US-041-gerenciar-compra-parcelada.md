# US-041 — Gerenciar compra parcelada (editar parcelas e excluir uma parcela)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (parcelamento) · **R3** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,0 · 5 |
| Status | **Esboçada** (SDD-014, esboço do Tech Lead) · tamanho confirmado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-040 (inclui a exclusão da compra inteira), US-016b, US-013a; ordem técnica: depois da US-043 (TL, ordem de risco) |
| Corte | **Cortável** (contorno: excluir a compra inteira, que agora vem na US-040b, e lançar de novo) |
| Rastreabilidade | NEED-003 (RN-003.7) · Parecer item 6 · FLUXO-014 · D-PO-25 |

## História
Como **membro da família**, quero **corrigir uma parcela (só ela ou ela e as seguintes) ou excluir uma parcela**, para **manter fatura e limite fiéis quando errei o lançamento**.

## Regras de negócio aplicáveis
- Ao editar uma parcela, o app pergunta o **alcance**: **"Somente esta"** ou **"Esta e as próximas"** (RN-003.7). O padrão é "Somente esta".
- Campos editáveis: valor da parcela, descrição, categoria, observação (data de parcela e nº de parcelas **não** são editáveis; para isso, exclui-se a compra e lança-se de novo).
- **Parcelas em fatura fechada ou paga ficam travadas** (qualquer fatura que não esteja **aberta**; a edição de compra **única** da US-016b trava só a fatura **paga**: diferença conhecida e aceita, TL-12, a confirmar na homologação); "Esta e as próximas" altera só as parcelas ainda em faturas **abertas**.
- Mudar o **valor** de uma parcela recalcula na hora o total da fatura e o **limite consumido** (diferença); mudar o valor de "esta e as próximas" aplica o novo valor às seguintes.
- **Excluir a compra inteira** (e "Desfazer") **não é desta história**: foi para a **US-040b** (D-PO-33). Aqui a ação "Excluir parcela" convive com a "Excluir compra parcelada" da US-040.
- Excluir **somente esta parcela** é permitido em fatura aberta e deixa um **registro** ("parcela 3/10 removida"); a compra fica com 9 parcelas ativas.
- Toda alteração gera trilha de auditoria (autor/data) como na US-013a; conflito de versão 409.
- Restaurar exclusão: o aviso "Desfazer" (≥ 8 s) vale também para a exclusão de uma parcela.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Gerenciar compra parcelada

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00" fechamento dia 25 e vencimento dia 5
    E a compra "Notebook" de "R$ 2.500,00" em "10x" lançada em 10/11/2026
    E hoje é 12/11/2026
    E Lucas está autenticado no Extrato

  Cenário: Pergunta o alcance ao editar uma parcela
    Quando Lucas edita a parcela "3/10" do "Notebook"
    Então vê as opções "Somente esta" e "Esta e as próximas"
    E "Somente esta" vem marcada

  Cenário: Editar somente esta parcela
    Quando Lucas altera o valor da parcela "3/10" para "R$ 300,00" escolhendo "Somente esta"
    Então a parcela "3/10" mostra "R$ 300,00"
    E as demais continuam "R$ 250,00"
    E o limite disponível diminui "R$ 50,00"

  Cenário: Editar esta e as próximas
    Quando Lucas altera o valor da parcela "3/10" para "R$ 200,00" escolhendo "Esta e as próximas"
    Então as parcelas "3/10" a "10/10" mostram "R$ 200,00"
    E as parcelas "1/10" e "2/10" continuam "R$ 250,00"

  Cenário: Mudar a categoria de esta e das próximas
    Quando Lucas altera a categoria da parcela "3/10" para "Lazer e restaurantes" escolhendo "Esta e as próximas"
    Então as parcelas "3/10" a "10/10" ficam na categoria "Lazer e restaurantes"

  Cenário: Parcela em fatura paga é travada
    Dado que a fatura de nov/2026 está paga
    Quando Lucas abre a parcela "1/10"
    Então não vê "Editar" nem "Excluir"
    E vê "Fatura paga"

  Cenário: Parcela em fatura fechada e não paga também é travada
    Dado que a fatura de nov/2026 está fechada e não paga
    Quando Lucas abre a parcela "1/10"
    Então não vê "Editar"
    E vê "Fatura fechada"

  Cenário: Esta e as próximas pula parcelas travadas
    Dado que a fatura de nov/2026 está fechada e paga
    Quando Lucas altera o valor da parcela "2/10" para "R$ 200,00" escolhendo "Esta e as próximas"
    Então a parcela "1/10" continua "R$ 250,00"
    E as parcelas "2/10" a "10/10" mostram "R$ 200,00"

  Cenário: Excluir somente uma parcela
    Quando Lucas exclui a parcela "5/10" escolhendo "Somente esta"
    Então a fatura de mar/2027 não tem mais "Notebook 5/10"
    E o limite disponível aumenta "R$ 250,00"

  Cenário: Conflito de versão
    Dado que Mariana e Lucas abriram a edição da parcela "3/10"
    Quando Mariana salva "R$ 300,00"
    E Lucas tenta salvar "R$ 200,00"
    Então Lucas vê "Esta compra foi alterada por Mariana. Recarregue para continuar."

  Cenário: Histórico da compra parcelada
    Dado que Lucas alterou o valor da parcela "3/10"
    Quando Lucas toca em "Histórico" na parcela
    Então vê a alteração com autor "Lucas" e data

  Cenário: Duplo clique não aplica duas vezes
    Quando Lucas toca duas vezes rapidamente em "Salvar" na edição da parcela "3/10"
    Então a alteração é registrada uma única vez
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): diálogo de alcance com a explicação do que muda; na parcela, "Excluir parcela" fica separada da ação "Excluir compra parcelada" (US-040b).

## Fora de escopo
Antecipar ou renegociar parcelas; editar data; mudar de cartão; estorno parcial.

## Perguntas em aberto / pontos para o Tech Lead
- Modelo de "esta e as próximas" (versionamento da série) e trilha por parcela.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 6; RN-003.7).
- 2026-10-04 — **Revisão pós-TL (D-PO-33):** os cenários "Excluir a compra parcelada inteira", "Desfazer a exclusão da compra inteira" e "Excluir a compra com parcela em fatura fechada" **migraram para a US-040b** (recomendação do TL: sem eles, um erro de digitação no Must é irrecuperável). Tamanho 5 confirmado; ordem na R3 depois da US-043.
- 2026-10-05 — **Ajuste pós-SDD (D-GES-24, D-PO-45):** a trava vale para fatura **fechada ou paga** (TL-12); acrescentado o cenário "Parcela em fatura fechada e não paga também é travada". Fica na **R3-B**.
