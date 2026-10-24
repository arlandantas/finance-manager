# US-065 — Compra parcelada com parcelas já pagas (entrada no meio do parcelamento)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-20 Cartão Completo (parcelamento) · **R4-A (proposta)**, primeira da fila: sem IA e sem risco de privacidade |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Must · 3,6 · 5 |
| Status | Refinada (PO) · aguarda estimativa/SDD do Tech Lead (extensão do SDD-014) |
| Depende de | US-040a/b (parcelamento básico), US-041 (editar/excluir); **a divisão das parcelas restantes depende da US-042** |
| Corte | Não cortar da R4-A (é o item de maior valor/menor risco do pacote) |
| Rastreabilidade | **NEED-024** (RN-024.1..7), Q-U03 · RF42 · NEED-003 (RN-003.2..9) · FLUXO-014 · D-PO-54..56 |

## História
Como **membro da família que começa a usar o app com compras já parceladas**, quero **informar a compra com a posição atual (ex.: "4 de 10 já pagas")**, para **que só o saldo restante apareça nas faturas futuras e no limite, sem reconstruir o passado nem sujar o acerto**.

## Regras de negócio aplicáveis
- O usuário informa o **valor total**, o **nº de parcelas** e **quantas já foram pagas** (padrão 0; sempre menor que o total). Prévia obrigatória: "Restam 6 parcelas de R$ 250,00 · a próxima (5/10) na fatura de nov/2026".
- As parcelas pagas **não geram lançamento**: não entram em faturas passadas, no Extrato, em saldos, no Resumo do Mês, na Análise nem no acerto. Existem só como **histórico do plano** ("anteriores ao app").
- As restantes seguem a regra normal (US-040): uma por fatura, numeração real "5/10", ligadas por identificador de parcelamento, competência pelo mês da fatura (D-PO-26).
- **Limite do cartão** é consumido apenas pelo saldo restante (D-PO-55).
- Divisão com a família: só habilitada quando a US-042 existir; enquanto isso, vale o comportamento da US-040 (parcelado "Só meu", com o aviso da US-052).
- Centavos exatos (`amountInCents`): se o total não divide por N, a diferença fica na 1ª parcela do plano completo; se essa parcela já foi paga, o app usa o valor-padrão das restantes e informa na prévia (hipótese do PO; **TL confirma** o tratamento do resto).
- Editar/excluir (US-041) atuam só nas parcelas restantes; as "anteriores ao app" são imutáveis.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Parcelamento com parcelas já pagas

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o cartão "Nubank Lucas" com fechamento dia 25, vencimento dia 5 e limite de "R$ 5.000,00"
    E hoje é 10/11/2026
    E Lucas está autenticado

  Cenário: Campo de parcelas já pagas aparece só com parcelamento
    Dado que Lucas abre "Nova despesa" e escolhe o cartão "Nubank Lucas"
    Quando Lucas escolhe "10x" parcelas
    Então vê o campo "Parcelas já pagas" com valor 0

  Cenário: Campo não aparece em compra à vista
    Dado que Lucas abre "Nova despesa" e escolhe o cartão "Nubank Lucas"
    Quando Lucas escolhe "1x" parcela
    Então não vê o campo "Parcelas já pagas"

  Cenário: Prévia mostra o saldo restante
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    Quando Lucas informa "4" parcelas já pagas
    Então vê a prévia "Restam 6 parcelas de R$ 250,00 · a próxima (5/10) na fatura de nov/2026"

  Cenário: Só as parcelas restantes viram lançamentos
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    E informa "4" parcelas já pagas
    Quando Lucas salva a despesa
    Então a fatura de nov/2026 mostra "Sofá 5/10 R$ 250,00"
    E a fatura de abr/2027 mostra "Sofá 10/10 R$ 250,00"

  Cenário: Nada é criado em meses passados
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas abre o Extrato de out/2026
    Então não vê nenhuma linha "Sofá"

  Cenário: Saldos das contas não mudam
    Dado que a conta "Itaú Lucas" tem saldo de "R$ 1.000,00"
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Então o saldo da conta "Itaú Lucas" continua "R$ 1.000,00"

  Cenário: Limite consumido só pelo saldo restante
    Dado que o limite disponível do cartão "Nubank Lucas" é "R$ 5.000,00"
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Então o limite disponível do cartão "Nubank Lucas" é "R$ 3.500,00"

  Cenário: Pagas não podem ser todas as parcelas
    Dado que Lucas informa "Sofá" de "R$ 2.500,00" em "10x"
    Quando Lucas informa "10" parcelas já pagas
    Então vê o erro "Informe menos parcelas pagas do que o total do parcelamento"
    E o botão de salvar fica desabilitado

  Cenário: Ver compra identifica as parcelas anteriores ao app
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas abre "Ver compra" na parcela "5/10"
    Então vê "Parcelas 1 a 4: anteriores ao app (já pagas)"
    E vê as parcelas "5/10" a "10/10" com suas faturas

  Cenário: Excluir a compra remove só as restantes
    Dado que Lucas lançou "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas
    Quando Lucas escolhe "Excluir compra parcelada" e confirma
    Então a fatura de nov/2026 não mostra mais "Sofá"
    E o limite disponível do cartão "Nubank Lucas" volta a "R$ 5.000,00"

  Cenário: Parcelado com parcelas pagas fica fora do acerto enquanto for Só meu
    Dado que o acerto de contas está ligado
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas sem dividir
    Então o acerto de nov/2026 não muda

  @depende-us-042
  Cenário: Restantes entram no acerto e as pagas não
    Dado que o acerto de contas está ligado e a regra de divisão é igual
    Quando Lucas lança "Sofá" de "R$ 2.500,00" em "10x" com "4" parcelas já pagas dividindo com a família
    Então o acerto de nov/2026 considera "R$ 250,00" pago por Lucas
    E o acerto de out/2026 não muda
```

## Experiência (UX/estados)
[FLUXO-014](../../flows/FLUXO-014-parcelamento-tags-e-analise.md) (acréscimo): campo "Parcelas já pagas" logo abaixo de "Parcelas", com texto de apoio "Quantas já foram pagas antes de usar o app?". Prévia sempre visível. Sem dados antigos para digitar.

## Fora de escopo
Reconstruir as parcelas pagas no histórico/relatórios por categoria (Q-U03: só o restante, hipótese conservadora); informar "estou na parcela X" por data; compras sem cartão.

## Perguntas em aberto / pontos para o Tech Lead
- Modelo: parcelas "anteriores ao app" como contador no plano (`paidBeforeApp`) ou registros marcados? PO prefere contador (sem lançamentos fantasma).
- Tratamento do resto de centavos quando a 1ª parcela já foi paga.
- Validação "parcela atual compatível com a data da compra e o ciclo" (RN-024.7): a data da compra deixa de ser exigida? Proposta do PO: a prévia basta; **TL avalia**.

## Histórico
- 2026-10-24 — Criada a partir da NEED-024 (D-PO-54..56).
