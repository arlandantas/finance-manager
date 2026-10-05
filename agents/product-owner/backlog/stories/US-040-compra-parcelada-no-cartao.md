# US-040 — Compra parcelada no cartão (básico)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (parcelamento) · **R3, 1ª entrega** (não entra na R2.1: o TL estimou 8 > 5 e a US-042 depende da EN-002; D-GES-17 não satisfeita, TL-02) |
| MoSCoW · WSJF · Tamanho (TL) | Must · 2,1 (recalc.) · 8 (040a 5 + 040b 3) (PO: 5) |
| Status | **Esboçada** (SDD-014, esboço do Tech Lead) · tamanho re-estimado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-016a, US-017a, US-015 (já entregues); US-024 (descrição) |
| Corte | **Não cortar** (item 6: "dia a dia do cartão no Brasil"); a **040b** não sai sem a 040a, e a exclusão da compra inteira dela é o que torna um erro de digitação recuperável |
| Rastreabilidade | Parecer item 6, Q-F14 · NEED-003 (RN-003.4, 003.5, 003.6, 003.7, 003.9) · NEED-008 (ortogonal) · FLUXO-014 · D-PO-25, D-PO-26, **D-PO-33** · SDD-014 (esboço), ADR-017, TL-02, TL-03 |

## Fatias (D-PO-33, sugestão do TL: SDD-014 e ADR-017)
| Fatia | Pts | Conteúdo (cenários abaixo) |
| :-- | :-: | :-- |
| **040a** | 5 | Modelo da compra parcelada, criação **atômica** (todas as parcelas ou nenhuma), faturas futuras, limite pelo total, limite de 24x, "Dividir" em breve: Prévia, Gera uma parcela por fatura, Limite consumido, Centavos, À vista como antes, Depois do fechamento, Mesmo dia/fim do mês, Parcelas em faturas consecutivas, Pagar a fatura libera só a parcela, Total acima do limite, Número inválido, Só meu até a divisão, Duplo clique, Falha de rede, Isolamento |
| **040b** | 3 | **Competência** no Extrato, Resumo, Acerto e Análise (predicado único), "Ver compra", **exclusão da compra inteira** e Desfazer (vindas da US-041): Despesa do mês conta só a parcela, Extrato uma linha por parcela, Parcela no Extrato do mês da fatura, À vista segue a data da compra, Ver compra, Excluir a compra inteira, Desfazer, Excluir com parcela em fatura fechada |
A 040a pode ser entregue e usada sem a 040b? **Não**: sem a competência a parcela contaria no mês errado; por isso as duas formam a **mesma entrega** da R3, em *commits* e PRs separados.

## História
Como **membro da família**, quero **lançar uma compra parcelada no cartão informando o valor total e o número de parcelas**, para **ver cada parcela na fatura do mês certo e o limite consumido, sem lançar parcela por parcela**.

## Regras de negócio aplicáveis
- No formulário, com um **cartão** escolhido em "Pagar com", aparece o campo **"Parcelas"** (padrão **1x** = à vista, comportamento atual, nenhum toque extra). Opções **1x a 24x** (D-PO-25).
- O usuário informa o **valor total** (o campo de valor continua sendo o total). Prévia: **"10x de R$ 250,00 · 1ª na fatura de nov/2026"**. Alternar para "valor da parcela" **não** existe na R3 (fora de escopo).
- **Arredondamento** (RN-003.4): parcelas inteiras em centavos; a **diferença cai na 1ª parcela** (R$ 1.000,01 em 3x ⇒ 333,35 + 333,33 + 333,33).
- **Limite** (RN-003.5): consumido pelo **valor total** na hora da compra; **liberado a cada fatura paga**, pelo valor da(s) parcela(s) pagas.
- **Fatura** (RN-003.6): cada parcela cai na **fatura do mês correspondente** (ciclo do cartão, D-PO-06), rotulada **"Notebook 3/10"**; a parcela 1 usa a data da compra, as seguintes o mesmo dia dos meses seguintes (dia ajustado ao último dia do mês, quando necessário).
- **Despesa do mês** (D-PO-26): cada **parcela** conta como despesa **no mês da fatura em que cai** (Resumo do Mês, Extrato por parcela, visões sintéticas). O total comprometido futuro aparece em "Parcelas futuras" na fatura e no cartão.
- **Extrato**: mostra **uma linha por parcela**, ligada às demais pelo identificador do parcelamento ("3/10" + link "Ver compra").
- **Juros** (RN-003.9): o app trabalha com o **total pago**; não calcula juros.
- **Dividir com a família**: na R3 a compra parcelada pode ser dividida (US-042). **Até a US-042 ser entregue**, a compra parcelada só pode ser "Só meu" e o campo "Dividir" mostra "Disponível em breve" (D-PO-25).
- **Aviso de limite** (D-PO-08): total acima do limite disponível ⇒ aviso com confirmação, sem bloqueio.
- Total mínimo: R$ 0,01 por parcela; nº de parcelas 2 a 24.
- Compra parcelada **só no cartão** (carnê/boleto fora de escopo).
- Tags valem para todas as parcelas (RN-013.5, US-045).
- **Idempotência**: salvar duas vezes cria uma única compra parcelada.
- **Excluir a compra parcelada inteira** (040b, movida da US-041 por recomendação do TL: sem ela, um erro de digitação num Must é irrecuperável): ação explícita **"Excluir compra parcelada"**; remove **todas as parcelas em faturas abertas**, libera o limite, mostra o aviso **"Desfazer"** por pelo menos 8 s e **bloqueia** se alguma parcela já está em fatura fechada ou paga ("Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."). Editar parcelas e excluir **uma** parcela continuam na US-041.
- **Até a US-041**, as parcelas são **somente leitura** (editar parcela e excluir uma só ainda não existem); o contorno é excluir a compra inteira e lançar de novo.
- **Uma parcela por fatura, em faturas consecutivas** (ADR-020, 2026-10-05): a parcela *k* cai na *k*-ésima fatura a contar da fatura da parcela 1, mesmo quando o ajuste de fim de mês deixaria a data da parcela antes do fechamento; a data exibida segue "mesmo dia, ajustado ao fim do mês".
- **Assimetria assumida** (D-PO-26, D-GES-16; viável segundo o TL-03): a parcela conta no mês da **fatura** e a compra à vista na data da compra; o Extrato mostra a parcela com a etiqueta **"Fatura dez/2026 · 1/10"** para explicar por que aparece no mês seguinte.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Compra parcelada no cartão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com limite "R$ 5.000,00" fechamento dia 25 e vencimento dia 5
    E hoje é 10/11/2026
    E Lucas está autenticado no formulário "Nova despesa" com "Pagar com" o cartão "Nubank Lucas"

  Cenário: Prévia das parcelas
    Quando Lucas digita "R$ 2.500,00" e escolhe "10x" parcelas
    Então vê a prévia "10x de R$ 250,00 · 1ª na fatura de nov/2026"

  Cenário: Compra parcelada gera uma parcela por fatura
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x" na categoria "Outros"
    Então a fatura de nov/2026 mostra "Notebook 1/10 R$ 250,00"
    E a fatura de dez/2026 mostra "Notebook 2/10 R$ 250,00"
    E a fatura de ago/2027 mostra "Notebook 10/10 R$ 250,00"

  Cenário: Limite consumido pelo total
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x"
    Então o limite disponível do cartão "Nubank Lucas" passa a "R$ 2.500,00"

  Cenário: Centavos de arredondamento vão para a primeira parcela
    Quando Lucas lança "Presente" de "R$ 1.000,01" em "3x"
    Então as parcelas são "R$ 333,35" e "R$ 333,33" e "R$ 333,33"
    E a soma das parcelas é "R$ 1.000,01"

  Cenário: Compra à vista continua como antes
    Quando Lucas lança "Mercado" de "R$ 90,00" em "1x"
    Então a fatura de nov/2026 mostra "Mercado R$ 90,00" sem rótulo de parcela

  Cenário: Compra depois do fechamento começa na fatura seguinte
    Dado que hoje é 28/11/2026
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x"
    Então a prévia mostrou "1ª na fatura de dez/2026"
    E a fatura de dez/2026 mostra "Notebook 1/10 R$ 250,00"

  Cenário: Parcela cai no mesmo dia dos meses seguintes ajustando o fim do mês
    Dado que hoje é 31/01/2027
    Quando Lucas lança "Curso" de "R$ 600,00" em "3x"
    Então a parcela 2 tem data 28/02/2027
    E a parcela 3 tem data 31/03/2027

  Cenário: Cada parcela cai numa fatura diferente com fechamento no dia 28
    Dado o cartão "Visa Silva" com fechamento dia 28 e vencimento dia 10
    E que hoje é 31/01/2027
    Quando Lucas lança "Curso" de "R$ 600,00" em "3x" no cartão "Visa Silva"
    Então a parcela 1 está na fatura de fev/2027
    E a parcela 2 está na fatura de mar/2027
    E a parcela 3 está na fatura de abr/2027

  Cenário: Despesa do mês conta só a parcela
    Quando Lucas lança "Notebook" de "R$ 2.500,00" em "10x"
    Então as despesas de nov/2026 aumentam "R$ 250,00"
    E as despesas de dez/2026 aumentam "R$ 250,00"

  Cenário: Extrato mostra uma linha por parcela
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato filtrado pelo cartão "Nubank Lucas"
    Então vê 10 linhas "Notebook" com rótulos "1/10" a "10/10"

  Cenário: Pagar a fatura libera só a parcela paga
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 foi fechada e paga
    Quando Lucas abre o cartão "Nubank Lucas"
    Então o limite disponível passa a "R$ 2.750,00"

  Cenário: Total acima do limite avisa e deixa confirmar
    Quando Lucas lança "Viagem" de "R$ 6.000,00" em "12x"
    Então vê o aviso "Esta compra passa do limite disponível" com o botão "Confirmar mesmo assim"

  Cenário: Parcela aparece no Extrato do mês da fatura
    Dado que hoje é 28/11/2026
    E Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre o Extrato de dezembro de 2026
    Então vê "Notebook" com a etiqueta "Fatura dez/2026 · 1/10"
    E o Extrato de novembro de 2026 não mostra "Notebook"

  Cenário: Compra à vista segue pela data da compra
    Dado que hoje é 28/11/2026
    Quando Lucas lança "Mercado" de "R$ 90,00" em "1x"
    Então o Extrato de novembro de 2026 mostra "Mercado"
    E o Extrato de dezembro de 2026 não mostra "Mercado"

  Cenário: Ver compra mostra todas as parcelas
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas toca em "Ver compra" na parcela "3/10"
    Então vê o total "R$ 2.500,00" e as 10 parcelas com a fatura de cada uma

  Cenário: Excluir a compra parcelada inteira
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas toca em "Excluir compra parcelada" e confirma
    Então nenhuma fatura mostra "Notebook"
    E o limite disponível do cartão "Nubank Lucas" volta a "R$ 5.000,00"

  Cenário: Desfazer a exclusão da compra parcelada inteira
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E Lucas excluiu a compra parcelada
    Quando Lucas toca em "Desfazer" no aviso
    Então as 10 parcelas voltam às suas faturas
    E o limite disponível do cartão "Nubank Lucas" volta a "R$ 2.500,00"

  Cenário: Excluir a compra com parcela em fatura fechada
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    E a fatura de nov/2026 está fechada e não paga
    Quando Lucas toca em "Excluir compra parcelada"
    Então vê "Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."
    E nada é excluído

  Cenário: Parcela não é editável até a gestão de parcelas
    Dado que Lucas lançou "Notebook" de "R$ 2.500,00" em "10x"
    Quando Lucas abre a parcela "3/10"
    Então não vê "Editar"
    E vê "Excluir compra parcelada"

  Cenário: Número de parcelas inválido
    Quando Lucas informa "25" parcelas
    Então vê "Escolha de 1 a 24 parcelas"

  Cenário: Compra parcelada fica Só meu até a divisão estar disponível
    Dado que a divisão de compras parceladas ainda não foi liberada
    Quando Lucas escolhe "3x" parcelas
    Então o campo "Dividir com a família" mostra "Disponível em breve"

  Cenário: Duplo clique não cria duas compras
    Quando Lucas toca duas vezes rapidamente em "Salvar Despesa" com "R$ 2.500,00" em "10x"
    Então existe uma única compra parcelada com 10 parcelas

  Cenário: Falha de rede
    Dado que não há conexão
    Quando Lucas confirma a compra parcelada
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."
    E nada é registrado

  Cenário: Isolamento entre famílias
    Dado a "Família Souza" com o cartão "Visa Souza"
    Quando Lucas tenta lançar uma compra parcelada no cartão "Visa Souza" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md): seletor "Parcelas" (1x padrão) logo abaixo de "Pagar com" quando é cartão; prévia em texto secundário; na fatura, rótulo "n/N" e subtotal "Parcelas futuras: R$ X".

## Fora de escopo
Editar parcelas e excluir uma só (US-041); dividir parcelas (US-042); antecipar parcelas; valor da parcela como entrada; juros; parcelamento de boleto/carnê (AP1 recorrência); desdobramento de compra (NEED-008, AP2).

## Perguntas em aberto / pontos para o Tech Lead
- **Respondido pelo TL** (SDD-014, ADR-017): estimativa 8 (040a 5 + 040b 3); não cabe na R2.1; a assimetria D-PO-26 é viável com predicado único `competenceOn` (+2 pts); sem o 24x a estimativa não muda (o limite só afeta a validação). Alternativa mais barata (apurar a parcela por `occurredOn`, −2 pts) exige aceite do Stakeholder e **não foi adotada** (TL-03).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 6, Q-F14).
- 2026-10-04 — **Revisão pós-TL (D-PO-33):** estimativa do TL = 8, fatiada em 040a (5) e 040b (3); fica na R3 como 1ª entrega; recebe da US-041 os cenários "Excluir a compra parcelada inteira", "Desfazer" e "Excluir com parcela em fatura fechada"; acrescentados "Parcela aparece no Extrato do mês da fatura", "Compra à vista segue pela data da compra", "Ver compra" e "Parcela não é editável até a gestão de parcelas".
- 2026-10-05 — **Nota pós-ADR-020 (sem mudança de pontos):** acrescentado o cenário "Cada parcela cai numa fatura diferente com fechamento no dia 28" (parcela *k* na *k*-ésima fatura).
