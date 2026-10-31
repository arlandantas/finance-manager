# US-095 — Ciclo de vida do membro sem conta (editar, permanecer sem acesso, remover)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should** · 3,5 (V3/U2/R2) · **2** |
| Status | Proposta pelo PO em 2026-10-26; depende do spike do TL (TL-U1); **2026-10-26 (TL): spike concluído no [ADR-033](../../../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (proposto); tamanho TL 2 (TL, ADR-033, confirma o PO); SDD aguarda Q-TL-U1..U5 e revisão da Segurança**; **2026-10-30: Q-TL-U5 aceita pelo usuário (remoção anonimiza o e-mail dos convites do cadastro, sujeita à Segurança; já entra na 092a, SDD-033); editar o nome só enquanto sem conta (depois do aceite: 409 `MEMBER_IS_LINKED`); SDD próprio depois da 094** |
| Depende de | **US-092, US-093**; US-035 (remoção com revisão de pendências) |
| Corte | 1ª a cortar da NEED-028 |
| Rastreabilidade | **NEED-028** (RN-028.6, 028.8) · **Q-U15 (usuário)** · NEED-020 · FLUXO-011, FLUXO-020 · D-PO-103 |

## História
Como **Administrador**, quero **editar, manter indefinidamente sem acesso ou remover um membro sem conta**, para **cuidar do cadastro de quem nunca vai entrar (ex.: criança) sem perder histórico**.

## Regras
- **Editar** nome e e-mail (só o Administrador): o histórico passa a mostrar o nome novo; o e-mail só importa para o convite.
- **Permanecer sem acesso indefinidamente** (RN-028.6): não expira, não gera lembretes, não conta nos tetos de convite e não aparece como "convite pendente".
- **Remover** segue NEED-020 / US-035: revisão das pendências (contas e cartões do membro reatribuídos ou arquivados; previstas e séries passam a alguém; acerto em aberto exige "Reconheço a diferença"), confirmação digitada e o membro vira **ex-membro com histórico preservado**. Como não há sessão, não há sessões a encerrar.
- Ex-membro sem conta **não tem como ser reconvidado ao mesmo cadastro** (o convite cria novo membro, como na regra 18 da US-035).
- Se nunca teve e-mail, nada pessoal a anonimizar; se teve, o e-mail é apagado na remoção.
- O Administrador pode **remover o e-mail** sem remover o membro.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Ciclo de vida do membro sem conta

  Contexto:
    Dado a "Família Silva" com "Mariana" (Administradora) e "Lucas" (Membro)
    E o membro sem conta "Ana" com a conta "Poupança Ana"
    E Mariana está autenticada

  Cenário: Renomear membro sem conta
    Quando Mariana renomeia "Ana" para "Ana Clara"
    Então o Extrato mostra "Ana Clara" nos lançamentos antigos

  Cenário: Criança permanece sem acesso
    Dado que Mariana nunca convidou "Ana"
    Quando passam 90 dias
    Então "Ana" continua com o selo "Sem acesso ao app"
    E não há convite pendente nem lembrete

  Cenário: Remover exige reatribuir a conta
    Quando Mariana remove "Ana"
    Então o diálogo de revisão pede reatribuir ou arquivar a "Poupança Ana"

  Cenário: Remover preserva o histórico
    Dado que "Ana" pagou 3 despesas
    Quando Mariana conclui a remoção de "Ana"
    Então "Ana" vira ex-membro
    E as 3 despesas continuam no Extrato com o nome "Ana"

  Cenário: Remover o e-mail do cadastro
    Dado que "Ana" tem o e-mail "ana@exemplo.com"
    Quando Mariana remove o e-mail do cadastro de "Ana"
    Então "Ana" continua na família sem e-mail
```

## Fora de escopo
Reconvidar ex-membro ao mesmo cadastro; mesclar cadastros.
