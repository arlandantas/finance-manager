# EN-002 — Percentual de divisão gravado em cada lançamento (migração sem mudar números) (Enabler)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R3** |
| Tipo | **Enabler técnico** (sem valor direto ao usuário; habilita US-043, US-044 e o rótulo ponderado) |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Should (pré-requisito da US-043) · 2,8 · 5 |
| Status | Refinada (PO) · modelo e estimativa **dependem do Tech Lead** |
| Depende de | US-008, US-009a/b, US-011, US-013a/b, US-022 |
| Corte | Cortar junto com a US-043 (a R3 inteira de "9b" sai ou fica) |
| Rastreabilidade | Parecer item 9b e §10 (risco: migração do acerto) · NEED-018 (RN-018.1..4) · Q-08/D-GES-08 · D-PO-27 |

## Justificativa do enabler
O acerto de contas é a área de **maior risco do produto** (parecer §10). Hoje o cálculo usa a **regra vigente por data** (Q-08). Para permitir "divisão definida no lançamento" (US-043), o **percentual efetivamente usado precisa ser gravado em cada lançamento**, e todo o histórico precisa migrar **sem que nenhum número já conferido mude**.

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
- Modelo (campo no lançamento ou tabela de rateio por lançamento, útil para N membros); estratégia de migração e **teste de regressão** com os valores homologados 3.169,90 / cota 1.584,95 / diferença 1.149,95; compatibilidade com `computeSettlement` e com os vetores S1..S13 do SDD-002 (ver `pedidos-ao-tech-lead-r21-r3.md`).

## Histórico
- 2026-10-04 — Criado a partir do parecer (item 9b; riscos §10).
