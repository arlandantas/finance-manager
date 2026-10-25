# US-084 — Lançamento "Só meu" só pode ser alterado pelo dono

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (PO prelim.) | Should · 3 (o TL estima; toca edição, exclusão, restauração, estorno e parcelas) |
| Status | Refinada (PO) · **sem SDD ainda** · regra de negócio **pendente de validação do Stakeholder** (D-PO-91) |
| Depende de | US-005, US-013a/b, US-030, US-036, US-041 |
| Rastreabilidade | SEC-021 · D-GES-42 (decisão do usuário: "Só meu" editável/excluível só pelo dono) · RN-007.2 · US-013 · D-PO-91, D-PO-92 |

## História
Como **membro da família**, quero que **as minhas despesas "Só meu" só possam ser alteradas por mim**, para **ter certeza de que ninguém, nem mesmo quem divide as contas comigo, mexe no que é pessoal**.

## Regras de negócio aplicáveis
- **Dono** de um lançamento "Só meu" = **quem pagou** (campo "Quem pagou?"). Se Lucas registra, em nome de Mariana, uma despesa "Só meu", o dono é **Mariana** (D-PO-92). O formulário avisa antes de salvar: **"Depois de salvar, só Mariana poderá alterar este lançamento."**
- **Só o dono** pode **editar, excluir, restaurar (desfazer exclusão) e estornar** um lançamento "Só meu". Vale também para **compras parceladas e suas parcelas** (US-041) e para **lançamentos criados pelo assistente** (US-076a), cujo dono é o membro que conectou o assistente.
- **Administrador não é exceção**: a regra vale igualmente para papéis Administrador e Membro.
- **Todos continuam vendo** o lançamento "Só meu" no Extrato, nos totais e no histórico de alterações (a regra é de alteração, não de visibilidade).
- Lançamentos **divididos com a família** continuam editáveis por **qualquer membro** (US-013 inalterada). Para **converter** uma despesa dividida em "Só meu", é preciso ser quem **pagou**; quem não pagou não consegue marcar "Só meu" nela.
- O dono pode **passar** o lançamento "Só meu" para outra pessoa mudando "Quem pagou?"; o formulário avisa que ele perderá o acesso de edição.
- Lançamento "Só meu" de **ex-membro** fica **somente leitura** (histórico), sem exceção.
- A interface **não esconde** o lançamento: no detalhe, as ações de alterar ficam **ausentes** e há o texto **"Só Mariana pode alterar este lançamento (Só meu)"**.
- Se a alteração chegar por outro caminho (ex.: endereço direto, aba antiga), o app responde **"Só Mariana pode alterar este lançamento."**, sem alterar nada.
- Transferências e acertos continuam como na US-013b; não são "Só meu".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Lançamento "Só meu" só pelo dono

  Contexto:
    Dado a "Família Silva" com "Mariana" Administradora e "Lucas" Membro
    E uma despesa "Só meu" de "R$ 80,00" paga por "Mariana" em "Lazer e restaurantes"
    E uma despesa dividida de "R$ 150,50" paga por "Mariana" em "Supermercado"

  Cenário: Dono edita o próprio "Só meu"
    Dado que Mariana está autenticada
    Quando Mariana altera o valor da despesa "Só meu" para "R$ 90,00"
    Então a despesa mostra "R$ 90,00"
    E o histórico registra a alteração por Mariana

  Cenário: Dono exclui e restaura o próprio "Só meu"
    Dado que Mariana está autenticada
    Quando Mariana exclui a despesa "Só meu" e toca em "Desfazer"
    Então a despesa volta ao Extrato

  Cenário: Outro membro vê mas não altera
    Dado que Lucas está autenticado
    Quando Lucas abre o detalhe da despesa "Só meu" de Mariana
    Então vê "R$ 80,00" e "Só meu"
    E vê "Só Mariana pode alterar este lançamento (Só meu)"
    E não vê as ações "Editar" nem "Excluir"

  Cenário: Tentativa por endereço direto é recusada
    Dado que Lucas está autenticado
    Quando Lucas tenta alterar o valor da despesa "Só meu" de Mariana por endereço direto
    Então vê "Só Mariana pode alterar este lançamento."
    E o valor continua "R$ 80,00"

  Cenário: Administrador também não altera o "Só meu" de outro
    Dado a despesa "Só meu" de "R$ 60,00" paga por "Lucas"
    E Mariana está autenticada
    Quando Mariana abre o detalhe dessa despesa
    Então não vê as ações "Editar" nem "Excluir"

  Cenário: Outro membro não restaura nem estorna o "Só meu"
    Dado que Mariana excluiu a despesa "Só meu"
    E Lucas está autenticado
    Quando Lucas tenta restaurar a despesa excluída
    Então vê "Só Mariana pode alterar este lançamento."

  Cenário: Despesa dividida continua editável por qualquer membro
    Dado que Lucas está autenticado
    Quando Lucas altera o valor da despesa dividida para "R$ 160,00"
    Então a despesa mostra "R$ 160,00"
    E o histórico registra a alteração por Lucas

  Cenário: Quem não pagou não converte a despesa dividida em "Só meu"
    Dado que Lucas está autenticado
    Quando Lucas abre a edição da despesa dividida paga por Mariana
    Então a opção "Só meu" não está disponível para ele

  Cenário: Dono converte a própria despesa dividida em "Só meu"
    Dado que Mariana está autenticada
    Quando Mariana altera a despesa dividida para "Só meu"
    Então a despesa sai do acerto
    E só Mariana passa a poder alterá-la

  Cenário: Registrar "Só meu" em nome de outro avisa sobre o dono
    Dado que Lucas está autenticado
    Quando Lucas registra uma despesa "Só meu" com "Quem pagou?" igual a "Mariana"
    Então vê "Depois de salvar, só Mariana poderá alterar este lançamento."

  Cenário: Passar o "Só meu" para outra pessoa
    Dado que Mariana está autenticada
    Quando Mariana muda "Quem pagou?" da despesa "Só meu" para "Lucas" e confirma o aviso de que perderá a edição
    Então Lucas passa a poder alterar a despesa
    E Mariana deixa de poder alterá-la

  Cenário: Parcela de compra "Só meu" segue a mesma regra
    Dado uma compra parcelada "Só meu" de Mariana
    E Lucas está autenticado
    Quando Lucas abre o detalhe de uma parcela
    Então não vê as ações de editar ou excluir a parcela nem a compra

  Cenário: Lançamento "Só meu" de ex-membro é somente leitura
    Dado uma despesa "Só meu" paga por Lucas
    E Mariana removeu Lucas da família
    Quando Mariana abre o detalhe dessa despesa
    Então vê "Pago por Lucas (ex-membro)"
    E não vê as ações "Editar" nem "Excluir"

  Cenário: Lançamento "Só meu" feito pelo assistente é do membro
    Dado que o assistente de Mariana lançou uma despesa "Só meu"
    E Lucas está autenticado
    Quando Lucas abre o detalhe dessa despesa
    Então não vê as ações "Editar" nem "Excluir"
```

## Experiência
Detalhe do lançamento (US-036) e Extrato (US-007): ações de alterar ausentes para quem não é dono, com a linha de apoio "Só <dono> pode alterar este lançamento (Só meu)". Formulário: aviso inline quando "Quem pagou?" é outra pessoa e o lançamento é "Só meu". Sem estados novos além do erro `403` amigável.

## Fora de escopo
Esconder lançamentos "Só meu" dos outros membros, contas e cartões privados (NEED-021, só o spike), restringir edição de contas, cartões e previstas por titular (o levantamento SEC-021 cita "idem"; **não decidido**, ver pergunta), delegação temporária de edição.

## Perguntas em aberto / pontos para o Tech Lead e o Stakeholder
- **Stakeholder (D-PO-91)**: a RN que permitia a qualquer membro corrigir qualquer lançamento (US-013, NEED-001) ganha uma exceção. O usuário já decidiu (D-GES-42); falta o Stakeholder ratificar a regra e a definição de dono.
- **TL**: (1) confirmar "dono = `payerMemberId`" ou propor `authorMemberId`; (2) o reverter de lote da importação (US-069) e a baixa de previstas (US-019) que geram lançamento "Só meu" seguem a mesma regra?; (3) o levantamento SEC-021 também citou contas, cartões e previstas: estender a regra? (o PO propõe tratar em outra história, se o usuário quiser).

## Histórico
- 2026-10-24 — Criada (SEC-021, D-GES-42; D-PO-91, D-PO-92). Ajustes cruzados em US-005, US-007, US-013a, US-013b, US-030 e US-036.
