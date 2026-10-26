# US-072 — Aceitar, uma a uma, as sugestões de recategorização

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 · **R4-C (proposta)** · fatia 3/4 da análise |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Could · 1,5 · 3 |
| Status | Implementada (TASK-063, aguardando validação do Gestor) |
| Depende de | US-070, US-014, US-045 (edição não financeira de tags/categoria) |
| Corte | Cortável (2º do bloco da análise) |
| Rastreabilidade | **NEED-027** (RN-027.3) · NEED-023 §5 · NEED-013/016 · RF45 · RN15 · FLUXO-017 · D-PO-65 |

## História
Como **membro da família**, quero **ver as sugestões de categoria que a análise encontrou e aplicar só as que eu aprovar**, para **melhorar a qualidade dos dados sem a IA mexer sozinha**.

## Regras de negócio aplicáveis
- A análise pode apontar lançamentos que parecem estar em categoria "estranha" (ex.: "Farmácia" em "Lazer"), com a categoria sugerida e o porquê.
- **Cada sugestão é aceita individualmente**; não existe "aceitar tudo" (RN-027.3, RN15). Recusar descarta a sugestão para a família.
- Aplicar muda **apenas a categoria** do lançamento (não valor, data, divisão nem conta), registra no histórico de edição quem aceitou e é desfazível por 8 s ou pelo histórico do lançamento.
- Categoria é edição **não financeira** (D-PO-46): vale também para lançamento em fatura paga ou conta arquivada.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Aceitar sugestões de categoria

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E uma análise com a sugestão de mudar "Droga Raia" de "Lazer" para "Saúde"
    E Lucas está autenticado

  Cenário: Cada sugestão mostra o porquê
    Quando Lucas abre "Sugestões de categoria"
    Então vê "Droga Raia: de Lazer para Saúde"
    E vê a explicação da sugestão

  Cenário: Aceitar altera só a categoria
    Quando Lucas aceita a sugestão de "Droga Raia"
    Então o lançamento de "Droga Raia" passa a ter a categoria "Saúde"
    E o valor, a data e a divisão do lançamento não mudam

  Cenário: Não existe aceitar tudo
    Quando Lucas abre "Sugestões de categoria"
    Então não vê o botão "Aceitar todas"

  Cenário: Recusar descarta a sugestão
    Quando Lucas recusa a sugestão de "Droga Raia"
    Então a sugestão some
    E a categoria do lançamento continua "Lazer"

  Cenário: Aceite fica no histórico do lançamento
    Dado que Lucas aceitou a sugestão de "Droga Raia"
    Quando Mariana abre o histórico do lançamento
    Então vê "Categoria alterada de Lazer para Saúde por Lucas (sugestão da análise)"

  Cenário: Desfazer devolve a categoria anterior
    Dado que Lucas aceitou a sugestão de "Droga Raia"
    Quando Lucas toca em "Desfazer" em até 8 segundos
    Então a categoria do lançamento volta a "Lazer"

  Cenário: Fatura paga não impede mudar categoria
    Dado que "Droga Raia" está em uma fatura paga
    Quando Lucas aceita a sugestão
    Então a categoria muda para "Saúde"
```

## Histórico
- 2026-10-24 — Criada (D-PO-65).
