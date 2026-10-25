# US-070 — Análise de gastos por IA: o que pode ser evitado

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-23 Entrada de Dados e Análise por IA · **R4-C (proposta)** · fatia 1/4 da análise |
| MoSCoW · WSJF · Tamanho (PO prelim.) | Should · 1,8 · 8 (se o TL estimar mais, fatiar: 070a pedido/resultado básico, 070b recorrentes) |
| Status | Refinada (PO) · aguarda ADR de privacidade e SDD do TL (payload agregado, prompt, validação da resposta) |
| Depende de | **EN-004**, **EN-005**, US-048/049 (visões sintéticas: fonte dos agregados), US-058 (recorrentes), US-040 (parcela por mês da fatura) |
| Corte | Cortável com as demais da análise (primeiro bloco a sair depois do MCP) |
| Rastreabilidade | **NEED-027** (RN-027.1..5, 027.7, 027.9; Q-U01, Q-U11, Q-U12) · NEED-023 · RF45 · RN15, RN16 · FLUXO-017 · D-PO-64 |

## História
Como **membro da família**, quero **pedir uma análise dos gastos de um mês fechado e ver, em linguagem simples, o que é essencial, importante ou supérfluo e onde há margem para economizar**, para **saber o que cortar sem julgamento entre nós**.

## Regras de negócio aplicáveis
- **Sob demanda**, para um **mês fechado** (ou o mês corrente, marcado "parcial"), no máximo **uma análise nova por mês e família** além de refazer explicitamente (limite do TL; EN-004 controla custo).
- **Dados enviados (hipótese Q-U11):** totais por categoria e mês (últimos 3 a 6 meses), variação mês a mês e **estabelecimentos/lançamentos recorrentes** (nome genérico da descrição, valor e frequência), **sem nomes de pessoas e sem identificadores de conta/cartão**; texto livre completo fica fora. A tela "O que será enviado" mostra exatamente isso antes de pedir.
- **Números do sistema** (RN-027.5): totais, variações e economias potenciais são calculados pelo app e só **interpretados** pela IA; o resultado nunca mostra número que o app não calculou.
- **Método fixo (Q-U12):** cada categoria é classificada em Essencial / Importante / Supérfluo, com o **porquê**; destaque para "gastos que parecem evitáveis" (assinaturas esquecidas, recorrentes inflados, picos pontuais) com valor mensal e anual estimados.
- **Tom e limites:** sem ranquear ou culpar membros (RN-027.9): a análise fala de categorias e hábitos coletivos, não de "quem gastou"; aviso fixo de que **não substitui um profissional** e sem recomendação de investimento/crédito (RN-027.4).
- Nunca grava nem altera dados (RN-027.3, RN15).
- **Teto global de IA (SEC-013, SDD-028 §5, D-GES-42 U3, D-PO-83)**: além do limite da família, existe um **teto mensal do app inteiro**. Atingido, a análise fica indisponível para todas as famílias, e a mensagem **não revela** que é um teto global nem quanto foi gasto. O teto da família segue com a mensagem atual (com a data em que volta).
- Estados: sem dados suficientes ("Precisa de pelo menos 2 meses com lançamentos"), IA desligada, teto atingido, erro do provedor.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Análise de gastos evitáveis

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E "Análise de gastos" ligada pelo Administrador
    E 4 meses de lançamentos categorizados até out/2026
    E hoje é 05/11/2026
    E Lucas está autenticado
    E o provedor de LLM em modo simulado

  Cenário: Pedir a análise mostra antes o que será enviado
    Dado que Lucas abre "Análise" e "Gastos evitáveis"
    Quando Lucas escolhe o mês "out/2026" e toca em "Analisar"
    Então vê "O que será enviado: totais por categoria dos últimos 4 meses e valores recorrentes, sem nomes de pessoas nem dados de conta"
    E precisa tocar em "Enviar para análise" para continuar

  Cenário: Resultado classifica as categorias com o porquê
    Dado que Lucas enviou a análise de "out/2026"
    Quando o resultado é exibido
    Então cada categoria aparece como "Essencial", "Importante" ou "Supérfluo"
    E cada classificação tem uma explicação curta

  Cenário: Gastos que parecem evitáveis têm valor mensal e anual
    Dado que a assinatura "Streaming X" de "R$ 55,90" aparece nos 4 meses
    Quando o resultado da análise é exibido
    Então vê o gasto "Streaming X" como possível gasto evitável
    E vê "R$ 55,90 por mês · R$ 670,80 por ano"

  Cenário: Números vêm do sistema
    Dado que o total de "Lazer" em out/2026 é "R$ 480,00" no Resumo do Mês
    Quando o resultado da análise é exibido
    Então o valor de "Lazer" mostrado é "R$ 480,00"

  Cenário: Resposta da IA com número inconsistente é descartada
    Dado que o provedor simulado devolve para "Lazer" o valor "R$ 999,00"
    Quando o resultado da análise é exibido
    Então o valor mostrado de "Lazer" continua "R$ 480,00"

  Cenário: Análise não aponta pessoas
    Quando o resultado da análise é exibido
    Então o texto não contém o nome "Mariana" nem "Lucas"
    E vê o aviso "Esta análise é educativa e não substitui um profissional"

  Cenário: Análise nunca altera dados
    Quando o resultado da análise é exibido
    Então nenhuma categoria, lançamento ou orçamento foi alterado

  Cenário: Poucos dados
    Dado que a família tem apenas 1 mês de lançamentos
    Quando Lucas abre "Gastos evitáveis"
    Então vê "Precisa de pelo menos 2 meses com lançamentos para analisar"
    E o botão "Analisar" está desabilitado

  Cenário: IA desligada
    Dado que "Análise de gastos" está desligada
    Quando Lucas abre "Gastos evitáveis"
    Então vê "A análise por IA está desligada nesta família"

  Cenário: Teto global do app atingido
    Dado que o teto mensal de IA do app inteiro foi atingido
    E a família de Lucas ainda está abaixo do próprio limite
    Quando Lucas toca em "Enviar para análise"
    Então vê "A análise com IA está indisponível no momento. Tente de novo mais tarde."
    E a mensagem não menciona teto, limite global nem valores gastos
    E nenhuma análise é salva

  Cenário: Erro do provedor
    Dado que o provedor simulado responde com erro
    Quando Lucas toca em "Enviar para análise"
    Então vê "Não foi possível analisar agora. Tente novamente em instantes"
    E nenhuma análise é salva
```

## Experiência (UX/estados)
[FLUXO-017](../../flows/FLUXO-017-analise-de-gastos-evitaveis.md): tela de pedido (escolha de mês, "o que será enviado"), carregamento com cancelar, resultado em três blocos (resumo, categorias por grupo, possíveis gastos evitáveis).

## Fora de escopo
Metas/orçamento automático, comparação entre famílias, análise por membro, análise com texto livre dos lançamentos (Q-U11 ampliável depois), análise contínua/agendada.

## Histórico
- 2026-10-24 — Criada (D-PO-64).
- 2026-10-24 — **Teto global (SEC-013, D-PO-83):** cenário "Teto global do app atingido" com mensagem genérica que não revela o teto.
