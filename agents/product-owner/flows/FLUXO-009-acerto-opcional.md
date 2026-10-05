# FLUXO-009: Configurar o acerto de contas (opcional por família)

- **Objetivo**: permitir que a família use o app só como controle financeiro, sem partilha, e religar sem perder nada; manter o acerto discreto quando ligado.
- **Personas**: Mariana (Administradora) e Lucas (Membro).
- **Rastreabilidade**: [NEED-019](../../stakeholder/needs/NEED-019-acerto-de-contas-opcional.md), [NEED-007](../../stakeholder/needs/NEED-007-acerto-de-contas-familiar.md), [NEED-018](../../stakeholder/needs/NEED-018-divisao-opcional-e-por-lancamento.md) · Histórias [US-028](../backlog/stories/US-028-acerto-de-contas-opcional.md), [US-029](../backlog/stories/US-029-indicador-neutro-de-acerto-e-divida-antiga.md), [US-030](../backlog/stories/US-030-dividir-desligado-por-padrao.md), [US-022](../backlog/stories/US-022-rotulo-honesto-da-regra-de-divisao.md), [US-031](../backlog/stories/US-031-previa-de-impacto-da-regra-e-sugestao-pela-renda.md) · [FLUXO-003](FLUXO-003-acerto-de-contas.md) · D-PO-14.

## 1. Diagrama

```mermaid
flowchart TD
    ONB["Onboarding: 'Como vocês dividem as despesas?'"] -->|Quero acertar (padrão)| ON["Acerto LIGADO"]
    ONB -->|Só controlar, sem dividir| OFF["Acerto DESLIGADO"]
    CFG["Configurações da família (Administrador)"] -->|chave 'Acerto de contas entre membros'| ON
    CFG --> OFF
    ON -->|desligar| CHK{"Há diferença em aberto?"}
    CHK -->|não| OFF
    CHK -->|sim| CONF["Aviso: 'Há R$ X a acertar. Fica guardado e volta se você religar.'"]
    CONF -->|Desligar mesmo assim| OFF
    CONF -->|Cancelar| ON
    OFF -->|religar| ON
```

## 2. O que muda em cada estado

| Elemento | Ligado | Desligado |
| :--- | :-: | :-: |
| Item "Acerto" no menu / aba | Sim | **Não** |
| Linha "Acerto do mês" no Resumo (Home) | Sim (neutra) | **Não** |
| Aviso de meses anteriores pendentes | Sim | **Não** |
| Campo "Dividir" no lançamento | Sim (Só meu por padrão) | **Não** |
| Tela/regra de divisão | Sim | **Não** (dados guardados) |
| Totais, categorias, saldos | Iguais | Iguais |
| Dados (divisões, regra, acertos registrados) | Preservados | **Preservados**; religar restaura |

## 3. Telas
1. **Onboarding** (passo opcional, após criar a família): duas opções em cartões grandes; padrão "Quero acertar as diferenças entre os membros"; dica "Você pode mudar isso depois em Configurações da família".
2. **Configurações da família**: chave com explicação "Mostra quanto cada um gastou pela casa e o valor a acertar. Desligar não apaga nada." Membro vê a chave desabilitada com "Só o Administrador pode alterar".
3. **Diálogo de desligar com pendência**: título "Há R$ 380,00 a acertar entre os membros"; texto "Ao desligar, o valor fica guardado e volta se você religar."; botões "Cancelar" e "Desligar mesmo assim".
4. **Painel de Acerto (ligado)**: linguagem neutra: "Valor a acertar: R$ 380,00", "Para equilibrar o mês: Lucas transfere R$ 380,00 para Mariana", rótulo honesto da regra (US-022), linha "N despesas Só meu neste mês" (US-030) e tela da regra com prévia (US-031).
5. **Endereço direto com o recurso desligado**: "O acerto de contas está desligado nesta família" + "Voltar para o início".

## 4. Histórico
- 2026-10-04 — Criado no refinamento da R2.1.
