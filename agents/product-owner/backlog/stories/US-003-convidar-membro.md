# US-003 — Convidar um membro por e-mail

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-1 Núcleo Familiar & Membros · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 6,3 · 3 |
| Status | Refinada (PO) |
| Depende de | US-002 |
| Rastreabilidade | NEED-012 (cenário do convite) · NEED-001 · RN-012.2 · FLUXO-002 · ADR-002 |

## História
Como **Administrador da família**, quero **convidar meu cônjuge pelo e-mail Google dele(a)**, para que **ele(a) entre com 1 clique já dentro da nossa família**.

## Regras de negócio aplicáveis
- Só **Administradores** convidam e cancelam convites.
- O convite vale para **um e-mail**; a comparação ignora maiúsculas/minúsculas.
- O vínculo ocorre **no login** com o e-mail convidado; clicar no link sozinho não concede acesso.
- Convite **expira em 7 dias** (proposta do PO, ver pergunta Q-03).
- Papel do convidado: *Membro* (padrão) ou *Administrador*, escolhido por quem convida.
- E-mail já membro da família ou com convite pendente não pode ser convidado de novo.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Convite de membros

  Cenário: Enviar convite com sucesso
    Dado que Mariana é Administradora da "Família Silva"
    Quando ela convida "lucas@exemplo.com" com papel "Membro"
    Então um convite pendente é criado com validade de 7 dias
    E um e-mail com o link de acesso é enviado para "lucas@exemplo.com"
    E o convite aparece em "Convites pendentes"

  Cenário: Convidado entra e é vinculado automaticamente
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando Lucas entra com o Google usando "Lucas@Exemplo.com"
    Então ele é vinculado à "Família Silva" com o papel do convite
    E o convite passa a "aceito"
    E ele vê a mensagem "Você entrou na Família Silva"

  Cenário: Convite aberto com outra conta Google
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando alguém entra com "outra@exemplo.com" pelo link do convite
    Então não é vinculado à família
    E vê a mensagem "Este convite é para outro e-mail"

  Cenário: E-mail inválido
    Dado que estou no drawer de convite
    Quando informo "lucas@" e tento enviar
    Então vejo "Informe um e-mail válido"
    E nenhum convite é criado

  Cenário: E-mail que já é membro
    Dado que "lucas@exemplo.com" já é membro da família
    Quando tento convidá-lo novamente
    Então vejo "Esta pessoa já faz parte da família"

  Cenário: Convite duplicado pendente
    Dado que já existe convite pendente para "lucas@exemplo.com"
    Quando tento convidá-lo novamente
    Então vejo "Já existe um convite pendente para este e-mail"

  Cenário: Cancelar convite
    Dado um convite pendente para "lucas@exemplo.com"
    Quando o Administrador clica em "Cancelar convite"
    Então o convite deixa de valer
    E Lucas, ao entrar, cai no onboarding de nova família

  Cenário: Convite expirado
    Dado um convite emitido há mais de 7 dias
    Quando o convidado entra com o Google
    Então ele não é vinculado
    E vê "Convite expirado. Peça um novo convite."

  Cenário: Membro comum não convida
    Dado que Lucas tem papel "Membro"
    Quando ele acessa a tela "Família"
    Então a ação "Convidar membro" não está disponível
```

## Experiência
Ver [FLUXO-002](../../flows/FLUXO-002-onboarding-e-convite.md) — drawer *Convidar membro*, lista de membros e *Convites pendentes*. Em desenvolvimento, o e-mail é capturado pelo **Mailpit** (SMTP 1025, UI 8025, D-GES-10); nenhum e-mail real é enviado (D-GES, diretriz 1). Critério de verificação: o convite aparece na caixa do Mailpit com o link de aceite.

## Fora de escopo
Reenvio automático, convite por link/QR genérico, remoção de membro, transferência de administração, membros sem conta Google (dependentes), limite de membros.

## Perguntas em aberto / pontos para o Tech Lead
- **Q-03 (respondida, D-GES-07)**: validade do convite = **7 dias**.
- **Q-01 (respondida, D-GES-06)**: dependentes sem login ficam **fora do MVP** (US-021). No MVP só há membros com login.

## Histórico
- 2026-10-04 — **Nota pós-TL (US-039, D-PO-39):** "Copiar link" e "Reenviar e-mail" do convite pendente passam a **rotacionar o token** (o link anterior deixa de valer; validade de 7 dias mantida). Os cenários da US-003 não mudam; o teste de integração do convite deve cobrir o token antigo inválido.
