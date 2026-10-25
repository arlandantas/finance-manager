# US-003 — Convidar um membro por e-mail

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-1 Núcleo Familiar & Membros · R1 |
| MoSCoW · WSJF · Tamanho (PO) | Must · 6,3 · 3 |
| Status | Refinada (PO) · **revisada 2026-10-24 (aceite explícito, SEC-004)** |
| Depende de | US-002 |
| Rastreabilidade | NEED-012 (cenário do convite) · NEED-001 · RN-012.2 · FLUXO-002 · ADR-002 · SEC-004 · SDD-028 §1 · ADR-032 · D-GES-42 · D-PO-79 |

## História
Como **Administrador da família**, quero **convidar meu cônjuge pelo e-mail Google dele(a)**, para que **ele(a) entre com 1 clique já dentro da nossa família**.

## Regras de negócio aplicáveis
- Só **Administradores** convidam e cancelam convites.
- O convite vale para **um e-mail**; a comparação ignora maiúsculas/minúsculas.
- **O vínculo só ocorre com o aceite explícito do convidado** (SEC-004, D-GES-42 U1, D-PO-79): ao entrar com o Google no e-mail convidado, a pessoa vê o convite em **"Você foi convidado"** e só é vinculada ao tocar em **"Entrar na Família X"**. Entrar no app, abrir o link do e-mail ou fazer login **nunca** vinculam sozinhos.
- O convidado pode **Recusar** (o Administrador passa a ver "Recusado" e pode convidar de novo) ou **ignorar** o convite e criar a própria família.
- **Vários convites pendentes** para o mesmo e-mail: a pessoa vê **todos**, um cartão por convite, e escolhe; o app não escolhe nenhum sozinho.
- **Quem já faz parte de uma família não troca de família pelo convite**: para entrar em outra, precisa antes sair da atual (US-035). O convite continua pendente.
- O aceite exige o **e-mail Google verificado** igual ao do convite; o link do e-mail só mostra o cartão de aceite (abrir o link não tem efeito).
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

  Cenário: Convidado vê o convite e escolhe Entrar
    Dado que existe um convite pendente para "lucas@exemplo.com" da "Família Silva" enviado por Mariana
    Quando Lucas entra com o Google usando "Lucas@Exemplo.com"
    Então vê "Mariana convidou você para a Família Silva"
    E vê os botões "Entrar na Família Silva" e "Recusar"
    E não é vinculado a nenhuma família ainda

  Cenário: Aceitar o convite vincula ao clicar em Entrar
    Dado que Lucas vê o convite da "Família Silva" com papel "Membro"
    Quando Lucas toca em "Entrar na Família Silva"
    Então é vinculado à "Família Silva" com o papel do convite
    E o convite passa a "aceito"
    E ele vê a mensagem "Você entrou na Família Silva"

  Cenário: Recusar convite
    Dado que Lucas vê o convite da "Família Silva"
    Quando Lucas toca em "Recusar" e confirma "Recusar o convite da Família Silva?"
    Então o convite passa a "recusado"
    E Lucas não é vinculado à "Família Silva"
    E Lucas segue para criar a própria família
    E Mariana vê o convite como "Recusado" em "Convites"

  Cenário: Administrador pode convidar de novo quem recusou
    Dado que Lucas recusou o convite da "Família Silva"
    Quando Mariana convida "lucas@exemplo.com" novamente
    Então o novo convite é criado sem erro de convite duplicado

  Cenário: Dois convites pendentes
    Dado que existem convites pendentes para "lucas@exemplo.com" da "Família Silva" e da "Família Souza"
    Quando Lucas entra com o Google
    Então vê um cartão para a "Família Silva" e outro para a "Família Souza"
    E nenhuma das duas famílias é escolhida automaticamente

  Cenário: Aceitar um dos dois convites
    Dado que Lucas vê os convites da "Família Silva" e da "Família Souza"
    Quando Lucas toca em "Entrar na Família Souza"
    Então é vinculado à "Família Souza"
    E não é vinculado à "Família Silva"

  Cenário: Quem já tem família não troca pelo convite
    Dado que Lucas já faz parte da "Família Souza"
    E existe um convite pendente para Lucas da "Família Silva"
    Quando Lucas tenta entrar na "Família Silva"
    Então vê "Você já faz parte de uma família. Para entrar em outra, saia da atual em Família."
    E continua na "Família Souza"
    E o convite da "Família Silva" continua pendente

  Cenário: Link do e-mail mostra o cartão de aceite e não vincula
    Dado que existe um convite pendente para "lucas@exemplo.com"
    Quando Lucas abre o link do convite com a conta Google de "lucas@exemplo.com"
    Então vê o cartão "Mariana convidou você para a Família Silva" com "Entrar na Família Silva"
    E não é vinculado à família só por abrir o link

  Cenário: Convite que não está mais disponível
    Dado que Lucas vê o cartão do convite da "Família Silva"
    E Mariana cancela o convite
    Quando Lucas toca em "Entrar na Família Silva"
    Então vê "Este convite não está mais disponível"
    E não é vinculado à família

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
- 2026-10-24 — **Aceite explícito (SEC-004, SDD-028 §1, D-GES-42 U1, D-PO-79):** o vínculo automático no login/link foi **removido**. Substituído pelo cartão em "Você foi convidado" com **Entrar** e **Recusar**; novos cenários: aceitar, recusar, administrador convida de novo, dois convites, já tem família (sem troca), link do e-mail sem efeito, convite indisponível. "Convite expirado" e "Cancelar convite" não mudam. UI: tela `/convites` (SDD-028 §1.4). Estimativa do TL: 5 pts (SEC-004). Fluxo: FLUXO-002 rev. 3.
