# US-022 — Rótulo honesto da regra de divisão no Acerto

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Must · 4,0 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-008, US-009a (já entregues) |
| Corte | **Não cortar** (ressalva 1 da homologação; sem isso o casal acha que o app errou) |
| Rastreabilidade | Homologação R1+R2 achado 1 · NEED-007 (RN-007.4) · NEED-018 (RN-018.2) · Q-08/D-GES-08 · FLUXO-003 · D-PO-12 |

## História
Como **membro da família**, quero que **a tela de Acerto mostre a divisão que realmente foi aplicada em cada mês**, para **entender de onde vem o número e não achar que o app errou**.

## Regras de negócio aplicáveis
- O **cálculo não muda** nesta história (vigência por data, Q-08): só a **explicação** muda. Nenhum valor de acerto homologado se altera (3.169,90 de despesas comuns; cota 1.584,95 a 50/50).
- O rótulo mostra o **percentual efetivamente aplicado**:
  - mês com uma única regra vigente: "Divisão igual (50% / 50%)" ou "Divisão proporcional (58% / 42%)";
  - mês com mudança de regra: cada trecho com a data de vigência e o **percentual ponderado do mês** ("na prática, 55,7% / 44,3%");
  - mês anterior à criação de qualquer regra: "Divisão igual (padrão)".
- Percentual ponderado = soma das cotas de cada membro ÷ total das despesas comuns do mês, com **uma casa decimal**.
- Todo membro vê o rótulo e o histórico de regras (transparência); só o Administrador altera (US-008).
- Mês sem despesas comuns não mostra percentual ponderado.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Rótulo da regra de divisão no Acerto

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E a regra de divisão igual vigente desde 01/01/2026
    E Lucas está autenticado na tela de Acerto

  Cenário: Mês com regra única mostra a regra daquele mês
    Dado despesas comuns de setembro de 2026 que somam "R$ 717,00"
    Quando Lucas abre o Acerto de setembro de 2026
    Então o rótulo da divisão é "Divisão igual (50% / 50%)"
    E a cota de Mariana é "R$ 358,50"

  Cenário: Mês passado não herda a regra criada depois
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    E despesas comuns de setembro de 2026 que somam "R$ 717,00"
    Quando Lucas abre o Acerto de setembro de 2026
    Então o rótulo da divisão é "Divisão igual (50% / 50%)"
    E o rótulo não menciona "58%"

  Cenário: Mês com mudança de regra mostra os dois trechos e o percentual ponderado
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    E uma despesa comum de "R$ 400,00" paga por Mariana em 02/10/2026
    E uma despesa comum de "R$ 1.000,00" paga por Lucas em 10/10/2026
    Quando Lucas abre o Acerto de outubro de 2026
    Então o rótulo da divisão é "50% / 50% até 03/10 · 58% / 42% a partir de 04/10"
    E vê "Na prática neste mês: 55,7% / 44,3%"
    E a cota de Mariana é "R$ 780,00" e a de Lucas é "R$ 620,00"

  Cenário: Percentual ponderado bate com as cotas exibidas
    Dado uma nova regra proporcional "58% / 42%" com vigência a partir de 04/10/2026
    E uma despesa comum de "R$ 400,00" paga por Mariana em 02/10/2026
    E uma despesa comum de "R$ 1.000,00" paga por Lucas em 10/10/2026
    Quando Lucas abre o Acerto de outubro de 2026
    Então a soma das cotas "R$ 780,00" e "R$ 620,00" é igual ao total comum "R$ 1.400,00"

  Cenário: Mês sem despesas comuns não mostra percentual ponderado
    Dado que não há despesas comuns em novembro de 2026
    Quando Lucas abre o Acerto de novembro de 2026
    Então vê "Nenhuma despesa dividida neste mês"
    E não vê "Na prática neste mês"

  Cenário: Todos os membros veem o histórico de regras
    Quando Lucas abre o histórico de regras de divisão
    Então vê cada regra com o percentual e a data de vigência
    E não vê o botão "Alterar regra"

  Cenário: Administrador altera a regra e o rótulo do mês corrente se atualiza
    Dado que Mariana é Administradora e salva a regra "58% / 42%" a partir de hoje, 04/10/2026
    Quando Lucas abre o Acerto de outubro de 2026
    Então o rótulo mostra os dois trechos com a data "04/10"

  Cenário: Números homologados permanecem
    Dado os dados de demonstração com despesas comuns de outubro de "R$ 3.169,90" e regra igual
    Quando Lucas abre o Acerto de outubro de 2026
    Então a cota de cada membro é "R$ 1.584,95"
    E o rótulo da divisão é "Divisão igual (50% / 50%)"

  Cenário: Falha ao carregar o histórico de regras
    Dado que o serviço está indisponível
    Quando Lucas abre o histórico de regras de divisão
    Então vê "Não foi possível carregar a regra de divisão" com o botão "Tentar de novo"
```

## Experiência (UX/estados)
Linha de rótulo logo abaixo do título do mês no painel de Acerto ([FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md)): texto curto + link "Ver histórico de regras". Em mês misto, segunda linha em texto secundário "Na prática neste mês: 55,7% / 44,3%". Respeita "ocultar valores" (percentuais permanecem visíveis, D-PO-15).

## Fora de escopo
Mudar o cálculo do acerto; percentual gravado por lançamento (EN-002, R3); prévia de impacto ao trocar a regra (US-031).

## Perguntas em aberto / pontos para o Tech Lead
- O DTO do acerto precisa expor os trechos de vigência do mês e o ponderado (DEV-14 já tratou `rule.kind`); confirmar o contrato e que o ponderado vem da mesma fonte das cotas.

## Histórico
- 2026-10-04 — Criada a partir da ressalva 1 da homologação e do parecer do Stakeholder (§9, item 1).
