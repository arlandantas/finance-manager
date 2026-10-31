# US-094 — Convidar o membro cadastrado e herdar o histórico no aceite

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-1 Núcleo Familiar (revisa a US-003) · **UR-2 (uso real)** |
| MoSCoW · WSJF · Tamanho (PO prelim.) | **Should (Alta)** · 3,8 (V8/U4/R7) · **5** (alto risco: segurança e migração do vínculo; o TL pode reestimar para 8 e fatiar) |
| Status | Proposta pelo PO em 2026-10-26; **bloqueada pelo spike do TL sobre herança de histórico no convite (TL-U1/TL-U2)** e por revisão de segurança; **2026-10-26 (TL): spike concluído no [ADR-033](../../../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (proposto); tamanho TL 8 (TL, ADR-033: 094a convite vinculado 3 + 094b aceite 5); SDD aguarda Q-TL-U1..U5 e revisão da Segurança**; **2026-10-30: Q-TL-U4 MUDOU (usuário, D-GES-63): ao assumir, a pessoa escolhe o próprio nome; o nome do cadastro é rótulo provisório e não prevalece (ADR-033 §2.2). PO ajusta a regra "nada é renomeado" (vale para o histórico financeiro, não para o nome) e o cenário do aceite com o campo "Seu nome na família". SDD de 094a/094b depois da 093; 094b incorpora SEC-062/063/064/066a** |
| Depende de | **US-092, US-093**; US-003 (convite com aceite explícito, SEC-004), US-035 (regra 18 de ex-membro) |
| Corte | Último da NEED-028; as fatias 092/093 já entregam valor sem convite |
| Rastreabilidade | **NEED-028** (RN-028.2, 028.3, 028.6, 028.7, 028.8) · **Q-U17 (usuário, 2026-10-26)** · SEC-004 · `estado/familia-convites-sessoes.md` · FLUXO-002, **FLUXO-020** · D-PO-103 |

## História
Como **Administrador**, quero **convidar por e-mail um membro já cadastrado, e como convidado quero assumir o meu cadastro com tudo o que já foi atrelado a mim**, para **entrar no app sem perder nem duplicar histórico, contas, cartões, previstas e saldo de acerto**.

## Regras
- **Só o Administrador convida** (Q-U17). Na ação "Convidar" do membro sem conta, o e-mail é obrigatório (preenche o do cadastro, se houver); o convite fica **vinculado àquele membro**. Vale tudo da US-003: validade 7 dias, tetos de convite, reenvio máx. 3, copiar link rotaciona o token, recusar.
- **Convite pendente de membro** (RN-028.6): convidar é opcional e posterior; o membro pode permanecer sem conta indefinidamente (ex.: criança). Cancelar o convite devolve o membro ao estado "Sem acesso ao app".
- **Aceite continua explícito (SEC-004):** o convidado só vincula ao confirmar em `/convites`; abrir o link ou fazer login **nunca** vincula. A tela de aceite mostra **o que ele vai assumir**: "Você vai assumir o cadastro de {nome}: {N} contas, {M} cartões, {K} lançamentos e {P} previstas", com o botão "Assumir meu cadastro" e "Recusar".
- **Herança (RN-028.2):** ao aceitar, o convidado **assume o membro existente**, com todo o histórico (lançamentos, "quem pagou"/"quem gastou"), contas e cartões em que é titular, previstas e séries, "Só meu" (passa a controlá-los, RN-028.4) e saldo de acerto. **Nada é recriado, duplicado ou renomeado**; os totais do mês e do acerto **não mudam** antes e depois do aceite (propriedade de teste).
- **E-mail:** o do convite deve **bater** com o do membro, quando informado; o convite é por e-mail verificado do Google (US-001). Um e-mail não vira dois membros. Se o convidado **já tem família**: 409 como hoje, convite segue pendente. Se já foi **ex-membro** desta família: o TL define se retoma o histórico antigo ou assume o do cadastro (TL-U2); até lá, não assume.
- **Convite que expira ou é recusado** não altera o membro nem o histórico.
- **Segurança:** o membro sem conta nunca aceita por outrem; reconvidar não permite "capturar" um cadastro de outra pessoa (o Administrador é quem vincula a um e-mail). O vínculo registra no histórico: "{Pessoa} assumiu o cadastro de {nome}".
- Após assumir, ele é um membro comum: papel "Membro", sessões, ocultar valores, MCP, exportação e exclusão de conta valem como para os demais.

## Critérios de aceite
```gherkin
# language: pt
Funcionalidade: Convidar membro cadastrado e assumir o histórico

  Contexto:
    Dado a "Família Silva" com "Mariana" (Administradora) e "Lucas" (Membro)
    E o membro sem conta "Ana" com a conta "Poupança Ana", o cartão "Itaú Ana" e 12 lançamentos
    E Mariana está autenticada

  Cenário: Convidar o membro cadastrado
    Quando Mariana convida "Ana" pelo e-mail "ana@exemplo.com"
    Então vê "Convite enviado" em "Ana"
    E "Ana" continua com o selo "Sem acesso ao app" até aceitar

  Cenário: Aceite assume o membro existente com o histórico
    Dado que Mariana convidou "Ana" por "ana@exemplo.com"
    E Ana entra com a conta Google "ana@exemplo.com"
    Quando Ana abre "Convites" e vê "Você vai assumir o cadastro de Ana: 1 conta, 1 cartão, 12 lançamentos"
    E confirma "Assumir meu cadastro"
    Então Ana vê os 12 lançamentos, a conta "Poupança Ana" e o cartão "Itaú Ana"
    E a família continua com 3 membros

  Cenário: Totais e acerto não mudam com o aceite
    Dado o saldo de acerto de "Ana" de "R$ 120,00" antes do aceite
    Quando Ana assume o cadastro
    Então o saldo de acerto de "Ana" continua "R$ 120,00"
    E os totais do mês não mudam

  Cenário: Só meu passa a ser controlado pela própria pessoa
    Dado que Mariana lançou uma despesa "Só meu" com pagador "Ana"
    Quando Ana assume o cadastro
    Então Ana pode editar e excluir essa despesa

  Cenário: Aceite é sempre explícito
    Dado que Mariana convidou "Ana" por "ana@exemplo.com"
    Quando Ana entra com a conta Google sem confirmar o aceite
    Então "Ana" continua sem acesso à família

  Cenário: E-mail diferente do cadastro
    Dado que o cadastro de "Ana" tem o e-mail "ana@exemplo.com"
    Quando Mariana tenta convidar "Ana" por "outra@exemplo.com"
    Então vê "O e-mail do convite deve ser o do cadastro de Ana"

  Cenário: Convidado que já tem família
    Dado que "ana@exemplo.com" já pertence a outra família
    Quando Ana tenta assumir o cadastro
    Então vê que já pertence a uma família
    E o convite continua pendente

  Cenário: Recusar não altera o cadastro
    Quando Ana recusa o convite
    Então "Ana" continua sem acesso ao app com todo o histórico

  Cenário: Convite não é um segundo membro
    Dado que Mariana convidou "Ana" por "ana@exemplo.com"
    Quando Ana aceita
    Então a lista de membros mostra "Ana" uma única vez

  Cenário: Só o Administrador convida
    Dado que Lucas está autenticado
    Quando Lucas abre o menu de "Ana"
    Então não vê a ação "Convidar"
```

## Fora de escopo
Fundir dois membros; convidar quem já tem família; convite em massa; login sem Google.
