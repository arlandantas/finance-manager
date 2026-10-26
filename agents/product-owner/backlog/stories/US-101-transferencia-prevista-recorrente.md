# US-101 — Transferência prevista recorrente (todo mês)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-26 Previsão unificada · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Could** · 2,0 (V3/U1/R2) · **3** |
| Status | Proposta pelo PO em 2026-10-26; sem SDD novo se reaproveitar a série materializada com `kind` (ADR-025/023; TL confirma) |
| Depende de | **US-100**, US-091 (padrão "Repetir todo mês"), US-058/059 (séries) |
| Corte | Cortável; vem depois da pontual |
| Rastreabilidade | **NEED-030** (RN-030.5) · **Q-U20 (usuário, 2026-10-26): pode ter recorrência mensal** · NEED-004 · FLUXO-019 · D-PO-105 |

## História
Como **membro da família**, quero **repetir uma transferência prevista todo mês**, para **prever um aporte ou repasse fixo sem recadastrar**.

## Regras
- **Q-U20 (usuário):** a transferência prevista **pode** repetir todo mês. Mesmo mecanismo das séries de previstas: **mensal, valor igual, materializada em 12 meses**, geração preguiçosa idempotente, unicidade (família, série, mês), fim "sem fim" ou "após N ocorrências".
- Na porta única e na tela Previstas, "Repetir: Todo mês" para tipo Transferência pede **origem e destino obrigatórios**, dia do mês (29..31 cai no último), início e fim.
- Cada ocorrência é uma **transferência prevista pontual** (US-100) e se efetiva individualmente; a série em si **nunca move dinheiro**.
- Editar a série reescreve só as futuras pendentes não alteradas (exceções e efetivadas ficam); encerrar remove as futuras pendentes; mesma disciplina das séries de despesa (L-2/L-3).
- Conta de origem ou destino **arquivada** com série ativa: impedimento listado ao arquivar (US-054); ocorrências já geradas ficam e não podem ser efetivadas até trocar a conta.
- Todas as ocorrências do mês entram na coluna "Transferências previstas" da US-060.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Transferência prevista recorrente

  Contexto:
    Dado a "Família Silva" com as contas "Salário" e "Reserva"
    E hoje é 12/10/2026
    E Mariana está autenticada

  Cenário: Criar a série de transferência
    Quando Mariana prevê a transferência de "R$ 500,00" de "Salário" para "Reserva" no dia 10 repetindo todo mês sem fim
    Então a série aparece em "Previstas" em "Transferências"
    E as próximas ocorrências aparecem nos meses seguintes

  Cenário: A série nunca move dinheiro
    Dado a série de transferência de "R$ 500,00"
    Quando passa o dia 10 sem ninguém efetivar
    Então os saldos de "Salário" e "Reserva" não mudam

  Cenário: Efetivar uma ocorrência
    Dado a ocorrência de novembro da série
    Quando Mariana efetiva a ocorrência
    Então a transferência real é registrada
    E as demais ocorrências continuam previstas

  Cenário: Editar a série não altera as efetivadas
    Dado a ocorrência de outubro efetivada
    Quando Mariana edita a série para "R$ 600,00" a partir de novembro
    Então a transferência de outubro continua "R$ 500,00"
    E as futuras passam a "R$ 600,00"

  Cenário: Origem e destino obrigatórios
    Quando Mariana escolhe repetir todo mês e deixa o destino vazio
    Então vê "Informe origem e destino"

  Cenário: Encerrar a série
    Quando Mariana encerra a série
    Então as ocorrências futuras pendentes são removidas
    E as efetivadas permanecem

  Cenário: Conta arquivada com série ativa
    Dado a série de transferência para "Reserva"
    Quando Mariana tenta arquivar a "Reserva"
    Então o diálogo lista a série de transferência como impedimento
```

## Fora de escopo
Periodicidade diferente de mensal; valores diferentes por mês; efetivação automática.
