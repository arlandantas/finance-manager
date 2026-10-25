# US-084 — Lançamento "Só meu" só pode ser alterado por quem tem controle sobre ele

| Campo | Valor |
| :-- | :-- |
| Épico / Release | EPIC-25 Segurança, Privacidade e Acesso · **R4-S (correções SEC do alpha)** |
| MoSCoW · Tamanho (PO prelim.) | Should · 3 (o TL estima; toca edição, exclusão, restauração, estorno e parcelas) |
| Status | **Entregue (DEV-88), revisada por D-GES-50 (D-PO-94) e ajustada em 2026-10-25 por D-GES-52/53 (D-PO-95): Administrador altera o "Só meu" de ex-membro (com poderes plenos, D-GES-55/D-PO-96); quem só controla não muda divisão, pagador, conta nem "Pagar com" e não assume o pagamento; histórico mantém quem alterou** · SDD-028 §11 · ratificação do Stakeholder de D-PO-91/94 concluída (D-GES-50) |
| Depende de | US-005, US-013a/b, US-030, US-036, US-041 |
| Rastreabilidade | **D-GES-59, D-PO-98, SEC-051** · SEC-021 · D-GES-42 · **D-GES-50 (revisão do usuário, 2026-10-25)** · **D-GES-52, D-GES-53** · SEC-042..046 · reteste final §5 · RN-007.2 · US-013 · D-PO-91, D-PO-92, **D-PO-94, D-PO-95, D-PO-96** · **D-GES-55** |

## História
Como **membro da família**, quero que **as despesas "Só meu" só possam ser alteradas por quem tem controle sobre elas** (quem pagou, o dono da conta onde caíram e quem as lançou), para **ter certeza de que ninguém mais, nem mesmo quem divide as contas comigo, mexe no que é pessoal, sem que o dono da conta ou quem lançou fiquem de mãos atadas**.

## Regras de negócio aplicáveis
*(Revisadas por D-GES-50 / D-PO-94: antes só o pagador podia alterar.)*
- **Quem controla** um lançamento "Só meu" (despesa não dividida) são **até três pessoas**: (1) o **pagador** ("Quem pagou?"), que é o **dono**; (2) o **dono da conta** onde o lançamento está (a conta de débito, ou o **dono do cartão** numa compra no cartão); (3) o **lançador**, quem registrou (o autor; no assistente, o membro que conectou o assistente, US-076a). Se Lucas registra, na conta de Carla, uma despesa "Só meu" paga por Mariana, **Mariana, Carla e Lucas** controlam.
- Quem controla pode **editar, excluir, restaurar (desfazer exclusão) e estornar/dar baixa** no lançamento. Vale também para **compras parceladas e suas parcelas** (US-041), **despesas previstas e séries** (US-009, US-058) e a **baixa de uma prevista** (US-019). Numa prevista "Só meu", controlam o **responsável** (dono), o **lançador** e o **dono da conta "Pagar com"**, quando houver.
- **Administrador não é exceção**: quem não está entre os três não altera, seja Administrador ou Membro.
- **Todos continuam vendo** o lançamento "Só meu" no Extrato, nos totais e no histórico de alterações (a regra é de alteração, não de visibilidade). A **exportação de dados** continua sem o "Só meu" de outra pessoa (SEC-029).
- **Trava anti-captura (inalterada):** só o **pagador (ou responsável) atual** transforma uma despesa **dividida** em "Só meu"; ninguém cria nem entrega "Só meu" **em nome de outro**. Dono da conta e lançador **não** ganham esse poder: o controle é sobre o que **já é** "Só meu".
- **Quem só controla** (dono da conta/cartão ou lançador, sem ser o pagador/responsável) **altera valor, data, descrição, categoria e observação, e exclui e restaura**, mas **não** altera: a **divisão** ("Só meu" ⇄ dividida), o **pagador/responsável**, a **conta** nem o **"Pagar com"**; também **não assume o pagamento** nem vira responsável do "Só meu" de outra pessoa (SEC-043/044, D-GES-53). Isso fica com o próprio pagador. O pagador atual não entrega o lançamento a outra pessoa (a trava acima).
- **Baixa de prevista "Só meu"** por quem só controla: mantém o pagador original e só aceita a conta do responsável ou a do próprio ator; o **estorno da baixa** exige controle também sobre a **prevista** (SEC-044d).
- **Encerrar uma série** preserva as ocorrências "Só meu" que o ator não controla (SEC-045).
- **Titular do cartão**: só o **titular atual** troca o titular do cartão; o **Administrador** troca **apenas dentro da remoção ou saída de um membro** (reatribuição das contas e cartões dele, SEC-046), nunca por conta própria (SEC-047, D-GES-57, que revisa D-GES-53). A troca fica registrada no histórico, com quem trocou e quando (SEC-042). O titular do cartão controla as compras "Só meu" feitas nele, por isso a troca não pode ser livre.
- **Remover um membro**: a tela de revisão da remoção avisa que as contas e cartões dele passam a quem remove e, com isso, essa pessoa passa a controlar os "Só meu" lançados nessas contas (SEC-046).
- Lançamentos **divididos com a família** continuam editáveis por **qualquer membro** (US-013 inalterada).
- Lançamento "Só meu" cujo **dono (pagador/responsável) é ex-membro** fica **somente leitura** para os membros comuns, **exceto para o Administrador da família**, que pode **editar, excluir, restaurar e estornar** para dar continuidade ao uso da aplicação (D-GES-52). O Administrador tem então **poderes plenos** sobre esse lançamento (D-GES-55, D-PO-96, que revisa D-PO-95): além de valor, data, descrição, categoria, observação, exclusão e restauração, pode **torná-lo dividido**, a **conta** e o **"Pagar com"**. A nova conta tem de ser conta da mesma família. **O pagador não muda (D-GES-59, abaixo).** O poder pleno vale **só** para o Administrador atual e **só** quando o dono é ex-membro: dono da conta e lançador, e o Administrador sobre o "Só meu" de membro **ativo**, seguem com os limites acima. Na tela, o seletor "Quem pagou?" mostra o ex-membro fixo (rotulado "ex-membro"). Se o ex-membro era apenas o dono da conta ou o lançador, ele simplesmente deixa de poder agir; os demais continuam.
- **Pagador de ex-membro é imutável (D-GES-59, D-PO-98, que revoga a parte da D-GES-55 que deixava o Administrador trocar o pagador):** quando quem pagou (pagador; na prevista e na série, o responsável) é **ex-membro que não voltou à família**, o pagador/responsável **não muda para ninguém, nem para o Administrador**, tanto no "Só meu" quanto na despesa **dividida**, em lançamentos, compras no cartão e parcelas, previstas e séries, e em qualquer pedido de alteração (um ou vários). **Só quem voltou** (mesmo usuário, com vínculo ativo, SEC-049) pode alterá-lo. O Administrador **continua podendo** editar valor, data, descrição, categoria e observação, excluir, restaurar, estornar, **tornar dividido** e mudar a **conta** e o **"Pagar com"**. Para outro pagador, exclua e lance de novo em nome de quem pagou de fato. A regra geral das divididas de membros **ativos** não muda (qualquer membro troca o pagador). **Baixa de prevista de ex-membro:** a baixa é um pagamento novo e real, feito em nome de **quem a realiza**; o responsável da prevista não muda e não se informa outro pagador. Mensagem: **"O pagador é um ex-membro e não pode ser alterado. Para outro pagador, exclua e lance de novo."** O seletor "Quem pagou?" (e "Responsável") mostra o ex-membro fixo, desabilitado.
- **Limites do poder pleno (D-GES-57, D-PO-97):** (a) ao **tornar dividido** o "Só meu" de ex-membro, o **pagador (ou responsável) continua sendo o ex-membro**, que foi quem pagou; o Administrador não se põe nem põe outro como pagador de uma dividida (SEC-048). **(Revisado por D-GES-59: o Administrador também não assume o pagador enquanto é "Só meu".)** (b) **Quem volta à família** (mesmo usuário, por novo convite) **recupera o controle total do próprio "Só meu" antigo**, ainda que o registro aponte o vínculo antigo; o Administrador **perde** o poder pleno sobre ele, e o item volta à exportação dessa pessoa (SEC-049). "Dono ativo" = o mesmo usuário com vínculo ativo na mesma família. (c) Ao tornar dividido, a **observação** do ex-membro **não vai** para a exportação dos demais membros; a descrição vai (necessária ao acerto) (SEC-050).
- **Histórico de alterações**: o histórico de um "Só meu" **mantém quem alterou**, inclusive quando foi o dono da conta, o lançador ou o Administrador (D-GES-52). Sem aviso por e-mail por ora.
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

  Cenário: Quem só controla não muda divisão, pagador, conta nem "Pagar com"
    Dado a despesa "Só meu" de "R$ 60,00" paga por "Lucas" na conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla tenta tornar a despesa dividida, trocar o pagador, mover a despesa de conta ou trocar o "Pagar com"
    Então vê "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento."
    E a despesa continua igual

  Cenário: Quem só controla não assume o pagamento do "Só meu" de outra pessoa
    Dado a despesa "Só meu" de "R$ 60,00" paga por "Lucas" na conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla tenta se colocar como pagadora
    Então vê "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento."
    E Lucas continua podendo alterar a despesa

  Cenário: Baixa na conta de um terceiro por quem só controla é recusada
    Dado uma despesa prevista "Só meu" de Lucas paga com a conta "Conta da Carla"
    E Carla está autenticada
    Quando Carla dá baixa nessa prevista indicando a conta de "Bia"
    Então vê "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento."

  Cenário: Estornar a baixa exige controle também sobre a prevista
    Dado que Carla deu baixa na prevista "Só meu" de Lucas com a conta dela
    E a conta de baixa passou a ser de "Bia", que não controla a prevista
    Quando Bia tenta estornar a baixa
    Então vê "Só Lucas e Carla podem alterar este lançamento."

  Cenário: Encerrar a série preserva a ocorrência "Só meu" de outro membro
    Dado a série dividida "Academia" com "Lucas" como responsável
    E Lucas tornou "Só meu" a ocorrência de novembro
    Quando Bia, sem relação com essa ocorrência, encerra a série
    Então as ocorrências divididas pendentes são removidas
    E a ocorrência "Só meu" de Lucas continua

  Cenário: Só o titular atual do cartão troca o titular
    Dado o cartão de "Carla"
    E Bia está autenticada
    Quando Bia tenta trocar o titular do cartão para ela
    Então vê "Só o titular do cartão pode trocar o titular."
    Mas quando Carla troca o titular para "Lucas"
    Então o histórico do cartão registra "Carla trocou o titular de Carla para Lucas"

  Cenário: Administrador altera o "Só meu" de um ex-membro
    Dado uma despesa "Só meu" de "R$ 80,00" paga por "Lucas" na conta "Conta da Mariana"
    E Lucas saiu da família
    E Mariana, Administradora, está autenticada
    Quando Mariana altera o valor para "R$ 85,00" e depois exclui e restaura a despesa
    Então a despesa mostra "R$ 85,00" e volta ao Extrato
    E o histórico registra as alterações por Mariana

  Cenário: Administrador tem poderes plenos sobre o "Só meu" de um ex-membro, menos trocar o pagador
    Dado uma despesa "Só meu" de "R$ 80,00" paga por "Lucas" na conta "Conta do Lucas"
    E Lucas saiu da família
    E Mariana, Administradora, está autenticada
    Quando Mariana torna a despesa dividida com a família e escolhe a "Conta da Mariana"
    Então a despesa fica dividida, paga por "Lucas (ex-membro)", na "Conta da Mariana"
    E o histórico registra as alterações por Mariana
    E o seletor "Quem pagou?" mostra "Lucas (ex-membro)" fixo, desabilitado

  Cenário: Administrador não troca estrutura do "Só meu" de membro ativo nem de outra família
    Dado uma despesa "Só meu" paga por "Lucas", que continua na família
    E Mariana, Administradora, está autenticada
    Quando Mariana tenta torná-la dividida ou trocar o pagador ou a conta
    Então a alteração é recusada
    Mas se Mariana escolhe um pagador ou uma conta de outra família, a escolha é recusada como inválida

  Cenário: Só o titular atual troca o titular do cartão; o Administrador só na remoção do membro
    Dado o cartão de "Carla" com a compra "Só meu" de "Lucas"
    E Mariana, Administradora, está autenticada
    Quando Mariana tenta trocar o titular do cartão para ela
    Então vê "Só o titular do cartão pode trocar o titular."
    E a compra de Lucas continua intacta
    Mas quando Mariana remove "Carla" e escolhe a reatribuição do cartão
    Então o titular do cartão muda e a troca fica no histórico da família

  Cenário: O Administrador não assume nem entrega o pagador do "Só meu" de ex-membro
    Dado uma despesa "Só meu" de "R$ 300,00" paga por "Lucas", que saiu da família
    E Mariana, Administradora, está autenticada
    Quando Mariana tenta se pôr, ou pôr "Carla", como pagadora, com ou sem dividir
    Então vê "O pagador é um ex-membro e não pode ser alterado."
    Mas quando Mariana apenas a torna dividida
    Então a despesa fica dividida, paga por "Lucas (ex-membro)"

  Cenário: Depois de dividida, ninguém troca o pagador ex-membro
    Dado uma despesa dividida de "R$ 300,00" paga por "Lucas", que saiu da família
    Quando Mariana, Carla ou Bia tentam trocar o pagador para outro membro
    Então vê "O pagador é um ex-membro e não pode ser alterado."
    E o acerto continua com "Lucas" como credor
    E a observação dele continua fora da exportação dos demais

  Cenário: Prevista e série de ex-membro têm o responsável fixo; a baixa é paga por quem a realiza
    Dado uma despesa prevista de "Lucas", que saiu da família
    Quando Mariana ou Carla tentam trocar o responsável
    Então a alteração é recusada
    Mas quando Mariana dá baixa na prevista com a "Conta da Mariana"
    Então a despesa é lançada em nome de "Mariana" e o responsável da prevista não muda

  Cenário: Quem volta à família recupera o controle do próprio "Só meu" antigo
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    E Lucas saiu da família e voltou por um novo convite
    Quando Mariana, Administradora, tenta torná-la dividida ou assumir o pagamento
    Então a alteração é recusada
    Mas Lucas edita, divide e exclui a própria despesa
    E a despesa volta ao arquivo de exportação de Lucas

  Cenário: A observação do ex-membro não vai para a exportação dos demais
    Dado uma despesa "Só meu" paga por "Lucas", que saiu, com a observação "remédio controlado"
    Quando Mariana a torna dividida
    Então a exportação de Carla traz a descrição, mas não a observação

  Cenário: Dono da conta não tem poderes plenos sobre o "Só meu" de ex-membro
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    E Lucas saiu da família
    E Carla, Membro, está autenticada
    Quando Carla tenta torná-la dividida
    Então a alteração é recusada

  Cenário: Membro comum não altera o "Só meu" de um ex-membro
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    E Lucas saiu da família
    E Carla, Membro, está autenticada
    Quando Carla tenta alterar a despesa
    Então a alteração é recusada

  Cenário: Histórico mantém quem alterou
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    Quando Carla altera o valor e depois Lucas altera a descrição
    Então o histórico lista as duas alterações, cada uma com o nome de quem alterou

  Cenário: Remover membro avisa sobre as contas que passam a quem remove
    Dado que Carla é titular de uma conta com saldo
    Quando Mariana abre a revisão da remoção de Carla
    Então vê que as contas dela passam a Mariana e que Mariana passa a controlar os "Só meu" lançados nelas

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

  Cenário: Lançamento "Só meu" de ex-membro é somente leitura para o membro comum
    Dado uma despesa "Só meu" paga por Lucas
    E Lucas saiu da família
    E Bia, Membro, abre o detalhe dessa despesa
    Então vê "Pago por Lucas (ex-membro)"
    E não vê as ações "Editar" nem "Excluir"

  Cenário: "Só meu" de ex-membro continua somente leitura para o dono da conta que não é Administrador
    Dado uma despesa "Só meu" paga por "Lucas" na conta "Conta da Carla"
    E Lucas saiu da família
    E Carla, Membro, está autenticada
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
- **Decisões do PO sem ambiguidade de produto (D-PO-94)**: dono ex-membro ⇒ somente leitura para todos; dono da conta e lançador não ganham o poder de *tornar* "Só meu"; controlador não-pagador só assume o pagamento em nome próprio. O usuário decidiu (D-GES-52) que só o Administrador age sobre o "Só meu" de ex-membro.
- **TL**: (1) confirmar "dono = `payerMemberId`" ou propor `authorMemberId`; (2) o reverter de lote da importação (US-069) e a baixa de previstas (US-019) que geram lançamento "Só meu" seguem a mesma regra?; (3) o levantamento SEC-021 também citou contas, cartões e previstas: estender a regra? (o PO propõe tratar em outra história, se o usuário quiser).

## Histórico
- 2026-10-24 — Criada (SEC-021, D-GES-42; D-PO-91, D-PO-92). Ajustes cruzados em US-005, US-007, US-013a, US-013b, US-030 e US-036.
- 2026-10-25 — Ajustada por D-GES-52/53 (D-PO-95): Administrador altera "Só meu" de ex-membro; histórico mantém quem alterou; quem só controla não muda divisão, pagador, conta nem "Pagar com" e não assume o pagamento (SEC-043/044); estorno checa a prevista; encerrar série preserva "Só meu" alheio (SEC-045); titular do cartão só trocado pelo titular ou Admin, com registro (SEC-042); aviso na remoção de membro (SEC-046).
- 2026-10-25 — Revisada por D-GES-50 (D-PO-94): controle também do dono da conta (ou do cartão) e do lançador; mensagens, aviso do formulário e cenários atualizados; previstas incluídas. Resolve a pergunta §5 do reteste final.
- 2026-10-25 — Revisada por D-GES-55 (D-PO-96): o Administrador atual passa a ter poderes plenos (divisão, pagador, conta e "Pagar com") sobre o "Só meu" de ex-membro; só ele e só nesse caso; seletor "Quem pagou?" mostra o ex-membro. Revisa D-PO-95.
- 2026-10-26 — Ajustada por D-GES-57 (D-PO-97): só o titular atual troca o titular do cartão (Admin só na remoção/saída de membro, SEC-047); ao tornar dividido o "Só meu" de ex-membro o pagador continua o ex-membro (SEC-048); quem volta à família recupera o controle do próprio "Só meu" antigo e o Admin perde o poder pleno (SEC-049); a observação do ex-membro não vai para a exportação dos demais (SEC-050).
- 2026-10-26 — Ajustada por D-GES-59 (D-PO-98): o pagador/responsável de ex-membro que não voltou é imutável para todos, inclusive o Administrador, em "Só meu" e dividida (SEC-051, resíduo DEV-132); revoga a troca de pagador da D-GES-55/D-PO-96. Baixa de prevista de ex-membro paga por quem a realiza.
