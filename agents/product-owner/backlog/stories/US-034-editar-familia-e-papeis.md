# US-034 — Editar a família e alterar papéis dos membros

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-18 Manutenção de Cadastros · **R2.1** |
| MoSCoW · WSJF · Tamanho (TL) | Must (nome) / Should (papel) · 3,0 · 3 |
| Status | **Especificada** (SDD-012, pronta para o Dev) · tamanho confirmado pelo TL |
| Depende de | US-002, US-003 |
| Corte | **Nome da família: não cortar**; alterar papel é a parte cortável (Should) |
| Rastreabilidade | Parecer item 15 · NEED-020 (RN-020.5) · NEED-001 · FLUXO-011 · D-PO-18 |

## História
Como **Administrador**, quero **corrigir o nome da família e definir quem é Administrador ou Membro**, para **corrigir um erro de onboarding e dividir a gestão sem refazer a família**.

## Regras de negócio aplicáveis
- Editar **nome da família**: só Administrador; 2 a 60 caracteres; o nome não precisa ser único entre famílias.
- Alterar **papel** (Administrador ⇄ Membro): só Administrador. A família **sempre tem ao menos um Administrador** (RN-020.5): rebaixar o último Administrador é bloqueado ("Promova outro membro a Administrador antes").
- Mudança de papel tem efeito imediato; o membro afetado vê seu novo papel ao atualizar a tela.
- Cada alteração registra **autor e data** (trilha simples, mostrada em "Família").
- Nome da família aparece no cabeçalho/menu e nos e-mails de convite **futuros** (convites já enviados mantêm o nome antigo).

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Editar família e papéis

  Contexto:
    Dado a "Família Silva" com os membros "Mariana" Administradora e "Lucas" Membro
    E Mariana está autenticada em "Família"

  Cenário: Editar o nome da família
    Quando Mariana altera o nome para "Casa Silva" e salva
    Então vê "Família atualizada"
    E o cabeçalho mostra "Casa Silva"

  Cenário: Nome vazio ou curto
    Quando Mariana apaga o nome e salva
    Então vê "Informe um nome com 2 a 60 caracteres"
    E o nome não muda

  Cenário: Membro não edita o nome
    Dado que Lucas está autenticado em "Família"
    Quando Lucas abre a tela
    Então não vê o botão "Editar nome"

  Cenário: Promover membro a Administrador
    Quando Mariana altera o papel de "Lucas" para "Administrador"
    Então vê "Papel atualizado"
    E "Lucas" aparece como "Administrador"

  Cenário: Rebaixar um Administrador quando há outro
    Dado que "Lucas" é Administrador
    Quando Mariana altera o papel de "Lucas" para "Membro"
    Então "Lucas" aparece como "Membro"

  Cenário: Último Administrador não pode ser rebaixado
    Quando Mariana tenta alterar o próprio papel para "Membro"
    Então vê "A família precisa de pelo menos um Administrador. Promova outro membro antes."
    E o papel de "Mariana" não muda

  Cenário: Novo Administrador ganha as permissões
    Dado que Mariana promoveu "Lucas" a Administrador
    Quando Lucas abre "Configurações da família"
    Então a chave "Acerto de contas entre membros" está habilitada

  Cenário: Membro rebaixado perde as permissões
    Dado que "Lucas" é Administrador e foi rebaixado por Mariana
    Quando Lucas abre "Configurações da família"
    Então a chave "Acerto de contas entre membros" aparece desabilitada

  Cenário: Conflito de versão ao editar
    Dado que Mariana e Lucas Administrador abriram a edição do nome
    Quando Lucas salva "Casa Lucas"
    E Mariana tenta salvar "Casa Silva"
    Então Mariana vê "A família foi alterada por Lucas. Recarregue para continuar."

  Cenário: Duplo clique salva uma única vez
    Quando Mariana toca duas vezes rapidamente em "Salvar"
    Então a alteração é registrada uma única vez

  Cenário: Falha de rede
    Dado que não há conexão
    Quando Mariana salva um novo nome
    Então vê "Sem conexão. Seus dados continuam na tela, tente de novo."

  Cenário: Isolamento entre famílias
    Dado a "Família Souza"
    Quando Mariana tenta editar a "Família Souza" por endereço direto
    Então vê "Não encontrado"
```

## Experiência (UX/estados)
[FLUXO-011](../../flows/FLUXO-011-familia-e-membros.md): tela "Família" com cartão do nome (lápis "Editar nome") e lista de membros com menu "…" (Alterar papel, Remover — US-035).

## Fora de escopo
Remover membro e sair (US-035); excluir a família (**fora de escopo**, RN-020.6, Q-U02); foto da família; transferir a titularidade.

## Perguntas em aberto / pontos para o Tech Lead
- Garantia atômica do "último Administrador" sob concorrência (duas rebaixas simultâneas).

## Histórico
- 2026-10-04 — Criada a partir do parecer (item 15).
