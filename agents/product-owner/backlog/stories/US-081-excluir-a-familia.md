# US-081 — Excluir a família

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (TL) | Should · 5 (SEC-017d) · prazo do TL: ≤ 90 dias · **revisão do TL obrigatória** |
| Status | Implementada (TASK-077, aguardando validação do Gestor) |
| Depende de | US-080, US-035 |
| Rastreabilidade | SEC-017d · RN-020.6 (revista, **Stakeholder valida**, D-PO-88) · LGPD art. 18 (**validação jurídica do usuário**) · ADR-019 (exceção controlada) · ADR-032 §6 · SDD-028 §7.5 · D-PO-86 |

## História
Como **Administrador que é a única pessoa ativa da família**, quero **excluir a família inteira**, para **apagar de vez todos os dados financeiros que cadastrei**.

## Regras de negócio aplicáveis
- Só funciona para o **Administrador que é o único membro ativo**. Com outros membros ativos, a ação fica indisponível com a orientação **"Remova os outros membros antes de excluir a família."** (US-035).
- Em **Família ➜ "Excluir família"**: página com a lista do que será apagado (**contas, cartões, categorias, tags, lançamentos, previstas, recorrentes, acertos, importações, análises e o histórico de alterações**) e o aviso de que **não há como desfazer**. Exige **digitar o nome atual da família**.
- Depois de excluir: a pessoa mantém a **conta de usuário** e segue para criar uma nova família (onboarding). Ex-membros ficam **sem vínculo**.
- **Nada de outra família** é tocado. Convites pendentes da família excluída deixam de valer.
- Recomendação exibida: "Baixe seus dados antes" ([US-079](US-079-baixar-meus-dados.md)).
- É a **única exceção** à regra "nada é apagado" (ADR-019), restrita a quem pede e à própria família.

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Excluir a família

  Contexto:
    Dado a "Família Silva" onde "Mariana" é a única pessoa ativa e Administradora
    E a família tem contas, lançamentos, cartões e previstas
    E Mariana está autenticada

  Cenário: Página explica o que será apagado
    Quando Mariana abre Família e toca em "Excluir família"
    Então vê a lista de tudo que será apagado
    E vê "Esta ação não pode ser desfeita"
    E vê o atalho "Baixar meus dados antes"

  Cenário: Botão só habilita com o nome da família
    Dado que Mariana está na página de confirmação
    Quando Mariana digita "Familia Silvo"
    Então o botão "Excluir a família" fica desabilitado

  Cenário: Nome divergente é recusado
    Dado que Mariana digitou um nome diferente do atual
    Quando o envio chega ao servidor
    Então vê "O nome digitado não confere com o da família"
    E nada é apagado

  Cenário: Excluir a família com sucesso
    Dado que Mariana digitou "Família Silva"
    Quando Mariana toca em "Excluir a família"
    Então vê "Família Silva excluída"
    E segue para criar uma nova família

  Cenário: Todos os dados da família somem
    Dado que Mariana excluiu a "Família Silva"
    Então contas, cartões, lançamentos, previstas, tags, categorias e acertos da família não existem mais

  Cenário: Outra família não é afetada
    Dado a "Família Souza" com lançamentos e contas
    Quando Mariana exclui a "Família Silva"
    Então os dados da "Família Souza" permanecem iguais

  Cenário: Com outros membros ativos a exclusão é bloqueada
    Dado que Lucas também é membro ativo da "Família Silva"
    Quando Mariana abre Família
    Então vê "Remova os outros membros antes de excluir a família."
    E o botão "Excluir família" não está disponível

  Cenário: Membro comum não vê a ação
    Dado que Lucas é membro comum da "Família Silva" e está autenticado
    Quando Lucas abre Família
    Então não vê "Excluir família"

  Cenário: Ex-membros ficam sem vínculo
    Dado que Lucas foi removido da "Família Silva" antes
    Quando Mariana exclui a "Família Silva"
    Então Lucas continua com a conta de usuário e sem nenhuma família

  Cenário: Convites pendentes deixam de valer
    Dado um convite pendente da "Família Silva" para "vovo@example.com"
    Quando Mariana exclui a "Família Silva"
    Então a vovó, ao entrar, não vê esse convite

  Cenário: Mariana segue com a conta
    Dado que Mariana excluiu a "Família Silva"
    Quando Mariana abre o Perfil
    Então a conta dela continua ativa

  Cenário: Duplo clique exclui uma única vez
    Quando Mariana toca duas vezes rapidamente em "Excluir a família"
    Então apenas uma exclusão é executada
```

## Experiência
Família ➜ rodapé "Zona de risco" ➜ "Excluir família" (vermelho, secundário). Página de confirmação com a lista, campo "Digite o nome da família" e botão vermelho. Sucesso: onboarding de nova família com *toast*.

## Fora de escopo
Excluir família com vários membros (exige remover os outros primeiro), período de arrependimento, exportação automática antes de excluir, restauração.

## Perguntas em aberto / pontos para o Tech Lead
- **TL**: o histórico de importações e análises de IA e o log de auditoria do assistente entram no apagamento? O PO pede que sim (tudo que tem `familyId`); o SDD §7.5 prevê o teste por `information_schema`.
- **Stakeholder (D-PO-88)**: a RN-020.6 ("excluir a família fora de escopo") é revista. Confirmar.

## Histórico
- 2026-10-24 — Criada (SEC-017d, SDD-028 §7.5; D-PO-86, D-PO-88).
