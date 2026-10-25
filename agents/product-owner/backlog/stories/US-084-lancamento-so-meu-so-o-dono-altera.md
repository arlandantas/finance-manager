# US-084 — Lançamento "Só meu" só pode ser alterado por quem tem controle sobre ele

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (PO prelim.) | Should · 3 (o TL estima; toca edição, exclusão, restauração, estorno e parcelas) |
| Status | **Entregue (DEV-88) e revisada em 2026-10-25 por D-GES-50 (D-PO-94): regra ampliada ao dono da conta e ao lançador** · SDD-028 §11 · ratificação do Stakeholder ainda pendente (D-PO-91) |
| Depende de | US-005, US-013a/b, US-030, US-036, US-041 |
| Rastreabilidade | SEC-021 · D-GES-42 · **D-GES-50 (revisão do usuário, 2026-10-25)** · reteste final §5 · RN-007.2 · US-013 · D-PO-91, D-PO-92, **D-PO-94** |

## História
Como **membro da família**, quero que **as despesas "Só meu" só possam ser alteradas por quem tem controle sobre elas** (quem pagou, o dono da conta onde caíram e quem as lançou), para **ter certeza de que ninguém mais, nem mesmo quem divide as contas comigo, mexe no que é pessoal, sem que o dono da conta ou quem lançou fiquem de mãos atadas**.

## Regras de negócio aplicáveis
*(Revisadas por D-GES-50 / D-PO-94: antes só o pagador podia alterar.)*
- **Quem controla** um lançamento "Só meu" (despesa não dividida) são **até três pessoas**: (1) o **pagador** ("Quem pagou?"), que é o **dono**; (2) o **dono da conta** onde o lançamento está (a conta de débito, ou o **dono do cartão** numa compra no cartão); (3) o **lançador**, quem registrou (o autor; no assistente, o membro que conectou o assistente, US-076a). Se Lucas registra, na conta de Carla, uma despesa "Só meu" paga por Mariana, **Mariana, Carla e Lucas** controlam.
- Quem controla pode **editar, excluir, restaurar (desfazer exclusão) e estornar/dar baixa** no lançamento. Vale também para **compras parceladas e suas parcelas** (US-041), **despesas previstas e séries** (US-009, US-058) e a **baixa de uma prevista** (US-019). Numa prevista "Só meu", controlam o **responsável** (dono), o **lançador** e o **dono da conta "Pagar com"**, quando houver.
- **Administrador não é exceção**: quem não está entre os três não altera, seja Administrador ou Membro.
- **Todos continuam vendo** o lançamento "Só meu" no Extrato, nos totais e no histórico de alterações (a regra é de alteração, não de visibilidade). A **exportação de dados** continua sem o "Só meu" de outra pessoa (SEC-029).
- **Trava anti-captura (inalterada):** só o **pagador (ou responsável) atual** transforma uma despesa **dividida** em "Só meu"; ninguém cria nem entrega "Só meu" **em nome de outro**. Dono da conta e lançador **não** ganham esse poder: o controle é sobre o que **já é** "Só meu".
- **Trocar o "Quem pagou?"** de um "Só meu": o pagador atual não o entrega a outra pessoa (a trava acima); quem controla sem ser o pagador pode, no máximo, **assumir o pagamento em seu próprio nome**.
- Lançamentos **divididos com a família** continuam editáveis por **qualquer membro** (US-013 inalterada).
- Lançamento "Só meu" cujo **dono (pagador/responsável) é ex-membro** fica **somente leitura para todos** (histórico), sem exceção. Se o ex-membro era apenas o dono da conta ou o lançador, ele simplesmente deixa de poder agir; os demais continuam.
- O formulário avisa antes de salvar quem passará a poder alterar: **"Depois de salvar, só Mariana, o dono da conta e você poderão alterar este lançamento."** (a lista muda conforme o caso; nunca omite quem perde o acesso).
- A interface **não esconde** o lançamento: para quem não controla, as ações de alterar ficam **ausentes** e há o texto **"Só Mariana, Carla e Lucas podem alterar este lançamento (Só meu)"** (nomes de quem controla, na ordem pagador, dono da conta, lançador, sem repetir).
- Se a alteração chegar por outro caminho (endereço direto, aba antiga), o app responde **"Só Mariana, Carla e Lucas podem alterar este lançamento."**, sem alterar nada.
- Transferências e acertos continuam como na US-013b; não são "Só meu".

## Critérios de aceite (Gherkin)

```gherkin
# language: pt
Funcionalidade: Lançamento "Só meu" só pelo dono

  Contexto:
    Dado a "Família Silva" com "Mariana" Administradora, "Lucas" Membro e "Carla" Membro
    E a conta "Conta da Mariana" é de Mariana e a conta "Conta da Carla" é de Carla
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

  Cenário: Administrador sem relação com o lançamento não altera o "Só meu" de outro
    Dado a despesa "Só meu" de "R$ 60,00" paga por "Lucas" na conta "Conta da Carla", lançada por "Lucas"
    E Mariana está autenticada
    Quando Mariana abre o detalhe dessa despesa
    Então não vê as ações "Editar" nem "Excluir"
    E vê "Só Lucas e Carla podem alterar este lançamento (Só meu)"

  Cenário: Dono da conta altera o "Só meu" de outra pessoa lançado na conta dele
    Dado a despesa "Só meu" de "R$ 60,00" paga por "Lucas" na conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla altera o valor para "R$ 65,00" e depois exclui e restaura a despesa
    Então a despesa mostra "R$ 65,00" e volta ao Extrato
    E o histórico registra as alterações por Carla

  Cenário: Quem lançou altera o "Só meu" que registrou, mesmo pago por outra pessoa
    Dado que Lucas registrou uma despesa "Só meu" paga por "Mariana" na conta "Conta da Mariana"
    E Lucas está autenticado
    Quando Lucas edita ou exclui essa despesa
    Então a alteração é aceita

  Cenário: Dono da conta estorna a baixa de uma prevista "Só meu" de outra pessoa
    Dado uma despesa prevista "Só meu" de Lucas paga com a conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla desfaz o pagamento dessa prevista
    Então a prevista volta a "Previsto"

  Cenário: Dono da conta não torna "Só meu" uma despesa dividida de outra pessoa
    Dado uma despesa dividida paga por "Mariana" na conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla tenta marcar a despesa como "Só meu"
    Então vê "Só quem pagou pode tornar este lançamento "Só meu"."
    E a despesa continua dividida

  Cenário: Dono da conta não cria "Só meu" em nome de outro
    Dado que Carla está autenticada
    Quando Carla registra uma despesa "Só meu" com "Quem pagou?" igual a "Mariana"
    Então vê "Um lançamento "Só meu" só pode ser em seu próprio nome."

  Cenário: Quem não controla não restaura nem estorna o "Só meu"
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

  Cenário: Registrar "Só meu" com o pagamento de outro avisa sobre quem poderá alterar
    Dado que Lucas está autenticado
    Quando Lucas abre o formulário com "Só meu" e "Quem pagou?" igual a "Mariana" na conta "Conta da Mariana"
    Então vê "Depois de salvar, só Mariana, o dono da conta e você poderão alterar este lançamento."

  Cenário: Parcela de compra "Só meu" segue a mesma regra
    Dado uma compra parcelada "Só meu" de Mariana
    E Lucas está autenticado
    Quando Lucas abre o detalhe de uma parcela
    Então não vê as ações de editar ou excluir a parcela nem a compra

  Cenário: Dono do cartão altera a compra parcelada "Só meu" de outra pessoa
    Dado uma compra parcelada "Só meu" paga por "Lucas" no cartão de "Carla"
    E Carla está autenticada
    Quando Carla exclui a compra parcelada e a restaura
    Então a compra volta ao Extrato

  Cenário: Lançamento "Só meu" de ex-membro é somente leitura
    Dado uma despesa "Só meu" paga por Lucas
    E Mariana removeu Lucas da família
    Quando Mariana abre o detalhe dessa despesa
    Então vê "Pago por Lucas (ex-membro)"
    E não vê as ações "Editar" nem "Excluir"

  Cenário: "Só meu" de ex-membro continua somente leitura mesmo para o dono da conta
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    E Lucas saiu da família
    E Carla está autenticada
    Quando Carla abre o detalhe dessa despesa
    Então não vê as ações "Editar" nem "Excluir"

  Cenário: Lançamento "Só meu" feito pelo assistente é do membro
    Dado que o assistente de Mariana lançou uma despesa "Só meu"
    E Lucas está autenticado
    Quando Lucas abre o detalhe dessa despesa
    Então não vê as ações "Editar" nem "Excluir"
    # exceção: Mariana, dona da conexão, e o dono da conta onde caiu a despesa continuam podendo alterá-la
```

## Experiência
Detalhe do lançamento (US-036) e Extrato (US-007): ações de alterar ausentes para quem não controla, com a linha de apoio "Só <nomes> podem alterar este lançamento (Só meu)". Formulário: aviso inline quando o lançamento é "Só meu" e quem salva não é o único que poderá alterá-lo ("Depois de salvar, só Mariana, o dono da conta e você poderão alterar este lançamento."). Sem estados novos além do erro `403` amigável.

## Fora de escopo
Esconder lançamentos "Só meu" dos outros membros, contas e cartões privados (NEED-021, só o spike), restringir a edição das próprias contas e cartões por titular (o levantamento SEC-021 cita "idem"; **não decidido**; previstas "Só meu" entram nesta história), delegação temporária de edição.

## Perguntas em aberto / pontos para o Tech Lead e o Stakeholder
- **Stakeholder (D-PO-91/94)**: a RN que permitia a qualquer membro corrigir qualquer lançamento (US-013, NEED-001) ganha uma exceção, agora com três controladores. O usuário já decidiu (D-GES-42 e D-GES-50); falta o Stakeholder ratificar.
- **Decisões do PO sem ambiguidade de produto (D-PO-94)**: dono ex-membro ⇒ somente leitura para todos; dono da conta e lançador não ganham o poder de *tornar* "Só meu"; controlador não-pagador só assume o pagamento em nome próprio. Se o usuário quiser que o dono da conta/lançador possam agir sobre o "Só meu" de um ex-membro, é decisão nova.
- **TL**: (1) confirmar "dono = `payerMemberId`" ou propor `authorMemberId`; (2) o reverter de lote da importação (US-069) e a baixa de previstas (US-019) que geram lançamento "Só meu" seguem a mesma regra?; (3) o levantamento SEC-021 também citou contas, cartões e previstas: estender a regra? (o PO propõe tratar em outra história, se o usuário quiser).

## Histórico
- 2026-10-24 — Criada (SEC-021, D-GES-42; D-PO-91, D-PO-92). Ajustes cruzados em US-005, US-007, US-013a, US-013b, US-030 e US-036.
- 2026-10-25 — Revisada por D-GES-50 (D-PO-94): controle também do dono da conta (ou do cartão) e do lançador; mensagens, aviso do formulário e cenários atualizados; previstas incluídas. Resolve a pergunta §5 do reteste final.
