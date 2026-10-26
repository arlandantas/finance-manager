# US-083 — Cadastro restrito por lista de e-mails permitidos (alpha)

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | Should · 1 (D-GES-42 U6; "1 pt no Grupo A" do SDD-028 §9) |
| Status | Implementada (TASK-075, aguardando validação do Gestor) · sem SDD próprio (código em `ALLOWED_SIGNUP_EMAILS`) |
| Depende de | — |
| Rastreabilidade | Levantamento SEC (pergunta 3; reduz SEC-004, SEC-013, SEC-014) · D-GES-42 U6 · variável `ALLOWED_SIGNUP_EMAILS` · D-PO-90 |

## História
Como **dono do app durante o alpha**, quero **limitar quem pode criar conta a uma lista de e-mails que eu defino**, para **evitar que desconhecidos usem o app (e gastem a IA) enquanto o cadastro não é público**.

## Regras de negócio aplicáveis
- A lista vem da variável de ambiente **`ALLOWED_SIGNUP_EMAILS`** (e-mails separados por vírgula), definida pelo dono na hospedagem.
- **Lista vazia ou ausente = cadastro aberto** (não trava desenvolvimento nem testes).
- Com lista definida, só **e-mails da lista** conseguem **criar conta** ao entrar com o Google. A comparação **ignora maiúsculas/minúsculas e espaços**.
- Quem não está na lista vê **"O cadastro está restrito a convidados do alpha. Peça acesso a quem convidou você."**, **sem** conta criada, sem e-mail enviado e sem revelar quem está na lista.
- **Contas já existentes continuam entrando** mesmo que o e-mail saia da lista (hipótese do PO, D-PO-90; o TL confirma).
- **Um convite de família não contorna a lista** (hipótese do PO, D-PO-90): quem recebe convite precisa estar na lista para criar a conta. O Administrador avisa o dono do app.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Cadastro por lista de e-mails permitidos

  Cenário: Lista vazia mantém o cadastro aberto
    Dado que a lista de e-mails permitidos está vazia
    Quando "qualquer@exemplo.com" entra com o Google pela primeira vez
    Então a conta é criada
    E a pessoa segue para o onboarding

  Cenário: E-mail da lista cria conta
    Dado a lista de e-mails permitidos com "mariana@exemplo.com"
    Quando "mariana@exemplo.com" entra com o Google pela primeira vez
    Então a conta é criada

  Cenário: Comparação ignora maiúsculas e minúsculas
    Dado a lista de e-mails permitidos com "mariana@exemplo.com"
    Quando "Mariana@Exemplo.com" entra com o Google pela primeira vez
    Então a conta é criada

  Cenário: E-mail fora da lista é barrado
    Dado a lista de e-mails permitidos com "mariana@exemplo.com"
    Quando "estranho@exemplo.com" entra com o Google pela primeira vez
    Então vê "O cadastro está restrito a convidados do alpha. Peça acesso a quem convidou você."
    E nenhuma conta é criada
    E nenhum e-mail é enviado

  Cenário: A mensagem não revela a lista
    Dado a lista de e-mails permitidos com "mariana@exemplo.com"
    Quando "estranho@exemplo.com" entra com o Google
    Então a mensagem não cita nenhum e-mail da lista

  Cenário: Conta existente continua entrando
    Dado que "lucas@exemplo.com" já tem conta
    E a lista de e-mails permitidos não inclui "lucas@exemplo.com"
    Quando Lucas entra com o Google
    Então Lucas entra normalmente

  Cenário: Convite não contorna a lista
    Dado a lista de e-mails permitidos sem "vovo@exemplo.com"
    E um convite pendente para "vovo@exemplo.com"
    Quando a vovó entra com o Google pela primeira vez
    Então vê "O cadastro está restrito a convidados do alpha. Peça acesso a quem convidou você."
    E nenhuma conta é criada
```

## Experiência
Mensagem na própria tela de entrada, com o botão "Voltar". Sem tela nova.

## Fora de escopo
Tela administrativa para editar a lista (a lista é editada pelo dono na hospedagem), lista de espera, convite por link público, bloqueio de contas já existentes.

## Perguntas em aberto / pontos para o Tech Lead
- **TL**: confirmar as hipóteses de que contas existentes não são afetadas e de que o convite não contorna a lista (D-PO-90); definir onde a verificação roda (antes da criação do usuário).
- **Stakeholder**: nenhum impacto de negócio; o recurso é temporário (alpha).

## Histórico
- 2026-10-24 — Criada (D-GES-42 U6; D-PO-90).
