# US-009 — Ver o acerto de contas do mês

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-4 Divisão & Acerto de Contas · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,6 · 5 |
| Status | Refinada (PO) — aguarda SDD-002 · **substitui a antiga US-002** |
| Depende de | US-005, US-008 |
| Rastreabilidade | NEED-007 · RN-007.1, RN-007.2 · ADR-006 · FLUXO-003 |

## História
Como **membro da família**, quero **ver quanto cada um pagou em despesas comuns e quem deve quanto a quem**, para **acertarmos o mês sem planilha e sem discussão**.

## Regras de negócio aplicáveis
- Entram apenas **despesas comuns** (RN-007.2); receitas e despesas pessoais ficam fora.
- *Pagou* de cada membro = soma das despesas comuns em que ele é **quem pagou** (RN-007.1).
- *Cota devida* = parte do total comum conforme a regra da família (US-008).
- *Diferença* = Pagou − Cota. Positiva = tem a receber; negativa = deve.
- **Soma das cotas = total comum, sempre** (maior resto; nunca perder ou criar centavo).
- Período: **mês-calendário** selecionável (padrão: corrente).
- Sugestão de acerto: transferências mínimas dos devedores para os credores. Com 2 membros, uma única transferência.
- Acertos já registrados (US-011) **abatem** o balanço.

## Exemplo numérico de referência (NEED-007)
Regra 50/50. Total comum: R$ 4.000,00 (`400000`).
- Mariana pagou R$ 2.400,00 (`240000`) → cota R$ 2.000,00 → diferença **+R$ 400,00**.
- Lucas pagou R$ 1.600,00 (`160000`) → cota R$ 2.000,00 → diferença **−R$ 400,00**.
- Sugestão: **Lucas deve R$ 400,00 para Mariana**.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Painel de acerto de contas

  Cenário: Cálculo igualitário com um devedor
    Dado a regra 50/50 e as despesas comuns de outubro:
      | quem pagou | valor        |
      | Mariana    | R$ 2.000,00  |
      | Mariana    | R$ 400,00    |
      | Lucas      | R$ 1.200,00  |
      | Lucas      | R$ 400,00    |
    Quando abro o painel de acerto de outubro
    Então vejo "Lucas deve R$ 400,00 para Mariana"
    E Mariana: pagou "R$ 2.400,00", cota "R$ 2.000,00", diferença "+R$ 400,00"
    E Lucas: pagou "R$ 1.600,00", cota "R$ 2.000,00", diferença "-R$ 400,00"

  Cenário: Despesas pessoais não entram
    Dado uma despesa pessoal de "R$ 500,00" de Mariana
    Quando abro o painel de acerto
    Então o total comum não inclui "R$ 500,00"

  Cenário: Divisão proporcional
    Dado a regra 60% / 40% e total comum de "R$ 1.000,00" pago integralmente por Mariana
    Quando abro o painel
    Então a cota de Mariana é "R$ 600,00" e a de Lucas é "R$ 400,00"
    E vejo "Lucas deve R$ 400,00 para Mariana"

  Cenário: Centavo ímpar não se perde
    Dado a regra 50/50 e uma única despesa comum de "R$ 100,01" paga por Mariana
    Quando abro o painel
    Então as cotas somam exatamente "R$ 100,01"
    E uma cota é "R$ 50,01" e a outra "R$ 50,00"

  Cenário: Mês equilibrado
    Dado que ambos pagaram o mesmo valor em despesas comuns
    Quando abro o painel
    Então vejo "Tudo certo neste mês" e nenhuma sugestão de transferência

  Cenário: Mês sem despesas comuns
    Dado que não há despesas comuns no mês
    Quando abro o painel
    Então vejo o estado vazio explicativo e nenhum valor devido

  Cenário: Família com um só membro
    Dado que a família tem apenas Mariana
    Quando abro o painel
    Então vejo que o acerto exige pelo menos dois membros e a ação "Convidar membro"

  Cenário: Três membros
    Dado três membros e regra igualitária com total comum de "R$ 900,00" pago só por Mariana
    Quando abro o painel
    Então a cota de cada um é "R$ 300,00"
    E as sugestões são duas transferências de "R$ 300,00" para Mariana

  Cenário: Navegar entre meses
    Quando seleciono o mês anterior
    Então o painel recalcula apenas com as despesas daquele mês

  Cenário: Ver as despesas que compõem o cálculo
    Quando expando "Ver despesas comuns do período"
    Então vejo a lista com quem pagou e valor, cuja soma é o total comum
```

## Experiência
[FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md): frase-herói, cartões por membro, botão *Registrar acerto*, lista expansível, aviso "Despesas pessoais não entram na divisão".

## Fora de escopo
Registrar o acerto (US-011), receitas no rateio, rateio por item/subitens (AP2, NEED-008), gráficos, notificações.

## Perguntas em aberto / pontos para o Tech Lead
- Bloqueante: **SDD-002** (ADR-006) deve existir antes do desenvolvimento.
- Algoritmo de sugestão para N > 2 e desempate do centavo precisam ser determinísticos e testados com propriedade (soma das cotas = total).
