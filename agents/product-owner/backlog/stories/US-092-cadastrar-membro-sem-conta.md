# US-092 — Cadastrar membro da família sem conta ativa

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros / EPIC-1 Núcleo Familiar · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should (Alta)** · 5,7 (V7/U5/R5) · **3** (a estimativa real depende do modelo do TL) |
| Status | **Parcialmente entregue: 092a** (TASK-093, commit 62fdff2, aceita pelo Gestor D-GES-65; revisão final do TL aprovada em a73c88e); **092b pendente** (SDD-033 aprovado para Dev). Histórico: proposta pelo PO em 2026-10-26; **bloqueada pela investigação (spike) do TL sobre o modelo de membro/vínculo** (ver `pedidos-ao-tech-lead-uso-real.md`, TL-U1); **2026-10-26 (TL): spike concluído no [ADR-033](../../../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (proposto); tamanho TL 5 (TL, ADR-033: 092a modelo 3 + 092b cadastro 2); SDD aguarda Q-TL-U1..U5 e revisão da Segurança**; **2026-10-30 (TL): Q-TL-U1..U5 respondidas (D-GES-63), ADR-033 aceito (sujeito à Segurança); [SDD-033](../../../tech-lead/sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md) pronto, aprovado para Dev (092a 3 + 092b 2 = 5)** |
| Depende de | **Spike/ADR do TL**; US-002, US-003, US-034, US-035. Substitui e unifica a US-021 (parking lot) |
| Corte | Fatia fundamental da NEED-028: sem ela, 093..095 não existem |
| Rastreabilidade | **NEED-028** (RN-028.1, 028.3, 028.6, 028.7) · **Q-U15, Q-U17 (usuário, 2026-10-26)** · NEED-001, NEED-020 · Q-01/US-021 · FLUXO-011, **FLUXO-020** · D-PO-103 |

## História
Como **Administrador da família**, quero **cadastrar um membro só com o nome (e e-mail opcional), antes de ele entrar no app**, para **já atribuir a ele contas, cartões e despesas e convidá-lo depois, se e quando ele quiser**.

## Regras
- **Q-U17 (usuário):** **só o Administrador** cadastra (e, na US-094, convida) membros sem conta. Membro comum não vê a ação.
- **Q-U15 (usuário):** o mesmo mecanismo cobre o **adulto que ainda não entrou** e o **dependente que nunca terá login** (criança). Não há "tipo" a escolher; ficar sem conta é um estado, não um papel.
- Campos: **nome** (obrigatório, 2..60, único entre os membros ativos da família, comparação sem diferenciar caixa/acentos) e **e-mail opcional** (normalizado; um e-mail não pode pertencer a dois membros nem a um membro ativo já vinculado a usuário: RN-028.7).
- O membro sem conta aparece na tela **Família** com o selo **"Sem acesso ao app"**, no mesmo lugar e estilo dos demais membros, e em todos os seletores de pessoa (responsável, quem pagou, titular de conta/cartão, responsável da prevista) como qualquer outro.
- **Papel:** sempre "Membro". Ele **nunca é Administrador** enquanto não tiver conta; a regra "a família sempre tem ao menos 1 Administrador" não conta membros sem conta.
- **Sem acesso (RN-028.3):** não entra no app, não recebe e-mail, não tem sessão e não vê nada. Quem lança por ele continua sendo o **autor** (RN-001.1); a trilha de quem registrou se mantém no histórico.
- **Privacidade:** o e-mail digitado é dado pessoal de terceiro: só o Administrador o vê; é apagado se o membro for removido sem nunca ter tido conta, e entra na exportação/exclusão de dados da LGPD (a regra exata é do TL, TL-U1).
- Editar nome/e-mail do membro sem conta: só o Administrador; registro no histórico da família.
- Registro no histórico (`FamilyEvent`): "{Admin} cadastrou {nome} (sem acesso ao app)".

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Cadastrar membro sem conta ativa

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" (Administradora) e "Lucas" (Membro)
    E Mariana está autenticada

  Cenário: Administrador cadastra membro só com o nome
    Quando Mariana cadastra o membro "Ana"
    Então vê "Ana" na lista de membros com o selo "Sem acesso ao app"
    E "Ana" não recebe nenhum e-mail

  Cenário: Membro cadastrado aparece nos seletores de pessoa
    Dado que Mariana cadastrou o membro "Ana"
    Quando Mariana abre "Nova despesa"
    Então "Ana" aparece em "Quem pagou?" e em "Responsável"

  Cenário: E-mail é opcional
    Quando Mariana cadastra o membro "Ana" com o e-mail "ana@exemplo.com"
    Então "Ana" é cadastrada com o e-mail guardado só para o convite

  Cenário: Só o Administrador cadastra
    Dado que Lucas está autenticado
    Quando Lucas abre a tela "Família"
    Então não vê a ação "Cadastrar membro"

  Cenário: Nome repetido
    Dado que existe o membro "Ana"
    Quando Mariana cadastra o membro "ana"
    Então vê "Já existe um membro com este nome"

  Cenário: E-mail que já é de outro membro
    Dado que "Lucas" usa o e-mail "lucas@exemplo.com"
    Quando Mariana cadastra o membro "Lucas Filho" com o e-mail "lucas@exemplo.com"
    Então vê "Este e-mail já pertence a outro membro"

  Cenário: Membro sem conta nunca é Administrador
    Dado que Mariana cadastrou o membro "Ana"
    Quando Mariana abre o menu de "Ana"
    Então a ação "Tornar Administrador" não está disponível

  Cenário: Registro no histórico
    Quando Mariana cadastra o membro "Ana"
    Então o histórico da família mostra "Mariana cadastrou Ana (sem acesso ao app)"
```

## Fora de escopo
Convidar o membro (US-094); atribuir contas e lançamentos (US-093); login de dependente ou perfil infantil; permissões granulares (US-020).
