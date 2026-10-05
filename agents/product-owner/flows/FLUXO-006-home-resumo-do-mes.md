# FLUXO-006: Home com Resumo do Mês e saldos recolhíveis (Mobile & Desktop)

- **Objetivo**: ao abrir o app, responder "como está o nosso mês?" em 3 segundos, sem que um saldo alto esconda contas a pagar, e sem expor um card de cobrança.
- **Personas**: Mariana (gestora da casa) e Lucas (membro em trânsito).
- **Rastreabilidade**: [NEED-015](../../stakeholder/needs/NEED-015-resumo-do-mes-na-home.md), [NEED-019](../../stakeholder/needs/NEED-019-acerto-de-contas-opcional.md), [NEED-014](../../stakeholder/needs/NEED-014-ocultar-valores-na-tela.md) · Histórias [US-025](../backlog/stories/US-025-resumo-do-mes-na-home.md), [US-026](../backlog/stories/US-026-saldos-das-contas-em-card-recolhivel.md), [US-029](../backlog/stories/US-029-indicador-neutro-de-acerto-e-divida-antiga.md), [US-036](../backlog/stories/US-036-detalhe-da-transacao-na-home.md), [US-051](../backlog/stories/US-051-receitas-previstas-e-saldo-previsto.md) (R3) · substitui o layout da [US-012](../backlog/stories/US-012-home-dashboard.md) · D-PO-13.

## 1. Diagrama de navegação

```mermaid
flowchart TD
    HOME["Home"] --> RES["Resumo do Mês (card herói)"]
    RES -->|setas mês anterior/próximo| RES
    RES -->|toque em 'A pagar'| PAGAR["Contas a pagar (FLUXO-005)"]
    RES -->|toque em 'Acerto do mês' (acerto ligado)| ACERTO["Aba Acerto (FLUXO-003)"]
    RES -->|toque em 'Acertos pendentes...'| ACERTO_OLD["Acerto do mês pendente mais antigo"]
    HOME --> SALDOS["Card 'Saldos das contas' (recolhido)"]
    SALDOS -->|expandir| LISTA["Lista de contas com saldo"]
    HOME --> ULT["Últimos lançamentos"]
    ULT -->|toque no item| DET["Detalhe da transação (FLUXO-013)"]
    ULT -->|Ver extrato| EXT["Extrato"]
    HOME --> FAB["Botão + (FLUXO-008)"]
```

## 2. Ordem dos blocos (de cima para baixo)
1. **Cabeçalho**: nome da família, olho "ocultar valores" ([FLUXO-007](FLUXO-007-ocultar-valores.md)), avatar.
2. **Resumo do Mês** (card herói; seletor de mês).
3. **A pagar** (dentro do resumo, expansível; atrasadas primeiro).
4. **Participação por membro** (como hoje, abaixo do resumo).
5. **Saldos das contas** (card recolhível, **recolhido por padrão**).
6. **Últimos lançamentos** (5; toque abre o detalhe).
7. **Botão "+"** fixo.

## 3. Wireframe textual do Resumo do Mês (mobile 375 px)

```text
┌─────────────────────────────────────────────┐
│ Família Silva                  👁   (Mariana)│
├─────────────────────────────────────────────┤
│  ‹   Outubro de 2026   ›                    │
│                                             │
│  Receitas            R$ 5.000,00            │
│  Despesas            R$ 1.200,00            │
│  ───────────────────────────────            │
│  Resultado do mês    R$ 3.800,00   (destaque)│
│                                             │
│  A pagar             R$ 1.258,90   ▾        │
│   ├ Previstas        R$   779,90            │
│   │  └ Internet fibra   R$ 129,90 [Atrasada]│
│   └ Faturas          R$   479,00            │
│                                             │
│  Saldo previsto      R$ 8.631,70   (destaque)│
│  ⓘ Saldo atual menos o que ainda vai pagar  │
│     neste mês                               │
│                                             │
│  Acerto do mês: R$ 380,00 a acertar    ›    │  ← só com acerto ligado
│  Acertos pendentes de meses anteriores:     │
│  1 mês (R$ 260,50)                     ›    │  ← só se houver
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Saldos das contas   R$ 9.890,60        ▸    │  ← recolhido; ▾ expande a lista
└─────────────────────────────────────────────┘
```

## 4. Regras de interface
- **Hierarquia**: *Resultado do mês* e *Saldo previsto* em destaque; as demais linhas em peso normal. Saldo previsto negativo ⇒ cor de atenção **com texto** "Seu saldo não cobre o que falta pagar" (nunca só cor).
- **Linha de acerto**: texto neutro em tamanho menor, sem cor de alerta; nunca "deve". Some com o acerto desligado.
- **Fórmula** sempre visível sob "Saldo previsto" (decisão do Stakeholder: número sem explicação gera desconfiança).
- **Reconciliação**: tocar em "Despesas" ou "Receitas" abre o Extrato do mesmo período e filtro (mesmo total).
- **Meses**: setas alteram só o resumo; "A pagar" e "Saldo previsto" em meses passados mostram só o que continua pendente.
- **R3**: linha "A receber" entre "A pagar" e "Saldo previsto" quando houver receitas previstas ([US-051](../backlog/stories/US-051-receitas-previstas-e-saldo-previsto.md)).
- **Desktop (≥ 1024 px)**: container de 960 px; Resumo à esquerda e "Saldos" + "Últimos lançamentos" em duas colunas (opcional, decisão de implementação); o "+" ancorado ao container ([US-038](../backlog/stories/US-038-navegacao-desktop-conteudo-contido.md)).

## 5. Estados
- **Carregando**: skeleton do card herói e dos blocos (sem salto de layout).
- **Vazio** (família sem dados): passo a passo "1. Cadastre uma conta 2. Convide quem divide as contas 3. Faça seu primeiro lançamento".
- **Mês sem movimento**: "Nada lançado neste mês ainda".
- **Erro**: "Não foi possível carregar o resumo do mês" + "Tentar de novo" (o "+" continua disponível).
- **Valores ocultos**: `R$ •••••` em todos os números monetários; percentuais e textos permanecem.

## 6. Histórico
- 2026-10-04 — Criado no refinamento da R2.1. Substitui a organização "saldo da família em destaque + card de acerto" do FLUXO de Home da US-012.
