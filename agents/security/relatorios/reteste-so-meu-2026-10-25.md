# Reteste da nova regra do "Só meu" (D-GES-50/51) — 2026-10-25

**Autor:** Agente de Segurança da Informação · **Tipo:** reteste + busca de bypass da regra ampliada
**Código analisado:** `bdd9ed1`..`672ea70` (US-084, SDD-028 §11, TASK-081, DEV-120..122). Foco: `src/modules/transacoes/ownership.ts`, `transacoes/mutations.ts`, `transacoes/installment-manage.ts`, `previstas/service.ts`, `previstas/recurring-service.ts`, `analise-ia/suggestions.ts`, `cartoes/service.ts`, `familia/removal.ts`, `privacidade/export.ts`, `mcp/tools/*`.
**Ambiente:** os Route Handlers reais rodaram em processo, pelo mesmo `call()` das suítes de integração (sessão por cookie, `withApi`, Origin e idempotência). Banco **descartável** `finance_sec_somu` no `db-test` (porta 5443). O banco foi **apagado** (`DROP DATABASE … WITH (FORCE)`). Não subi `next dev`, então `tsconfig.json`, `AGENTS.md` e `.next-sec` não foram tocados. Dados só de teste (`*@sec.test`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados.

---

## 1. Resumo executivo

| Severidade | Qtde | IDs |
| :-- | :-: | :-- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Média | 1 | SEC-042 |
| Baixa | 3 | SEC-043, SEC-044, SEC-045 |
| Informativa | 1 | SEC-046 |

**O que resistiu:**
- **Núcleo da regra.** Terceiro sem relação, inclusive Admin, recebe 403 em todas as escritas:
  - lançamento e compra no cartão;
  - plano parcelado;
  - prevista (editar, dar baixa, estornar);
  - ocorrência e série;
  - aceite de sugestão da IA.
- **Travas SEC-025/026/038 nos caminhos diretos.** Dono da conta e lançador não convertem dividida em "Só meu". Ninguém cria "Só meu" em nome de outro. A baixa por quem controla não indica um terceiro como pagador, e o corpo da baixa recusa `isSharedExpense` (400).
- **Isolamento entre famílias (IDOR/BOLA).** Nenhum acesso cruzado: 404 em lançamento, cartão, prevista, baixa e sugestão. Apontar para conta, pagador ou titular de outra família dá 422 ou 403.
- **Ex-membro.** A sessão de quem foi removido dá 401. Se o dono saiu, o lançamento fica somente leitura para todos, mesmo que alguém assuma o cartão depois.
- **Exportação.** Continua sem o "Só meu" alheio.
- **MCP.** Não tem ferramenta de edição. `lancar_despesa` não aceita pagador, e a saída de `listar_lancamentos` não carrega os campos novos.
- **DTOs novos.** `accountOwnerId`, `authorId` e `paymentAccountOwnerId` só carregam ids de membros da própria família. O titular da conta já era visível em `/accounts`.
- **Suítes.** `sec021`, `sec025-026`, `sec038`, `us-030` e `us084`: 47/47.

**Top riscos:**
1. **SEC-042 (Média).** O "dono do cartão" virou papel de autorização, mas **qualquer membro troca o titular de qualquer cartão** (`PATCH /api/v1/cards/:id {ownerMemberId}`), sem trava nem registro em histórico. Com isso, um membro sem relação nenhuma faz tudo em dois `PATCH`:
   - edita, exclui ou assume o "Só meu" alheio no cartão, inclusive o parcelado;
   - depois devolve o cartão e apaga o rastro visível.
2. **SEC-043 (Baixa).** "Assumir o pagamento" é uma captura em um passo. O dono da conta ou o lançador vira pagador do "Só meu" de outro. Se o dono original não é o autor, ele perde o controle (403), e o item sai do arquivo exportado dele e entra no de quem assumiu.

### Perguntas ao usuário (via Gestor)
1. **SEC-042.** O titular de um cartão pode ser trocado só pelo próprio titular (ou só por Admin, com registro)? Recomendação: só o titular atual; Admin só na remoção de membro, que já existe.
2. **SEC-043.** "Assumir" o "Só meu" de outro (DEV-121, ratificado pelo Gestor no D-GES-51) é o que o usuário quis no D-GES-50? A decisão manteve "ninguém *torna* 'Só meu' o que não é seu". Recomendação: quem só controla não troca o pagador. Trocar o pagador fica com o próprio pagador.
3. **SEC-044.** Quem só controla pode mudar a **divisão** (tornar dividida), o **pagador** (desde que torne dividida), a **conta** ou o **"Pagar com"** do "Só meu" alheio? Hoje pode, e esses quatro caminhos entregam o item a um terceiro. Recomendação: quem só controla edita valor, data, descrição, categoria e observação, e exclui ou restaura. Divisão, pagador e conta ficam com o pagador.
4. **SEC-045.** Encerrar uma série dividida deve apagar a ocorrência que o responsável tornou "Só meu"? Recomendação: não. Pular as exceções "Só meu" de quem não controla, ou recusar com 403.

---

## 2. Achados

### SEC-042 — Qualquer membro troca o titular do cartão e passa a controlar o "Só meu" alheio no cartão
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | **Média**. É um bypass completo da regra para compras no cartão, por qualquer membro, em uma requisição, e o rastro pode ser apagado. Fica dentro da família, por isso não é Alta. |
| Local | `src/modules/cartoes/service.ts:154-200` (`updateCard`: sem checagem de quem pede, aceita `ownerMemberId` de qualquer membro ativo). `src/app/api/v1/cards/[id]/route.ts:20` (PATCH só com `withApi`). `src/modules/transacoes/ownership.ts:84-103` (`accountOwnerOf` lê o titular **no momento da ação**, SDD-028 §11.1). |
| Descrição e impacto | Antes do D-GES-50, o titular do cartão não dava poder nenhum. Agora dá controle de escrita sobre todo "Só meu" lançado no cartão, mas o campo continua editável por qualquer membro e a troca não entra em histórico (só `updatedByMemberId`, que é sobrescrito). Um membro malicioso altera valor e descrição, exclui ou restaura compras e planos parcelados "Só meu" de outro. Também se torna pagador (SEC-043) e devolve o cartão ao titular, sem rastro na tela de cartões. As revisões do lançamento mostram quem editou, mas não explicam por que ele podia. É dado financeiro pessoal: integridade, e não leitura, porque a leitura já é permitida. |
| Como explorar (prova local) | Família: Mariana (Admin), Lucas, Carla e Bia (Members). O cartão é da Carla. A compra "Só meu" de R$ 70 é do Lucas (pagador e autor).<br>1. Bia `PATCH /transactions/:id {amountInCents:100}` ⇒ **403** "Só Lucas e Carla podem alterar este lançamento."<br>2. Bia `PATCH /cards/:id {ownerMemberId: Bia}` ⇒ **200**.<br>3. Bia `PATCH /transactions/:id {amountInCents:100, description:"alterado pela Bia"}` ⇒ **200**.<br>4. Bia `PATCH … {payerMemberId: Bia}` ⇒ **200** (agora o "Só meu" é dela).<br>5. Bia `PATCH /cards/:id {ownerMemberId: Carla}` ⇒ **200** (devolve o cartão).<br>6. Bia exclui o lançamento ⇒ **200**. Estado final: R$ 1,00, pagadora Bia.<br>Plano parcelado 3x "Só meu" do Lucas: exclusão pela Bia ⇒ 403 antes do passo 2 e **200** depois. |
| Correção sugerida | TL ⇒ Dev. (a) `updateCard`: só o titular atual troca `ownerMemberId`, e Admin só pelo fluxo de remoção de membro, que já reatribui com revisão (`familia/removal.ts`). Retorna 403 com mensagem própria. (b) Registrar a troca de titular, em `FamilyEvent` ou numa revisão do cartão. (c) Teste de integração: membro sem relação troca o titular ⇒ 403. A regra de contas bancárias já é boa (`RenameAccountSchema` não aceita titular); vale fixar isso em teste, para não regredir. |
| Status | Aberto |
| Rastreio | D-GES-50/51, US-084, SDD-028 §11.1/§11.3, DEV-120, SEC-021 |

### SEC-043 — "Assumir o pagamento" é captura em um passo do "Só meu" alheio
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa (dentro da família; fica nas revisões do lançamento) |
| Local | `src/modules/transacoes/ownership.ts:146-177` (`assertCanMakePersonal`: com `nextPayer === ctx.memberId`, `payerChanges` não barra quem só controla). `src/modules/previstas/service.ts:242-252` e `recurring-service.ts:254-263` (`assertPlannedResultAllowed` aceita `responsibleMemberId = ctx` num "Só meu" já existente). |
| Descrição e impacto | O dono da conta, o dono do cartão ou o lançador põe a si mesmo como pagador (ou responsável) do "Só meu" de outro. Quando o dono original não é o autor, ele perde o controle: passa a receber 403 no próprio item. Isso acontece, por exemplo, quando o lançamento era dividido, foi lançado por outra pessoa e o pagador o tornou "Só meu". O item também sai do arquivo exportado dele (SEC-029 segue `personalOwnerId`) e entra no de quem assumiu. Na prática é "tornar seu o 'Só meu' de outro", o que o D-GES-50 manteve proibido. O SDD-028 §11.2 e o DEV-121 permitem ("só para si (assume)"), o que diverge do texto da decisão do usuário. Somado à SEC-042, qualquer membro faz isso no cartão. |
| Como explorar (prova local) | 1. Mariana lança uma despesa dividida paga pelo Lucas na conta da Carla.<br>2. Lucas `PATCH {isSharedExpense:false}` ⇒ 200.<br>3. Carla `PATCH {payerMemberId: Carla}` ⇒ **200**.<br>4. Lucas edita ⇒ **403** "Só Carla e Mariana podem alterar este lançamento."<br>A autora Mariana faz o mesmo ⇒ 200, e Lucas recebe 403.<br>Na prevista: Lucas é o responsável, Mariana a autora e o "Pagar com" é da Carla. Lucas a torna "Só meu". Carla `PATCH {responsibleMemberId: Carla}` ⇒ **200**. Lucas ⇒ **403**.<br>Exportação: antes, Lucas=sim e Carla=não; depois, Lucas=**não** e Carla=**sim**. |
| Correção sugerida | Depende da pergunta 2. Se a resposta for "não assume": em `assertCanMakePersonal`, recusar `payerChanges` quando `currentOwner !== ctx.memberId`, e fazer o mesmo em `assertPlannedResultAllowed` para o responsável. Hoje o teste `us084 … "só assume o pagamento em nome próprio"` prova o contrário e precisaria ser invertido. TL ajusta o SDD-028 §11.2. Dev faz a correção e os testes. |
| Status | Em análise (usuário) |
| Rastreio | D-GES-50/51, DEV-121, SDD-028 §11.2, SEC-025/026/029/038 |

### SEC-044 — Quem só controla entrega o "Só meu" alheio (ou o controle dele) a um terceiro
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa (precisa de conluio para virar "Só meu" do terceiro; muda dado financeiro e a divisão) |
| Local | `ownership.ts:146-177`: o resultado "dividida" não passa por nenhuma trava, e a última checagem só olha `current.isSharedExpense`. `transacoes/mutations.ts:161-…`: `accountId` pode ser trocado por quem controla. `previstas/service.ts`: `paymentAccountId` e a conta da baixa são livres. `previstas/service.ts:426`: o estorno checa só a despesa gerada, não a prevista. |
| Descrição e impacto | Quatro caminhos, todos com a vítima fora do controle. A vítima é sempre o dono do "Só meu".<br>(a) **Entrega em dois passos (conluio).** Carla, dona da conta, faz `{isSharedExpense:true, payerMemberId: Bia}` no "Só meu" do Lucas ⇒ 200. Bia, agora pagadora de uma dividida, faz `{isSharedExpense:false}` ⇒ 200. O item termina como "Só meu" da Bia. É a captura que o D-GES-50 proíbe ("nem entrega a outro"), em duas etapas. O mesmo vale na prevista (`responsibleMemberId`).<br>(b) **Tornar dividida o "Só meu" alheio.** Carla faz `{isSharedExpense:true}` ⇒ 200. A despesa pessoal do Lucas passa a entrar no acerto da família.<br>(c) **Mover a conta ou o "Pagar com"** para a conta de um terceiro ⇒ 200. O terceiro (Bia) passa a controlar e edita ⇒ 200.<br>(d) **Baixa na conta de um terceiro.** Carla dá baixa na prevista "Só meu" do Lucas com a conta da Bia ⇒ 201. A Bia, que não controla a prevista, **estorna a baixa** ⇒ 200 (a checagem é na despesa gerada, da qual ela virou dona da conta). |
| Como explorar (prova local) | Os quatro passos acima, com a família da SEC-042. Estado final de (a): pagadora Bia, `isSharedExpense=false`. |
| Correção sugerida | Depende da pergunta 3. Recomendação: em "Só meu" alheio, quem só controla não altera `isSharedExpense`, `payerMemberId`/`responsibleMemberId`, `accountId` nem `paymentAccountId` (403 `PERSONAL_OWNER_ONLY`). Na baixa feita por quem não é o responsável, só aceitar contas do responsável ou do próprio ator. O estorno deve checar também a prevista (`assertCanWritePlanned`). TL fecha a matriz no SDD-028 §11.2, Dev implementa e testa. |
| Status | Em análise (usuário) |
| Rastreio | D-GES-50, DEV-120/121, SDD-028 §11.2/§11.3, SEC-025/038 |

### SEC-045 — Encerrar uma série dividida apaga a ocorrência "Só meu" de outro membro
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa (exclusão lógica, recuperável; dentro da família). **Anterior ao D-GES-50**: achado nesta revisão de séries. |
| Local | `src/modules/previstas/recurring-service.ts:371-400` (`endSeries`: checa a **série** e depois `softDeleteOccurrences` de **todas** as pendentes, inclusive as exceções). |
| Descrição e impacto | Mariana cria a série dividida "Academia", com Lucas como responsável. Lucas torna "Só meu" a ocorrência de novembro (é uma exceção). Bia, sem relação, recebe 403 ao editar essa ocorrência, mas `POST /recurring-expenses/:id/end` ⇒ **200**, e a ocorrência "Só meu" do Lucas fica com `deletedAt` preenchido por Bia. Isso contorna a regra de excluir. O `updateSeries` não tem o problema: as exceções ficam fora de `affected` (prova: encurtar a série não apagou a exceção). |
| Como explorar (prova local) | Os passos acima: ocorrência apagada em `2026-10-04T15:00Z`, `deletedByMemberId` = Bia. |
| Correção sugerida | Em `endSeries`, aplicar `canWritePlanned` a cada ocorrência pendente: pular (manter) as exceções "Só meu" que o ator não controla, ou recusar com 403. Teste de integração correspondente. TL ⇒ Dev. |
| Status | Aberto |
| Rastreio | US-058, SDD-019 §3.3, SEC-026/038, D-GES-50 |

### SEC-046 — Titular de conta reatribuído na remoção passa a controlar o "Só meu" de quem ficou
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Informativa (consequência do desenho "titular lido no momento da ação", SDD-028 §11.1) |
| Local | `src/modules/familia/removal.ts` (reatribuição de contas e cartões com saldo ou fatura) + `ownership.ts:84-103` |
| Descrição e impacto | Lucas paga um "Só meu" na conta da Carla. Mariana (Admin) remove a Carla e reatribui a conta a si mesma (o padrão é quem remove). A partir daí, **Mariana edita o "Só meu" do Lucas** ⇒ 200, sem ter relação com ele. Quem sai por conta própria também escolhe para quem reatribui. É coerente com o SDD, mas amplia o controle sem que o dono saiba. |
| Como explorar (prova local) | Remoção real via `POST /members/:id/remove` ⇒ 200. Conta da Carla com titular Mariana. Mariana `PATCH` no "Só meu" do Lucas ⇒ 200. |
| Correção sugerida | Decisão de produto. Duas saídas: avisar na tela de revisão da remoção ("passa a controlar N lançamentos 'Só meu' de outros"), ou guardar o titular da conta no momento do lançamento. Só registrar se o usuário não quiser mudar. |
| Status | Em análise (usuário) |
| Rastreio | ADR-019, SDD-012 §2, SDD-028 §11.1 |

---

## 3. Verificações sem achado (por item pedido)

| Item | Resultado |
| :-- | :-- |
| (1) Escalonamento direto | Dono da conta e lançador ⇒ dividida para "Só meu": **403**. Criar "Só meu" com pagador alheio: **403**. Entregar a terceiro mantendo "Só meu" (`payerMemberId: Bia`): **403**. Baixa com pagador terceiro: **403**. Os caminhos que passam estão nas SEC-042/043/044. |
| (2) IDOR/BOLA | Zeca (outra família) em PATCH, GET e delete de lançamento, PATCH de cartão, PATCH e baixa de prevista e aceite de sugestão: **404**. Carla aponta conta, pagador, titular de cartão ou conta de baixa de outra família: **422** ou **403**. `accountOwnerOf` e a junção em `suggestions.ts` filtram por `familyId`. |
| (3) Previstas, séries, parcelas, cartão, estorno, IA, MCP | O terceiro recebe 403 em tudo. A dedupe de `assertCanWriteParcels` usa a chave pagador\|autor\|cartão\|conta, sem furo. `PayPlannedExpenseSchema` é `.strict()` e não aceita `isSharedExpense` (400). Na IA, `listCategorySuggestions` filtra pela regra nova, e o aceite chama `assertCanWriteTransaction`. O MCP não edita, não escreve em previstas, não aceita pagador e não expõe os campos novos. |
| (4) Ex-membro | A sessão de quem foi removido pela API dá **401**. Dono ex-membro: nem o dono da conta, nem o lançador, nem quem assumiu o cartão alteram (**403**, mensagem genérica sem nomes). Dono da conta ou lançador ex-membro: o dono ativo continua agindo. Quem volta à família recebe um membro novo (`repo.ts` procura `removedAt: null`), sem herdar o controle. |
| (5) DTOs e exportação | `TransactionDTO.accountOwnerId` (no detalhe e na lista), `PlannedExpenseDTO.paymentAccount.ownerId`, `paid.authorId/accountOwnerId` e `PayableItemDTO.authorId/paymentAccountOwnerId` só levam ids de membros da mesma família. O titular já aparece em `/accounts`. A exportação continua sem o "Só meu" alheio, inclusive para o dono da conta e o lançador (o efeito de "assumir" está na SEC-043). |
| (6) Mensagens 403 | Listam só os primeiros nomes dos controladores **ativos** da mesma família. O nome vem de `name` ou, sem nome, da parte local do e-mail, igual ao resto do app, onde o e-mail dos membros já é visível. Outra família recebe 404 antes da mensagem. Com dono ex-membro, a mensagem é genérica. Nota: a mensagem diz ao atacante qual cartão tomar (SEC-042), mas ele já veria isso no detalhe. |

---

## 4. O que não pôde ser verificado
- Fluxo HTTP completo em `next dev` (CSRF e cabeçalhos): não foi refeito nesta rodada. Os handlers rodaram em processo, com `withApi` e Origin, e o CSRF já tinha sido retestado antes.
- UI (`transaction-detail-drawer.tsx`, `previstas-screen.tsx`): botões e textos não foram verificados no navegador. O servidor é a barreira, e ela foi testada.
- MCP com cliente real (claude.ai): fora do escopo local. Só código e suítes.
- Produção (Vercel): não tocada.

## 5. Método e efeitos colaterais
- Revisão de `git diff bdd9ed1~1..672ea70` e leitura dos caminhos de escrita afetados.
- Provas num arquivo de teste e numa configuração de vitest **só no scratchpad**, não versionados: 19 cenários. Rodaram no banco descartável `finance_sec_somu`, que foi apagado no fim.
- Suítes do projeto `sec021`, `sec025-026`, `sec038`, `us-030` e `us084`: 47/47, no mesmo banco descartável.
- Sem `next dev`: `tsconfig.json`, `AGENTS.md` e `.next-sec` intactos. `git status` limpo antes do commit deste relatório.
