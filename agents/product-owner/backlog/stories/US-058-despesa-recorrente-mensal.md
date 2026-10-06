# US-058 — Despesa recorrente mensal (gera previstas)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-17 Visão do Mês · **v0 alpha** |
| MoSCoW · Tamanho (PO) | **Must** · 8 (domínio crítico: datas/centavos; o TL estima) |
| Status | Refinada (PO) · **aguarda SDD do TL** (pedido em `release-v0-alpha.md` §4) |
| Depende de | US-006 (despesa prevista), US-019 (baixa) |
| Rastreabilidade | feedback-usuario-v0 U4 · escopo-v0-alpha decisão (c) · NEED-003 |

## História
Como **membro da família**, quero **cadastrar uma despesa fixa mensal uma vez**, para **ela gerar automaticamente as previstas dos próximos meses**.

## Regras
- Campos: descrição, valor, categoria, **dia do mês** (1–31), **início** e **fim opcional: "N meses" ou "sem fim"**. A conta de pagamento é da US-059.
- Gera previstas para um **horizonte de 12 meses** a partir do mês corrente; renova ao abrir o app, sem duplicar.
- **Dia 29–31:** em mês sem esse dia, vence no **último dia do mês** (31 em fevereiro = 28/29).
- **Editar série:** afeta **só as previstas futuras não baixadas**; as já baixadas ficam. **Encerrar série** remove as futuras pendentes e mantém o histórico.
- Prevista gerada é uma prevista comum (dar baixa, editar só aquela ocorrência). Alterar uma ocorrência isolada não muda a série.
- Só **despesa mensal**. Fora: outras periodicidades, reajuste automático, receita recorrente, transferência recorrente.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Despesa recorrente mensal

  Cenário: Cadastrar sem fim
    Quando Mariana cadastra "Internet" de "R$ 120,00" todo dia 10, sem fim
    Então existem 12 previstas "Internet" com vencimento no dia 10 dos próximos 12 meses

  Cenário: Cadastrar com fim em N meses
    Quando Mariana cadastra "Seguro" de "R$ 80,00" todo dia 5, por 6 meses
    Então existem 6 previstas "Seguro"
    E não existe prevista no 7º mês

  Cenário: Dia 31 em mês curto
    Quando Mariana cadastra "Condomínio" de "R$ 650,00" todo dia 31
    Então a prevista de fevereiro vence no último dia de fevereiro
    E a de abril vence em 30/04

  Cenário: Renovar o horizonte não duplica
    Dado a série "Internet" com 12 previstas
    Quando o app é aberto de novo no mesmo mês
    Então continuam 12 previstas "Internet"

  Cenário: Editar a série preserva o passado
    Dado a série "Internet" com a prevista de setembro já baixada
    Quando Mariana altera o valor da série para "R$ 130,00"
    Então as previstas futuras pendentes valem "R$ 130,00"
    E a de setembro baixada continua "R$ 120,00"

  Cenário: Encerrar a série
    Dado a série "Internet" com previstas futuras pendentes
    Quando Mariana encerra a série
    Então as futuras pendentes são removidas
    E as baixadas permanecem no histórico

  Cenário: Editar só uma ocorrência
    Quando Mariana altera o valor da prevista de dezembro para "R$ 200,00"
    Então só a de dezembro muda
    E a série permanece "R$ 120,00"
```

## Experiência
Opção "Repetir todo mês" no formulário de despesa prevista; selo "Recorrente" nas previstas; ação "Gerenciar recorrência" (editar/encerrar) com confirmação que mostra quantas previstas serão afetadas; loading/vazio/erro; 375 e 1280 px.

## Para o Tech Lead
Idempotência da geração, fuso/dia 29–31, edição de série e interação com baixa/acerto: ver `release-v0-alpha.md` §4.
