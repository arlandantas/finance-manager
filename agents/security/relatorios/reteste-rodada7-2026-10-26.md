# Reteste da rodada 7 do "Só meu" (SEC-047..050, D-GES-57/58) — 2026-10-26

**Autor:** Agente de Segurança da Informação · **Tipo:** reteste curto + busca de regressões e brechas novas
**Código analisado:** `20bfdfe`..`0d33261` (TASK-084, DEV-131..134, SDD-028 §11, US-084), em `HEAD` `93e5833`. Foco: `transacoes/ownership.ts` (`ownerStanding`, `memberRefsWithReturn`, `effectiveOwner`, `assertCanMakePersonal`, `assertPlannedControllerLimits`), `transacoes/mutations.ts`, `previstas/service.ts` e `recurring-service.ts`, `cartoes/service.ts`, `privacidade/export.ts`, `analise-ia/suggestions.ts`, `lib/schemas.ts` (`activeId`) e as telas tocadas.
**Ambiente:** Route Handlers reais em processo, pelo `call()` das suítes de integração (sessão por cookie, `withApi`, Origin, idempotência). Banco **descartável** `finance_sec_r7` no `db-test` (porta 5443), criado para este reteste e **apagado** no fim (`DROP DATABASE … WITH (FORCE)`). Sem `next dev`. Dados só de teste (`*@sec.test`, `*@exemplo.com`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados. Não alterei código.

---

## 1. Resumo executivo

**Situação dos itens**

| Item | Situação | Prova |
| :-- | :-- | :-- |
| SEC-047 (Baixa) | **Corrigido** (resíduo da remoção ⇒ SEC-052) | O Admin troca o titular do cartão ⇒ **403** `CARD_OWNER_ONLY`. Nada é gravado: titular, versão, limite (PATCH misto) e zero eventos `CARD_OWNER_CHANGED`. O Admin continua sem controle do parcelado "Só meu" no cartão (403). O titular atual troca, e quem deixou de ser titular perde a vez. A reatribuição na remoção do titular segue (200, com evento). |
| SEC-048 (Baixa) | **Corrigido no passo único; contornável em dois passos** (⇒ SEC-051) | Admin dividir e pôr como pagador ele mesmo, Carla ou Bia ⇒ **403** "Ao dividir, o pagador continua sendo quem pagou."; acerto igual ao de antes. Só dividir ⇒ 200, pagador Lucas, Lucas é o credor (+22.500) e Mariana fica negativa. Prevista e série: trocar o responsável ao dividir ⇒ 403, e o responsável segue Lucas. **Porém:** depois de dividir, um segundo `PATCH {payerMemberId: Carla}` pelo Admin ⇒ **200** e o crédito passa para Carla (SEC-051). |
| SEC-049 (Baixa) | **Corrigido** | Remover dá o poder pleno ao Admin; com a volta do Lucas (convite aceito, vínculo **novo**), o Admin recebe **403** em divisão, pagador, conta, valor e descrição. Lucas edita, exclui, restaura e divide o próprio item antigo (200). A entrega a terceiro continua **403** `PERSONAL_ON_BEHALF_FORBIDDEN`. Bia (outro usuário) ⇒ 403. Lucas sobre o "Só meu" da Carla ⇒ 403. Conta de outra família ⇒ 404/422. Lucas com vínculo ativo só em **outra** família ⇒ **404** no item daqui, e aqui ele segue ex-membro (o Admin mantém o D-GES-55). Previstas e séries: o Admin recebe 403 (editar, baixa, encerrar) e Lucas controla. Baixa por quem voltou grava o vínculo novo como pagador. Remover o vínculo novo de novo devolve o poder ao Admin (200), como manda o D-GES-55. |
| SEC-050 (Info) | **Corrigido** (contornável ⇒ SEC-051) | Depois de o Admin dividir, a exportação de Carla, Bia e Mariana traz a descrição e `observacao: null`. O banco guarda a nota. A dividida legítima de membro ativo mantém a nota. A prevista dividida de ex-membro também sai sem nota. Recorrentes não exportam observação. **Mas** a regra olha o pagador **atual**: se ele deixa de ser o ex-membro (SEC-051 ou resíduo DEV-132), a nota volta ao arquivo de todos ("sessão sigilosa" apareceu na exportação da Carla). |
| Resíduo DEV-132 | **Confirmado e quantificado** (ver §3) | Admin assume (200) e depois divide (200). Com R$ 300 e 4 participantes: **Mariana +R$ 225**, Lucas (ex-membro) **−R$ 75**, Carla e Bia −R$ 75. Em relação ao correto (Lucas +R$ 225), a virada contra o ex-membro é de **R$ 300**, o valor inteiro. O mesmo `PATCH` com assumir e dividir juntos ⇒ 403; só os dois passos funcionam. |

**Regressões:** nenhuma. Suíte de integração completa **1094 passed, 1 skipped (93 arquivos)** e unitário `sec021-ownership` **23/23**, no banco descartável.

**Achados novos**

| Severidade | Qtde | IDs |
| :-- | :-: | :-- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Média | 0 | — |
| Baixa | 1 | SEC-051 |
| Informativa | 2 | SEC-052, SEC-053 |

**Top riscos**
1. **SEC-051 (Baixa):** a correção da SEC-048 vale só no `PATCH` que divide. Na dividida cujo pagador é ex-membro, qualquer membro ativo troca o pagador para um **terceiro** (a regra geral das divididas, ratificada no reteste final §5(b)). O Admin divide e põe a Carla, ou Carla e Bia fazem isso entre si. O crédito do ex-membro é transferido, e a observação dele volta à exportação de todos. Não precisa de poder pleno no segundo passo.
2. **Resíduo DEV-132:** o Admin cria crédito para si com R$ 225 por R$ 300 do ex-membro (fórmula no §3). Fica no histórico.
3. **SEC-052 (Info):** pela remoção, o Admin pode ficar com o cartão (ou a conta) de quem removeu e passa a controlar o "Só meu" de membros **ativos** ali lançado. Na prova, editou e excluiu a compra do Lucas (200).

### Perguntas ao usuário (via Gestor)
1. **SEC-051 + DEV-132 (recomendação conjunta).** Na despesa paga por um ex-membro (que não voltou), o pagador deve ficar **fixo**, tanto em "Só meu" quanto em dividida, para todos, inclusive o Admin? Isso fecha os dois caminhos: o Admin deixa de assumir (revoga o DEV-129 sob poder pleno) e ninguém troca o pagador da dividida depois. Só quem voltou à família (SEC-049) o altera. Se o Admin precisar corrigir um pagador errado, que exclua e relance em nome próprio, o que fica explícito no histórico. Alternativa mínima: manter o DEV-129, mas proibir dividir um lançamento cujo histórico mostra o Admin assumindo o pagador de ex-membro, e travar a troca de pagador de divididas com pagador ex-membro. Alternativa de aceite: registrar o risco, que depende de um Admin (ou de dois membros juntos) agindo de má-fé e fica nas revisões.
2. **SEC-052.** Na remoção, o Admin pode reatribuir a si o cartão ou a conta do removido, ganhando controle sobre o "Só meu" de membros ativos ali lançados? Recomendação: aceitar e só registrar, porque remover um membro é um ato raro, visível e com evento. Se não, a reatribuição não deve dar controle sobre compras "Só meu" anteriores de outros membros, ou o aviso da remoção deve citar essas compras.
3. **SEC-053.** Quando quem voltou divide o próprio item antigo, o acerto mostra duas linhas da mesma pessoa (vínculo antigo como credor, vínculo novo como devedor). Só registrar?

---

## 2. Achados

### SEC-051 — A SEC-048 é contornável em dois passos: trocar o pagador da dividida do ex-membro
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. Exige o Admin (para dividir) ou uma dividida legítima paga por ex-membro. O segundo passo vale para qualquer membro ativo. Tudo fica nas revisões. O ex-membro não está mais lá para contestar. |
| Local | `src/modules/transacoes/ownership.ts:247-256` (a trava `KEEP_GONE_PAYER` exige `!current.isSharedExpense && next.isSharedExpense === true`: só no `PATCH` que divide). `ownership.ts:283-290` (na dividida, só barra o ator se pôr como pagador quando não é o autor; o pagador **terceiro** passa). `privacidade/export.ts:484-505` (`foreignGone` olha o pagador atual). |
| Descrição e impacto | O D-GES-57 decidiu que, ao dividir o "Só meu" de ex-membro, "o pagador permanece o ex-membro (o Administrador não cria crédito para si)". A trava só olha o pedido que divide. Depois de dividido, o item é uma dividida comum, e nela qualquer membro troca o pagador para outro membro ativo (regra ratificada, reteste final §5(b)). Assim, o crédito que era do ex-membro vai para outro membro. O ex-membro passa de credor a devedor da sua cota. O Admin não consegue se pôr direto como pagador (403), mas um cúmplice consegue devolver: Carla, como pagadora, põe Mariana. Efeito colateral: como o pagador deixa de ser ex-membro, a SEC-050 deixa de esconder a observação, que volta à exportação de todos. |
| Como explorar (prova local) | Lucas pagou R$ 300 "Só meu" na conta da Carla e saiu. Acerto 2026-10, todos em 0.<br>1. Mariana `PATCH {isSharedExpense:true}` ⇒ **200**. Acerto: Lucas +22.500, demais −7.500.<br>2. Mariana `PATCH {payerMemberId: Mariana}` ⇒ **403** (trava do autor).<br>3. Mariana `PATCH {payerMemberId: Carla}` ⇒ **200**. Acerto: **Carla +22.500**, Lucas −7.500, Mariana e Bia −7.500.<br>4. Carla `PATCH {payerMemberId: Bia}` ⇒ 200; Bia `PATCH {payerMemberId: Carla}` ⇒ 200 (membros comuns movem o crédito entre si).<br>Na prevista dividida de ex-membro, a troca do responsável depois de dividir ⇒ **403** (Mariana e Carla, `assertPlannedNoCapture`). A baixa da prevista dividida pela Carla, com ela como pagadora e com a conta dela ⇒ 201; aí é um pagamento real, não fabricado. |
| Correção sugerida | Ver pergunta 1: pagador fixo enquanto for ex-membro sem vínculo ativo (`ownerStanding(...).ownerRemoved` no pagador atual) para qualquer ator, em "Só meu" e dividida. Assim a regra deixa de depender do pedido que divide. No mesmo teste, cobrir a nota na exportação. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | SEC-048, SEC-050, D-GES-55, D-GES-57, DEV-129, DEV-132, reteste final §5(b) |

### SEC-052 — Pela remoção, o Admin fica com o cartão ou a conta e controla o "Só meu" de membro ativo
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Informativa. É o caminho que o D-GES-57 manteve de propósito ("o Administrador troca apenas no fluxo de remoção"). Exige remover um membro, um ato raro e visível que gera eventos e aviso (SEC-046). |
| Local | `src/modules/familia/removal.ts` (reatribuição `reassign.cards` e `reassign.accounts` para qualquer membro ativo, inclusive o próprio Admin) + `ownership.ts` (o controle pelo titular é lido no momento da ação, SDD-028 §11.1). |
| Descrição e impacto | O Lucas (ativo) tem uma compra "Só meu" de R$ 70 no cartão da Carla. O Admin remove a Carla e reatribui o cartão a si. Passa a ser "dono do cartão" e, como quem só controla, edita e exclui a compra do Lucas. Na conta bancária é igual. É o efeito da SEC-047, mas só pelo fluxo de remoção. |
| Como explorar (prova local) | Mariana edita a compra do Lucas ⇒ **403**. `POST /members/:Carla/remove {reassign:{accounts:{contaCarla: Mariana}, cards:{cartão: Mariana}}}` ⇒ **200**. Mariana `PATCH {amountInCents:100}` ⇒ **200**. `POST …/delete` ⇒ **200**. |
| Correção sugerida | Pergunta 2. Recomendação: aceitar e registrar. Alternativas: reatribuir sem herdar o controle sobre o "Só meu" anterior de outros membros (exige o titular no momento da compra, como na opção (b) da SEC-047), ou citar essas compras no `reassignNotice`. |
| Status | Em análise (usuário) |
| Rastreio | SEC-047, SEC-042, SEC-046, D-GES-57, DEV-131 |

### SEC-053 — Quem voltou e divide o próprio item antigo aparece duas vezes no acerto
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Informativa. Não há vazamento nem escalonamento. É uma questão de exatidão do acerto, já admitida no DEV-133. |
| Local | `ownership.ts` (`ownerStanding` dá controle, mas o pagador continua sendo o vínculo antigo) + acerto (`split/`), que é por vínculo. |
| Descrição e impacto | Lucas volta e divide o "Só meu" antigo de R$ 300. O acerto, com 5 participantes, mostra "Lucas Silva" (vínculo antigo, removido) com **+24.000** e "Lucas Silva" (vínculo novo) com **−6.000**. A pessoa tem saldo líquido de +18.000. Os demais podem pagar "ao ex-membro" uma dívida com alguém que está ativo, ou vice-versa. O ex-membro aparece marcado `removed`, mas o nome é o mesmo. |
| Como explorar (prova local) | Remover pela API, reconvidar e aceitar. Lucas `PATCH {isSharedExpense:true}` no item antigo ⇒ 200, e `GET /settlement?period=2026-10`. |
| Correção sugerida | Pergunta 3. Se não for aceito: ao dividir (ou dar baixa) por quem voltou, gravar o vínculo ativo como pagador, como a baixa da prevista já faz. Ou agrupar no acerto por usuário. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | SEC-049, DEV-133 |

---

## 3. Resíduo DEV-132 — avaliação e recomendação
- **Caminho:** com poder pleno, o Admin faz `PATCH {payerMemberId: Admin}` no "Só meu" do ex-membro (DEV-129) ⇒ 200, e depois `PATCH {isSharedExpense: true}` ⇒ 200 (agora ele é o dono). Num só `PATCH` ⇒ 403.
- **Quantificação** (despesa de valor V, n participantes no acerto, ex-membro incluído no período): o Admin ganha `V·(n−1)/n`. O ex-membro passa de `+V·(n−1)/n` (correto) para `−V/n`, uma virada de **V**, o valor inteiro. Cada um dos outros paga `V/n` ao Admin, quando deveria pagar ao ex-membro. Prova: V = R$ 300, n = 4 ⇒ Admin **+R$ 225**, Lucas −R$ 75, Carla e Bia −R$ 75. Não tem limite por item: vale para todo o "Só meu" do ex-membro no período e, com `confirmSettledPeriod`, também nos períodos já acertados.
- **Também** leva a observação do ex-membro à exportação de todos ("sessão sigilosa" no arquivo da Carla), porque o pagador deixa de ser ex-membro.
- **Mitigantes:** só o Admin, só sobre ex-membro de verdade (não volta à família), registrado nas revisões com o nome do Admin. A conta continua a do lançamento original (na prova, a da Carla), o que denuncia a incoerência.
- **Recomendação:** fechar junto com a SEC-051, com a regra única "pagador ex-membro é imutável" (pergunta 1). O DEV-129 (Admin assume o pagamento em nome próprio) não tem uso legítimo forte: o Admin que pagou de fato pode lançar a própria despesa. Se o usuário preferir manter o DEV-129, então pelo menos: (a) vetar `isSharedExpense: true` quando a revisão anterior trocou o pagador de um ex-membro para o Admin; (b) travar a troca de pagador da dividida com pagador ex-membro (SEC-051). Severidade se aceito: **Baixa**, com o mesmo risco da SEC-048 original.

## 4. Verificações sem achado

| Item | Resultado |
| :-- | :-- |
| `ownerStanding` | Lê o dono com `familyId` e `removedAt` na transação. `ownerIsActor` só para o vínculo do ator ou para um vínculo removido com o **mesmo** `userId`. `ownerRemoved` só se o usuário não tem vínculo ativo **nesta** família. Um vínculo ativo em outra família não conta (prova: 404 da outra família; aqui, o Admin mantém o D-GES-55). `ctx.userId` é obrigatório no `RequestContext`. Não achei como um usuário se passar por dono de vínculo alheio (`userId` não muda pela API, e o convite é por e-mail). |
| Vínculos múltiplos | Sair, voltar e sair de novo: o Admin volta a ter o poder pleno (200), coerente com o D-GES-55. Quem voltou não ganha nada sobre o "Só meu" de outro ex-membro (só o próprio `userId`). |
| `assertCanWriteTransaction` / `plannedWriteDecision` | Os dois passam por `ownerStanding`. O parcelado (`assertCanWriteParcels`) herda, e as sugestões (`acceptCategorySuggestion`) revalidam com `assertCanWriteTransaction`. |
| Sugestões da IA | `mine` são os vínculos do próprio usuário nesta família. O Admin não recebe sugestões do item de quem voltou, e quem voltou recebe. `removed` exclui quem voltou, coerente. |
| DTO `activeId` | Só id de vínculo da mesma família (UUID), sem `userId` nem e-mail (`memberRefOf` não espalha a linha). Usado só pela UI; a barreira é o servidor. |
| Baixa por quem voltou | Grava o pagador como vínculo ativo. Pagar em nome do vínculo antigo esbarra em `findMember` e `assertPersonalForSelf`. |
| Remoção e reatribuição de previstas | Com remoção pela API, as previstas vão ao Admin (US-035), sem mudança nesta rodada. Os testes de previstas de quem voltou foram feitos com remoção pelo banco, conforme o DEV-133. |
| Exportação | `formerFamily` sem mudança de regra. A nota é omitida também na exportação da Mariana (Admin). A observação de recorrentes não é exportada. |
| Cartão (SEC-047) | Nenhum outro caminho de troca de titular: `PATCH /accounts/:id` não aceita `ownerMemberId`, e o parcelado não troca de cartão. |

## 5. O que não pôde ser verificado
- **UI** (`edit-transaction-form.tsx` com `lockGonePayer`, `planned-drawer.tsx` com `lockGoneResponsible`, `card-drawer.tsx`, telas com `effectiveOwner`): não verificada no navegador. O servidor é a barreira e foi testado.
- Fluxo HTTP completo em `next dev` (cabeçalhos e CSRF): não refeito; os handlers rodaram em processo.
- MCP com cliente real: fora do escopo. Pelo código, as ferramentas não mudaram nesta rodada.
- Produção (Vercel): não tocada.

## 6. Método e efeitos colaterais
- Revisão de `git diff 20bfdfe~1..0d33261` (código, testes e docs DEV-131..134).
- Suíte de integração completa no banco descartável `finance_sec_r7`: **93 arquivos, 1094 passed, 1 skipped**. Unitário `tests/unit/sec021-ownership.test.ts`: **23/23**.
- Provas próprias num arquivo de teste e numa configuração de vitest **só no scratchpad**, não versionados: 7 cenários (A1, A2, B1, B2, C1, C2, D1).
- O banco `finance_sec_r7` foi apagado no fim. Sem `next dev`. `git status` limpo antes do commit deste relatório e do status.
