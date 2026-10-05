# US-031 — Prévia de impacto ao trocar a regra e sugestão pela renda

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Should · 2,0 · 3 |
| Status | **Especificada** (SDD-011, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-008, US-022 |
| Corte | **Cortável** (ver ordem de corte do backlog) |
| Rastreabilidade | Homologação achado 4 e 13 · Parecer ressalva 4 · NEED-007 (RN-007.6) · Q-08/D-GES-08 · FLUXO-003 |

## História
Como **Administrador**, quero **ver o impacto de uma nova regra de divisão antes de salvar e receber uma sugestão pela proporção das rendas**, para **mudar a regra com segurança e sem criar discussão**.

## Regras de negócio aplicáveis
- A prévia **não grava nada**. Mostra: a **data de vigência** ("vale a partir de 04/10/2026; lançamentos anteriores não mudam"), o percentual atual e o novo, e **quanto muda o acerto do mês corrente** (diferença em R$ entre o acerto de hoje e o que ficaria com a regra nova aplicada apenas aos lançamentos a partir da vigência).
- **Sugestão pela renda**: o Administrador informa a **renda mensal de cada membro** (valores usados só para sugerir; **não são gravados**) e o app preenche o percentual proporcional arredondado ao inteiro (6.500,00 e 4.800,00 ⇒ 58% / 42%). O Administrador pode ajustar.
- Todo membro vê a regra e o histórico em leitura, com a explicação "Só o Administrador altera a regra" (transparência).
- Soma dos percentuais = 100%.
- Ao salvar, o app **volta ao painel de Acerto** (achado 13) e o botão "Salvar regra" não pode ficar atrás do botão "+" (FAB oculto na tela da regra).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Prévia da regra de divisão

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas"
    E a regra de divisão igual vigente
    E hoje é 12/10/2026
    E Mariana está autenticada na tela "Regra de divisão"

  Cenário: Prévia mostra vigência e impacto no mês corrente
    Dado uma despesa comum de "R$ 1.000,00" paga por Lucas em 10/10/2026
    Quando Mariana informa os percentuais "58% / 42%" sem salvar
    Então vê "Vale a partir de 12/10/2026. Lançamentos anteriores não mudam."
    E vê "Impacto no acerto de outubro: R$ 0,00"

  Cenário: Prévia considera lançamentos a partir da vigência
    Dado uma despesa comum de "R$ 1.000,00" paga por Lucas em 10/10/2026
    E uma despesa comum de "R$ 500,00" paga por Lucas em 12/10/2026
    Quando Mariana informa os percentuais "58% / 42%" sem salvar
    Então vê "Impacto no acerto de outubro: R$ 40,00"

  Cenário: Sugestão pela renda
    Quando Mariana informa as rendas "R$ 6.500,00" e "R$ 4.800,00" e toca em "Sugerir pela renda"
    Então os percentuais ficam "58% / 42%"
    E vê a nota "As rendas informadas não são guardadas"

  Cenário: Sugestão editável
    Dado que a sugestão pela renda preencheu "58% / 42%"
    Quando Mariana altera para "60% / 40%"
    Então a prévia usa "60% / 40%"

  Cenário: Percentuais que não somam cem
    Quando Mariana informa os percentuais "60% / 50%"
    Então vê "Os percentuais precisam somar 100%"
    E o botão "Salvar regra" fica desabilitado

  Cenário: Prévia sem salvar não altera nada
    Quando Mariana informa os percentuais "58% / 42%" e sai da tela sem salvar
    Então a regra vigente continua "50% / 50%"

  Cenário: Salvar volta ao painel de Acerto
    Quando Mariana informa os percentuais "58% / 42%" e toca em "Salvar regra"
    Então vê o painel de Acerto do mês corrente
    E vê "Regra de divisão atualizada"

  Cenário: Membro vê a regra em leitura com explicação
    Dado que Lucas está autenticado na tela "Regra de divisão"
    Quando ele abre a tela
    Então vê a regra vigente e o histórico
    E vê "Só o Administrador altera a regra"
    E não vê o botão "Salvar regra"

  Cenário: Botão de lançamento rápido não cobre o salvar
    Dado um celular de 375 px de largura
    Quando Mariana abre a tela "Regra de divisão"
    Então o botão "+" não é exibido
    E o botão "Salvar regra" está totalmente visível
```

## Experiência (UX/estados)
Painel "Prévia" abaixo dos campos, atualizado ao digitar (sem chamada de gravação). Campo opcional "Sugerir pela renda" recolhido por padrão. [FLUXO-003](../../flows/FLUXO-003-acerto-de-contas.md) ganha a tela da regra revisada.

## Fora de escopo
Alterar lançamentos passados; guardar a renda dos membros; simulação de vários meses; percentual por lançamento (EN-002/US-043).

## Perguntas em aberto / pontos para o Tech Lead
- Cálculo da prévia: reaproveitar `computeSettlement` em modo "o que-se" sem gravar; custo e contrato (ver `pedidos-ao-tech-lead-r21-r3.md`).

## Histórico
- 2026-10-04 — Criada a partir da ressalva 4 e dos achados 4 e 13 da homologação.
