# US-091 — "Repetir todo mês" na mesma porta (série de previstas)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-26 Previsão unificada · **UR-1 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,3 (V5/U3/R2) · **3** |
| Status | **Entregue e aceita pelo Gestor (D-GES-66)** (commits ef989b6, ea0559a; DEV-158..160; navegador real pendente). Antes: **SDD pronto (no SDD-031), aprovada para Dev** (2026-10-26): [SDD-031](../../../tech-lead/sdd/SDD-031-porta-unica-lancar-ou-prever-us-090-091.md) §7, **3 pts confirmados pelo TL** (reaproveita o serviço de séries) |
| Depende de | **US-090**, US-058/059 (séries, implementadas) |
| Corte | Cortável sem afetar a US-090 (a série segue acessível pela tela "Previstas") |
| Rastreabilidade | **NEED-031** RN-031.6 · **Q-U21 (usuário, 2026-10-26)** · NEED-004 · FLUXO-005, FLUXO-019 · D-PO-102 |

## História
Como **membro da família**, quero **marcar "Repetir todo mês" ao prever uma despesa**, para **cadastrar uma conta fixa sem ir a outra tela**.

## Regras
- **Q-U21 (usuário):** a série também aparece na mesma porta, **só como opção informativa de "repetir"**, **sem mudar nenhuma regra de série** (ADR-025: mensal, valor igual, materializada em 12 meses, conta de pagamento obrigatória).
- Em "Vai acontecer", aparece **"Repetir: Não | Todo mês"**; "Todo mês" revela **dia do mês** (padrão = dia do vencimento), **início**, **fim** (sem fim | após N ocorrências) e **"Pagar com" obrigatório** (conta bancária; no cartão, a cobrança mensal é a Assinatura da US-096).
- O texto de apoio informa o efeito: "Cria uma série mensal; as próximas 12 aparecem em A pagar".
- Salvar chama o serviço de série existente; exceções, edição e encerramento continuam na tela "Previstas" (L-2/L-3 vigentes).
- Em "Já aconteceu" a opção "Repetir" não existe.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Repetir todo mês na mesma porta

  Contexto:
    Dado a "Família Silva" com a conta "Corrente"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Criar a série pela porta única
    Dado que Mariana abre "Nova despesa" e seleciona "Vai acontecer"
    Quando Mariana informa "Internet" de "R$ 120,00", dia 10, "Pagar com: Corrente" e "Repetir: Todo mês" sem fim
    E salva a previsão
    Então a série "Internet" aparece em "Previstas"
    E as próximas ocorrências aparecem em "A pagar"

  Cenário: Série exige conta de pagamento
    Dado que Mariana seleciona "Repetir: Todo mês"
    Quando Mariana tenta salvar sem "Pagar com"
    Então vê "Séries exigem conta de pagamento"

  Cenário: Repetir não existe em Já aconteceu
    Quando Mariana seleciona "Já aconteceu"
    Então a opção "Repetir" não aparece

  Cenário: Resumo do efeito
    Quando Mariana seleciona "Repetir: Todo mês"
    Então vê "As próximas 12 aparecem em A pagar"
```

## Fora de escopo
Periodicidade que não seja mensal; valores diferentes por mês; série em cartão (US-096).
