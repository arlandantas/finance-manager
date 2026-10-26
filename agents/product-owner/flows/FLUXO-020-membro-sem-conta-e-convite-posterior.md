# FLUXO-020: Membro sem conta e convite posterior

- **Objetivo**: montar a família real de uma vez (cônjuge, filhos), atribuir contas e despesas a cada um e só convidar quem quiser entrar, sem perder histórico.
- **Personas**: Mariana (Administradora), Ana (membro cadastrada, ainda sem acesso), Lucas (membro).
- **Rastreabilidade**: [NEED-028](../../stakeholder/needs/NEED-028-membro-sem-conta-ativa-e-convite-posterior.md) (Q-U15..Q-U17) · [US-092](../backlog/stories/US-092-cadastrar-membro-sem-conta.md), [US-093](../backlog/stories/US-093-atribuir-contas-e-lancamentos-ao-membro-sem-conta.md), [US-094](../backlog/stories/US-094-convidar-membro-cadastrado-e-assumir-historico.md), [US-095](../backlog/stories/US-095-ciclo-de-vida-do-membro-sem-conta.md) · estende [FLUXO-002](FLUXO-002-onboarding-e-convite.md) e [FLUXO-011](FLUXO-011-familia-e-membros.md) · D-PO-103

## 1. Diagrama

```mermaid
flowchart TD
    FAM["Família (Administrador)"] -->|Cadastrar membro| CAD["Nome (e-mail opcional)"]
    CAD --> SEM["Membro com selo 'Sem acesso ao app'"]
    SEM --> USO["Aparece em Quem pagou · Responsável · Titular · Acerto"]
    SEM -->|Editar / remover e-mail| SEM
    SEM -->|Convidar (e-mail obrigatório)| CONV["Convite vinculado ao membro (7 dias)"]
    CONV -->|Cancelar / vencer / recusar| SEM
    CONV -->|Convidado entra com Google| TELA["/convites: 'Você vai assumir o cadastro de Ana: N contas, M cartões, K lançamentos'"]
    TELA -->|Assumir meu cadastro| ASS["Mesmo membro, agora com acesso; histórico, contas, previstas e acerto intactos"]
    TELA -->|Recusar| SEM
    SEM -->|Remover| REV["Revisão de pendências (FLUXO-011) ➔ ex-membro com histórico"]
```

## 2. Especificação de interface
1. **Tela Família**: ação **"Cadastrar membro"** (só Administrador) abre drawer com nome e e-mail opcional; o membro aparece na lista com o selo **"Sem acesso ao app"** e o menu "…" (Editar, Convidar, Remover); sem "Tornar Administrador".
2. **Seletores de pessoa** (Quem pagou, Responsável, Titular, Divisão) listam o membro sem conta como qualquer outro; no filtro de "Quem pagou" leva o selo.
3. **Convidar**: pede o e-mail (preenchido se cadastrado); mensagens de e-mail divergente, duplicado e já-tem-família como na US-003; "Convite enviado" no cartão do membro, com Copiar link/Reenviar/Cancelar (US-039).
4. **Aceite** em `/convites`: a tela mostra o que será assumido (contas, cartões, lançamentos, previstas) e o botão **"Assumir meu cadastro"**; abrir o link ou fazer login **nunca** vincula (SEC-004).
5. **Remoção**: diálogo de revisão do FLUXO-011; não há sessões a encerrar.
6. **Estados**: vazio ("Só você por enquanto"), erro, convite expirado/recusado voltando ao selo "Sem acesso".

## 3. Regras
Só o Administrador cadastra e convida; sem acesso = não recebe e-mail nem vê nada; o acerto continua só registro; totais e acerto são idênticos antes e depois do aceite. Modelo de dados e herança: decisão do TL (spike TL-U1/U2).

## 4. Histórico
- 2026-10-26 — Criado no refinamento da NEED-028.
