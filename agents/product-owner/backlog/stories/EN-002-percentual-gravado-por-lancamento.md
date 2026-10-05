# EN-002 — Percentual de divisão gravado em cada lançamento (migração sem mudar números) (Enabler)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R3, 2ª entrega** (depois da US-040) |
| Tipo | **Enabler técnico** (sem valor direto ao usuário; habilita **US-042 (Must)**, US-043, US-044 e o rótulo ponderado) |
| MoSCoW · WSJF · Tamanho (TL) | **Must** (era Should: a US-042 depende dela, D-PO-34) · 1,1 (recalc.) · 13 (002a 5 + 002b 8) (PO: 5) |
| Status | **Esboçada** (SDD-015, esboço do Tech Lead) · tamanho re-estimado pelo TL; detalhar o SDD antes do Dev |
| Depende de | US-008, US-009a/b, US-011, US-013a/b, US-022; na ordem da R3 vem depois da US-040 |
| Corte | **Não cortar** (Must: a US-042 depende do percentual gravado; D-PO-34). Só a **US-043** (e a US-044) são cortáveis |
| Rastreabilidade | Parecer item 9b e §10 (risco: migração do acerto) · NEED-018 (RN-018.1..4) · Q-08/D-GES-08 · D-PO-27, **D-PO-34** · SDD-015 (esboço), ADR-016, TL-07 |

## Justificativa do enabler
O acerto de contas é a área de **maior risco do produto** (parecer §10). Hoje o cálculo usa a **regra vigente por data** (Q-08). Para permitir "divisão definida no lançamento" (US-043), o **percentual efetivamente usado precisa ser gravado em cada lançamento**, e todo o histórico precisa migrar **sem que nenhum número já conferido mude**.

## Fatias e entrega em duas etapas (D-PO-34; ADR-016 e SDD-015)
| Fatia | Pts | Conteúdo |
| :-- | :-: | :-- |
| **EN-002a** | 5 | Modelo (rateio por membro em centavos e em *basis points*), motor `STORED` ao lado do motor `LEGACY` congelado, gravação do rateio nos **novos** lançamentos; interface inalterada |
| **EN-002b** | 8 | Script de migração (idempotente, retomável, atômico por família), instantâneo antes/depois, ***gate*** de 1 centavo que **falha o deploy**, *rollback* testado e harness de regressão (S1..S13, S14..S16 e dados homologados) |
**Release em duas etapas:** (1) EN-002a + 002b com **interface inalterada** (nada muda para o usuário; números idênticos); (2) só **depois da janela de reversão** a US-043 libera o modo "De outro jeito". São da 002a os cenários "Mudar a regra depois da migração não altera lançamentos antigos" e "Rótulo do mês usa os percentuais gravados"; todos os demais são da 002b.

## Resultado verificável (critérios de aceite)

```gherkin
# language: pt
Funcionalidade: Percentual gravado por lançamento com migração sem diferença

  Contexto:
    Dado os dados de demonstração da "Família Silva" com os membros "Mariana" e "Lucas"
    E um instantâneo dos acertos de todos os meses antes da migração

  Cenário: Números homologados permanecem após a migração
    Dado despesas comuns de outubro de 2026 que somam "R$ 3.169,90" com regra igual
    Quando a migração do percentual por lançamento é aplicada
    Então o acerto de outubro de 2026 mostra despesas comuns "R$ 3.169,90"
    E a cota de cada membro continua "R$ 1.584,95"
    E a diferença continua "R$ 1.149,95"

  Cenário: Setembro permanece idêntico
    Dado despesas comuns de setembro de 2026 que somam "R$ 717,00" com regra igual
    Quando a migração do percentual por lançamento é aplicada
    Então a cota de cada membro em setembro continua "R$ 358,50"
    E a diferença a acertar de setembro continua "R$ 260,50"

  Cenário: Mês com mudança de regra migra cada lançamento com o percentual da sua data
    Dado a regra igual até 03/10/2026 e a regra "58% / 42%" a partir de 04/10/2026
    E uma despesa comum de "R$ 400,00" em 02/10/2026 e outra de "R$ 1.000,00" em 10/10/2026
    Quando a migração do percentual por lançamento é aplicada
    Então o lançamento de 02/10/2026 fica gravado com "50% / 50%"
    E o lançamento de 10/10/2026 fica gravado com "58% / 42%"
    E as cotas do mês continuam "R$ 780,00" e "R$ 620,00"

  Cenário: Centavos por lançamento não alteram o acerto antigo
    Dado a regra "50% / 50%" e três despesas comuns de "R$ 100,01" pagas por Mariana no mesmo mês
    E o instantâneo mostra as cotas "R$ 150,02" para Mariana e "R$ 150,01" para Lucas
    Quando a migração do percentual por lançamento é aplicada
    Então as cotas do mês continuam "R$ 150,02" e "R$ 150,01"
    E a diferença a acertar do mês continua igual ao instantâneo
    E os centavos gravados nos três lançamentos somam "R$ 150,02" e "R$ 150,01"

  Cenário: Lançamento pessoal migra sem percentual
    Dado uma despesa "Só meu" de "R$ 80,00"
    Quando a migração do percentual por lançamento é aplicada
    Então a despesa continua fora do acerto

  Cenário: Mudar a regra depois da migração não altera lançamentos antigos
    Dado que a migração foi aplicada
    Quando o Administrador salva a regra "70% / 30%"
    Então nenhum lançamento antigo muda de percentual
    E nenhum acerto de mês anterior muda

  Cenário: Acertos registrados e saldo restante permanecem
    Dado um acerto registrado de "R$ 500,00" em outubro de 2026
    Quando a migração do percentual por lançamento é aplicada
    Então o saldo restante de outubro de 2026 continua igual

  Cenário: Rótulo do mês usa os percentuais gravados
    Dado a migração aplicada e um mês com percentuais gravados "50% / 50%" e "58% / 42%"
    Quando Lucas abre o Acerto do mês
    Então o rótulo mostra "Na prática neste mês: 55,7% / 44,3%"

  Cenário: Migração é repetível sem efeito
    Dado que a migração já foi aplicada
    Quando a migração é executada de novo
    Então nenhum dado muda

  Cenário: Falha no meio da migração não deixa dados pela metade
    Dado que a migração falha depois de processar metade dos lançamentos
    Quando a migração é reaplicada
    Então todos os lançamentos ficam gravados com o percentual correto
    E o instantâneo dos acertos continua igual ao original

  Cenário: Regressão geral dos acertos
    Quando a migração é aplicada a todos os dados de teste
    Então o acerto de todos os meses é idêntico ao instantâneo anterior
```

## Fora de escopo
Mudança de interface (US-043); lembrar por categoria (US-044); histórico de regras em tabela própria (o TL decide se mantém).

## Perguntas em aberto / pontos para o Tech Lead
- **Respondido pelo TL** (ADR-016, SDD-015): tabela de rateio por membro com `bps` **e** `amountInCents`; o arredondamento por lançamento (RN-018.3) **difere** do por grupo em centavos (ex.: três despesas de R$ 100,01 a 50/50), por isso o modelo grava **centavos** e o *gate* garante cotas idênticas; regressão com os valores homologados e os vetores S1..S16.

## Histórico
- 2026-10-04 — Criado a partir do parecer (item 9b; riscos §10).
- 2026-10-04 — **Revisão pós-TL (D-PO-34):** re-estimada de 5 para **13** (002a 5 + 002b 8); promovida a **Must** porque a US-042 (Must) exige o percentual gravado; fica logo depois da US-040 na R3; acrescentado o cenário "Centavos por lançamento não alteram o acerto antigo" (valores ímpares).
