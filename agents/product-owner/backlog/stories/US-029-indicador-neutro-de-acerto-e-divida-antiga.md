# US-029 — Indicador neutro de acerto na Home e aviso de dívida de mês anterior

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-16 Acerto e Divisão Opcionais e Transparentes · **R2.1** |
| MoSCoW · WSJF · Tamanho (PO, preliminar) | Must · 3,3 · 3 |
| Status | Refinada (PO) · tamanho a confirmar pelo Tech Lead |
| Depende de | US-028, US-025 (Resumo do Mês), US-009a, US-011 |
| Corte | **Não cortar** (ressalva 2 da homologação) |
| Rastreabilidade | Homologação achado 2 · Parecer item 2 e ressalva 2 · NEED-019 · NEED-007 (RN-007.5) · FLUXO-006, FLUXO-003 · D-PO-14 |

## História
Como **membro da família**, quero **um indicador discreto do acerto dentro do Resumo do Mês, com aviso de meses anteriores em aberto**, para **fechar o mês sem expor um card de cobrança e sem esquecer dívidas antigas**.

## Regras de negócio aplicáveis
- Só existe com o **acerto ligado** (US-028, RN-019.5). Desligado: nada aparece.
- Substitui o card "Acerto do mês" da Início (US-012) por **uma linha** dentro do Resumo do Mês: "Acerto do mês: R$ 380,00 a acertar" (texto neutro, sem "deve"); mês equilibrado: "Acerto do mês: em dia".
- Tocar na linha abre o painel de Acerto do mês corrente (aba **Acerto**).
- **Dívida de mês anterior** (RN-007.5): se algum mês anterior termina com diferença ≠ 0 e sem acerto que a zere, uma segunda linha discreta aparece: "Acertos pendentes de meses anteriores: 1 mês (R$ 260,50)" → leva ao painel do **mês mais antigo pendente**. Sem alarme (sem vermelho, sem ícone de erro).
- Respeita "ocultar valores" (valores mascarados; o texto da linha permanece).
- Mês sem despesas comuns: linha oculta.
- A linha usa o mesmo cálculo do painel de Acerto (fonte única): nunca diverge dele.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Indicador neutro de acerto na Home

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" e "Lucas"
    E o acerto de contas ligado
    E hoje é 12/10/2026
    E Lucas está autenticado na Home

  Cenário: Indicador mostra o valor a acertar do mês
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Lucas abre a Home
    Então o Resumo do Mês mostra "Acerto do mês: R$ 380,00 a acertar"
    E a Home não tem um card separado "Acerto do mês"

  Cenário: Indicador não usa a palavra deve
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Lucas abre a Home
    Então o indicador não contém a palavra "deve"

  Cenário: Mês equilibrado
    Dado que o mês de outubro de 2026 está equilibrado
    Quando Lucas abre a Home
    Então o Resumo do Mês mostra "Acerto do mês: em dia"

  Cenário: Mês sem despesas comuns
    Dado que não há despesas comuns em outubro de 2026
    Quando Lucas abre a Home
    Então o Resumo do Mês não mostra a linha de acerto

  Cenário: Tocar no indicador abre o painel
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Lucas toca em "Acerto do mês"
    Então vê o painel de Acerto de outubro de 2026

  Cenário: Dívida de mês anterior é sinalizada
    Dado uma diferença a acertar de "R$ 260,50" em setembro de 2026 sem acerto registrado
    Quando Lucas abre a Home
    Então o Resumo do Mês mostra "Acertos pendentes de meses anteriores: 1 mês (R$ 260,50)"

  Cenário: Tocar no aviso leva ao mês pendente mais antigo
    Dado uma diferença a acertar de "R$ 260,50" em setembro de 2026 sem acerto registrado
    Quando Lucas toca em "Acertos pendentes de meses anteriores"
    Então vê o painel de Acerto de setembro de 2026

  Cenário: Mês anterior acertado não gera aviso
    Dado que a diferença de setembro de 2026 foi acertada por completo
    Quando Lucas abre a Home
    Então o Resumo do Mês não mostra "Acertos pendentes de meses anteriores"

  Cenário: Aviso de mês anterior some após acertar
    Dado uma diferença a acertar de "R$ 260,50" em setembro de 2026 sem acerto registrado
    E Lucas registra o acerto de "R$ 260,50" de setembro de 2026
    Quando Lucas abre a Home
    Então o Resumo do Mês não mostra "Acertos pendentes de meses anteriores"

  Cenário: Valores ocultos mascaram o indicador
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    E os valores estão ocultos
    Quando Lucas abre a Home
    Então o indicador mostra "Acerto do mês: R$ ••••• a acertar"

  Cenário: Acerto desligado remove o indicador e o aviso
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    E o acerto de contas foi desligado
    Quando Lucas abre a Home
    Então o Resumo do Mês não mostra nenhuma linha de acerto

  Cenário: Indicador reconcilia com o painel
    Dado uma diferença a acertar de "R$ 380,00" em outubro de 2026
    Quando Lucas abre o painel de Acerto de outubro de 2026
    Então o valor a acertar do painel é "R$ 380,00"
```

## Experiência (UX/estados)
Linhas em texto secundário no final do card Resumo do Mês ([FLUXO-006](../../flows/FLUXO-006-home-resumo-do-mes.md)). Skeleton junto com o Resumo. Sem cor de alerta.

## Fora de escopo
Notificações/lembretes de acerto; acerto de vários meses de uma vez; mudar a mecânica de registrar o acerto (US-011).

## Perguntas em aberto / pontos para o Tech Lead
- Consulta de "meses anteriores com diferença em aberto" precisa de limite de janela (hipótese do PO: últimos 12 meses) para custo previsível.

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 2 e ressalva 2). Substitui o item 2 de [US-012](US-012-home-dashboard.md) (card "Acerto do mês").
