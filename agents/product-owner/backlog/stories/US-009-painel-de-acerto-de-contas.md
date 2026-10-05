# US-009a — Ver o acerto de contas do mês (núcleo)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-4 Divisão & Acerto de Contas · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 4,4 · 5 (TL: 8 na história inteira; 9a + 9b) |
| Status | Especificada (SDD-002) · **substitui a antiga US-002** · fatia **9a** da US-009 (a 9b é [US-009b](US-009b-acerto-tres-membros-e-detalhe.md)) |
| Depende de | US-005, US-008 |
| Rastreabilidade | NEED-007 · RN-007.1, RN-007.2 · ADR-006 · FLUXO-003 |

## Fatiamento (decisão do PO, 2026-10-04)
A US-009 original (TL: 8 pontos) foi fatiada. **Esta 9a é o núcleo Must e entrega sozinha a promessa da R1 ("sei quem deve quanto a quem")**: motor `computeSettlement` completo (inclui N > 2 e vetores S1..S13 do SDD-002), API, painel com frase-herói, cartões por membro, navegação de mês e estados vazios. A **9b** acrescenta apenas a exibição de 3+ membros e a lista expansível de despesas; pode ser cortada sem quebrar a R1. US-011, US-012 e US-013a dependem apenas da 9a.

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


  Cenário: Navegar entre meses
    Quando seleciono o mês anterior
    Então o painel recalcula apenas com as despesas daquele mês

```

## Experiência
[FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md): frase-herói, cartões por membro, botão *Registrar acerto*, lista expansível, aviso "Despesas pessoais não entram na divisão".

## Fora de escopo
Exibição para 3+ membros e lista expansível de despesas (US-009b), registrar o acerto (US-011), receitas no rateio, rateio por item/subitens (AP2, NEED-008), gráficos, notificações.

## Perguntas em aberto / pontos para o Tech Lead
- Bloqueante: **SDD-002** (ADR-006) deve existir antes do desenvolvimento.
- Algoritmo de sugestão para N > 2 e desempate do centavo precisam ser determinísticos e testados com propriedade (soma das cotas = total).

## Histórico
- 2026-10-04 — **Revisão pós-homologação (R2.1):** o painel só existe com o acerto **ligado** (US-028), usa linguagem neutra, mostra o rótulo honesto da regra (US-022) e a linha de despesas "Só meu" (US-030). O cálculo não muda.
