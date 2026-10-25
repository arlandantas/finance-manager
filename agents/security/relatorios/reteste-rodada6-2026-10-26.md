# Reteste da rodada 6 do "Só meu" (SEC-042..046, D-GES-52/53/54) e dos poderes plenos do Administrador (D-GES-55) — 2026-10-26

**Autor:** Agente de Segurança da Informação · **Tipo:** reteste + busca de regressões e brechas novas
**Código analisado:** `adc6946`..`ac946e9` (TASK-082/083, DEV-123..130, SDD-028 §11, US-084). Foco: `src/modules/transacoes/ownership.ts`, `transacoes/mutations.ts`, `transacoes/installment-manage.ts`, `previstas/service.ts`, `previstas/recurring-service.ts`, `cartoes/service.ts`, `familia/removal.ts`, `privacidade/export.ts` e a migração `20261028010000_sec042_card_owner_event`.
**Ambiente:** os Route Handlers reais rodaram em processo, pelo mesmo `call()` das suítes de integração (sessão por cookie, `withApi`, Origin e idempotência). Banco **descartável** `finance_sec_r6` no `db-test` (porta 5443), distinto do `finance_test` das outras suítes. O banco foi **apagado** no fim (`DROP DATABASE … WITH (FORCE)`). Não subi `next dev`. Dados só de teste (`*@sec.test`, `*@exemplo.com`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados. Não alterei código.

---

## 1. Resumo executivo

**Situação dos itens anteriores**

| Item | Situação | Prova |
| :-- | :-- | :-- |
| SEC-042 (Média) | **Corrigido** (resíduo do Admin ⇒ SEC-047) | Cadeia original da Bia: troca de titular **403** `CARD_OWNER_ONLY`; editar, trocar pagador e excluir seguem **403**; o item fica intacto. A troca legítima grava `CARD_OWNER_CHANGED` (append-only), visível a todos em `/family`. |
| SEC-043 (Baixa) | **Corrigido** | Dona da conta e lançadora pedem `payerMemberId` = elas mesmas ⇒ **403** `PERSONAL_OWNER_ONLY`. Na prevista, o mesmo vale para `responsibleMemberId`. A baixa por quem só controla não o torna pagador (**403**). |
| SEC-044 (Baixa) | **Corrigido** | (a) entrega em dois passos, (b) tornar dividida e (c) trocar a conta ⇒ **403**, pagador e versão intactos. (d) Baixa com a conta de um terceiro ⇒ **403**. Estorno por quem não controla a prevista ⇒ **403**, inclusive pela dona da conta usada na baixa. |
| SEC-045 (Baixa) | **Corrigido** | `endSeries` mantém a ocorrência "Só meu" que o ator não controla (suíte `sec042-046`, prova do relatório). |
| SEC-046 (Info) | **Corrigido (aviso)** | `reassignNotice` na revisão de remoção. Com contas, o texto cita o membro e o "Só meu". Sem contas, `null`. O comportamento de reatribuir continua como aceito. |
| D-GES-52 | **Conforme** | O Admin edita, exclui, restaura e estorna o "Só meu" de ex-membro. Dona da conta, lançadora e Membro comum: **403**, com mensagem genérica sem nomes. O histórico mostra o Admin como autor. |
| D-GES-53/54 | **Conforme** | Matriz de quem só controla verificada acima. Admin sobre "Só meu" de membro **ativo**, mesmo sendo lançadora e dona da conta: divisão, pagador e conta ⇒ **403**. |
| D-GES-55 | **Conforme, com ressalvas** (SEC-048..050) | O Admin sobre ex-membro torna dividida, troca pagador/responsável, conta e "Pagar com". Novo pagador "Só meu" só ele (para terceiro ⇒ **403** `PERSONAL_ON_BEHALF_FORBIDDEN`). Pagador de outra família, inexistente ou ex-membro, e conta de outra família ⇒ **422/404**. Admin de outra família ⇒ **404**. Na baixa, pagador ex-membro ⇒ **422**, terceiro ⇒ **403**, o próprio Admin ⇒ **201**. |

**Achados novos**

| Severidade | Qtde | IDs |
| :-- | :-: | :-- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Média | 0 | — |
| Baixa | 3 | SEC-047, SEC-048, SEC-049 |
| Informativa | 1 | SEC-050 |

**Top riscos**
1. **SEC-049 (Baixa): forja de "ex-membro".** O Admin remove um membro e passa a ter poder pleno sobre todo o "Só meu" dele. Se o reconvida, a pessoa volta como membro **novo**. O histórico antigo continua com dono "ex-membro" para sempre: o Admin mantém o poder pleno, e a pessoa que voltou recebe 403 nos próprios itens. Somado à SEC-048, o Admin pode assumir esses itens e lançá-los no acerto.
2. **SEC-048 (Baixa): crédito fabricado no acerto.** Com o poder pleno do D-GES-55, o Admin põe a si mesmo (ou outro ativo) como pagador de uma despesa que o ex-membro pagou e a torna dividida. Na prova, R$ 300 do Lucas viraram **+R$ 225 para a Admin**, e cada membro passou a dever R$ 75, inclusive o próprio ex-membro.
3. **SEC-047 (Baixa): Admin sobre membro ativo, via titular do cartão.** O D-GES-53 deixou o Admin trocar o titular. Ao virar titular, ele passa a controlar (editar e excluir) o "Só meu" de membros **ativos** lançado no cartão. Depois pode devolver o cartão. Fica registrado em dois eventos, mas contraria a regra "o Admin nunca age sobre o 'Só meu' de membro ativo".

### Perguntas ao usuário (via Gestor)
1. **SEC-047.** O Admin pode trocar o titular de um cartão fora da remoção de membro, sabendo que isso lhe dá controle sobre o "Só meu" de membros ativos no cartão? Recomendação: só o titular atual troca. O Admin troca só no fluxo de remoção, que já reatribui. Alternativa: manter o poder do Admin e aceitar o risco, porque o evento fica no histórico da família.
2. **SEC-048.** Com o poder pleno, o Admin pode escolher **qualquer** pagador ao tornar dividida a despesa de ex-membro? Recomendação: ao tornar dividida, o pagador continua sendo o ex-membro, que foi quem pagou. Trocar o pagador para um ativo só deve ser possível com a despesa em "Só meu" e para o próprio Admin, como já é hoje.
3. **SEC-049.** Quando a pessoa volta à família (mesmo usuário), ela deve recuperar o controle do próprio "Só meu" antigo, e o Admin perder o poder pleno sobre ele? Recomendação: sim. Tratar como "dono ativo" o vínculo antigo de um usuário que tem vínculo ativo na mesma família.
4. **SEC-050.** Tornar dividido o "Só meu" de ex-membro leva a descrição e a observação para a exportação de todos os membros. Isso é aceitável? Se for, só registrar.

---

## 2. Achados

### SEC-047 — O Administrador vira titular do cartão e controla o "Só meu" de membro ativo
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. Só o Admin consegue. Fica em `CARD_OWNER_CHANGED`, um evento append-only visível a todos, e nas revisões do lançamento. Ele não muda divisão, pagador nem conta. |
| Local | `src/modules/cartoes/service.ts:168-176` (`updateCard`: `ctx.role !== "ADMIN"` libera o Admin para qualquer troca). `src/modules/transacoes/ownership.ts` (`accountOwnerOf` lê o titular no momento da ação, SDD-028 §11.1). |
| Descrição e impacto | A correção da SEC-042 fechou o caminho para o Membro comum. Pelo D-GES-53, o Admin também troca o titular. Ao se tornar titular, ele passa a "dono do cartão" de todas as compras "Só meu" lançadas ali e, como quem só controla, altera valor, data, descrição, categoria e observação, e exclui ou restaura. Depois pode devolver o cartão ao titular. É o mesmo efeito da SEC-042 restrito ao Admin, e contraria "o Admin nunca age sobre o 'Só meu' de membro ativo" (D-GES-55: "só sobre lançamento cujo dono é ex-membro"). A revisão do lançamento mostra "UPDATE: Mariana", mas não diz que o poder veio da troca de titular. É preciso cruzar com o histórico da família. |
| Como explorar (prova local) | O cartão é da Carla. Lucas tem a compra "Só meu" de R$ 70 (pagador e autor).<br>1. Mariana (Admin) edita ⇒ **403**.<br>2. `PATCH /cards/:id {ownerMemberId: Mariana}` ⇒ **200**.<br>3. Mariana `PATCH /transactions/:id {amountInCents:100, description:"editado pela Admin"}` ⇒ **200**.<br>4. `{payerMemberId: Mariana}` ⇒ **403** `PERSONAL_OWNER_ONLY` (a estrutura continua protegida).<br>5. Devolve o cartão à Carla ⇒ **200**. Uma nova edição pela Mariana ⇒ **403**.<br>Rastro: 2 eventos `CARD_OWNER_CHANGED` com o ator Mariana, visíveis ao Lucas em `/family`. |
| Correção sugerida | Depende da pergunta 1. (a) Só o titular atual troca, e o Admin só pelo fluxo de remoção. Ou (b) guardar o titular **no momento da compra** para fins de controle. Ou (c) aceitar o risco, já que há registro. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | SEC-042, D-GES-53, D-GES-55, DEV-124, SDD-028 §11.1/§11.3 |

### SEC-048 — Poder pleno permite fabricar crédito no acerto com despesa do ex-membro
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. Só o Admin consegue, sobre item de ex-membro, e fica nas revisões com o nome dele. Mexe no valor que cada membro deve. |
| Local | `ownership.ts` `assertCanMakePersonal` com `fullPower`: dividida com qualquer pagador ativo. `transacoes/mutations.ts:174-179`. O mesmo vale na prevista e na série (`assertPlannedControllerLimits` retorna cedo com `fullPower`). |
| Descrição e impacto | O D-GES-55 dá ao Admin o poder de "trocar pagador e tornar dividido". Juntos, esses dois poderes deixam o Admin declarar que **ele** pagou uma despesa que o ex-membro pagou e cobrá-la da família. O DEV-129 impede entregar um "Só meu" a terceiro, mas não protege a combinação "dividida + pagador = Admin" (nem "pagador = outro ativo"). O ex-membro continua com uma cota (R$ 75 na prova) num acerto de família da qual saiu. Se o período já estava acertado, a confirmação `confirmSettledPeriod` existe, mas é o próprio Admin quem a envia. |
| Como explorar (prova local) | Lucas pagou R$ 300 "Só meu" na conta da Carla. Lucas sai. Mariana `PATCH {isSharedExpense:true, payerMemberId: Mariana, accountId: contaMariana}` ⇒ **200**.<br>Acerto de 2026-10: antes, todos com saldo 0. Depois, **Mariana +22.500**, e Lucas (ex-membro), Carla e Bia **−7.500** cada.<br>Variação: dividida mantendo o Lucas como pagador ⇒ Lucas +22.500. Isso é coerente com quem pagou, mas ele continua num acerto de uma família da qual saiu. |
| Correção sugerida | Depende da pergunta 2. Recomendação: com `fullPower`, ao tornar dividida, manter `payerMemberId` = ex-membro (quem pagou). Trocar o pagador para ativo só com a despesa em "Só meu" e para o próprio Admin. Também vale levar o tema "ex-membro com cota no acerto do período" ao TL. Teste de integração correspondente. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | D-GES-55, DEV-128/129, SDD-028 §11.3 item 12, ADR-021 |

### SEC-049 — Forja de "ex-membro": remover e reconvidar dá ao Admin poder pleno permanente, e quem volta perde o controle do próprio "Só meu"
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. A remoção é legítima do Admin, mas é visível: a sessão do removido cai, e o evento `MEMBER_REMOVED` é append-only. Com a SEC-048, porém, leva a efeito financeiro e à perda de controle de dados pessoais pelo titular. |
| Local | `ownership.ts` `isAdminOverRemovedOwner`, `assertCanWriteTransaction` e `plannedWriteDecision`: decidem pelo **vínculo** (`member.removedAt`), não pela pessoa. `familia/repo.ts`: quem volta recebe um `Member` novo (US-035). |
| Descrição e impacto | (1) **Forja.** Antes da remoção, o Admin recebe 403 em tudo no "Só meu" do Lucas. Depois de `POST /members/:id/remove` (200), tem poder pleno imediato: torna dividido, assume o pagamento e muda a conta. (2) **Reconvite.** Lucas aceita o convite e volta como um vínculo novo. Os itens antigos continuam com o vínculo removido como dono, então: (a) **Lucas recebe 403** ao editar o próprio "Só meu" antigo, com a mensagem genérica; (b) **o Admin mantém o poder pleno** e captura o item (`payerMemberId: Mariana` ⇒ 200); (c) o item capturado **sai da exportação do Lucas** ("Terapia" ausente) e entra na da Admin. Antes do D-GES-52, quem voltava também perdia o controle, mas ninguém ganhava. O ciclo "remover ⇒ alterar ⇒ reconvidar" contorna, na prática, "o Admin nunca sobre o 'Só meu' de membro ativo". |
| Como explorar (prova local) | Lucas tem "Farmácia" (R$ 300, com observação) e "Terapia", ambos "Só meu" na conta da Carla.<br>1. Mariana `{isSharedExpense:true, payerMemberId: Mariana}` ⇒ **403**. Editar o valor ⇒ **403**.<br>2. `POST /members/{Lucas}/remove {}` ⇒ **200** (1 evento `MEMBER_REMOVED`).<br>3. A mesma alteração da etapa 1 ⇒ **200** (SEC-048).<br>4. `POST /invitations` para o Lucas ⇒ 201, e o aceite ⇒ 200.<br>5. O Lucas novo edita "Terapia" ⇒ **403**.<br>6. Mariana `{payerMemberId: Mariana}` em "Terapia" ⇒ **200**.<br>7. A exportação do Lucas não tem mais "Terapia". "Farmácia" continua lá, porque ele é o autor.<br>Rastro: as revisões mostram "UPDATE: Mariana Silva". |
| Correção sugerida | Depende da pergunta 3. Recomendação: considerar "dono ativo" o vínculo antigo cujo `userId` tem vínculo ativo na mesma família. Nesse caso, o Admin perde o poder pleno, e a pessoa que voltou age como dona. Alternativa mínima: avisar na revisão de remoção que o Admin passa a ter poder pleno sobre N lançamentos "Só meu" do membro. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | D-GES-52, D-GES-55, US-035, ADR-019, SDD-028 §11, SEC-029 |

### SEC-050 — Tornar dividido o "Só meu" de ex-membro leva o conteúdo pessoal à exportação de todos
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Informativa. É consequência direta do D-GES-55. A leitura nas telas já era permitida. |
| Local | `privacidade/export.ts:99` (`visibleToMe`: dividida é visível a todos) + `fullPower` em `ownership.ts`. |
| Descrição e impacto | O DEV-101 e a SEC-029 tiram o "Só meu" alheio do arquivo exportado. Com uma única alteração do Admin (tornar dividido), a descrição e a observação do ex-membro passam a sair no arquivo de todos os membros ativos. Na prova, a observação "remédio controlado" apareceu na exportação da Carla. Depois disso, qualquer membro também edita o valor, porque a despesa passou a ser dividida (**200**). Assumir o pagamento e voltar a "Só meu" continuam **403**. |
| Como explorar (prova local) | P3 e P3b: o Admin torna o item dividido. `GET /me/export` da Carla e da Bia passa a conter a descrição e a observação. |
| Correção sugerida | Decisão de produto (pergunta 4). Se o usuário aceitar, só registrar. Se não, apagar ou avisar sobre a observação ao tornar dividido. |
| Status | Em análise (usuário) |
| Rastreio | D-GES-55, DEV-101, SEC-029 |

---

## 3. Verificações sem achado

| Item | Resultado |
| :-- | :-- |
| Admin pleno só sobre ex-membro | Sobre "Só meu" de membro ativo (mesmo sendo lançadora e dona da conta): divisão, pagador e conta ⇒ **403** `PERSONAL_OWNER_ONLY`. `isAdminOverRemovedOwner` exige `role = ADMIN`, dono ≠ ator e `removedAt` não nulo, lidos na transação e filtrados por `familyId`. |
| Membro comum, dono da conta e lançador sobre ex-membro | **403**, com a mensagem genérica (sem nomes de controladores). |
| Novo pagador só o Admin enquanto "Só meu" | Pagador = Bia mantendo "Só meu" ⇒ **403** `PERSONAL_ON_BEHALF_FORBIDDEN`. Na baixa, pagador ex-membro ⇒ **422**, terceiro ⇒ **403**, o Admin ⇒ **201**. |
| IDOR entre famílias | Admin de outra família sobre o lançamento ⇒ **404**. Pagador ou responsável de outra família, inexistente ou ex-membro, e conta de outra família ⇒ **422/404** (suíte `d-ges-55`). Titular de cartão de outra família ou ex-membro ⇒ **422**. Admin de outra família no `PATCH /cards/:id` ⇒ **404**. `memberExists` e `findMember` filtram por `familyId` e `removedAt: null`. |
| Troca de titular (SEC-042) | Membro sem relação ⇒ **403** `CARD_OWNER_ONLY`. Reenviar o mesmo titular não conta como troca. O evento guarda o ator, `from` e `to`, além de `cardId` e `cardName`, todos da própria família. A tabela de eventos é append-only (trigger `forbid_mutation`), então o rastro não se apaga. Ao criar um cartão, o titular pode ser outro membro (201), o que é inofensivo: o cartão nasce sem compras. |
| Parcelado | `installment-manage.ts` só exclui e restaura (schemas `.strict()` com `version`), e as duas operações passam por `assertCanWriteParcels`. Não há caminho de estrutura nem de troca de cartão. |
| endSeries (SEC-045) | `plannedWriteDecision` é aplicado a cada ocorrência pendente, e `removedCount` conta só as removidas. Com dono ex-membro, o Admin encerra (D-GES-52). |
| Aviso (SEC-046) | O texto contém só o nome do membro alvo, e o `reassignNotice` vale também para quem sai. |
| Vazamento nas respostas | As mensagens 403 com dono ex-membro são genéricas. O DTO de `CARD_OWNER_CHANGED` leva ids e nomes de membros da mesma família. O acerto marca o ex-membro com `removed: true`, como já fazia. |
| Quem alterou | As revisões (`TransactionRevision`) registram o Admin em todas as alterações com poder pleno (prova P3 e suíte `sec042-046`). |

## 4. O que não pôde ser verificado
- **UI** (`edit-transaction-form.tsx`, `planned-drawer.tsx`, `card-drawer.tsx`, `remove-member-dialog.tsx`, o seletor "Nome (ex-membro)" do DEV-130): não verificada no navegador. A barreira é o servidor, e ela foi testada.
- Fluxo HTTP completo em `next dev` (cabeçalhos e CSRF): não refeito. Os handlers rodaram em processo, com `withApi` e Origin.
- Produção (Vercel) e a migração `20261028010000` aplicada em produção: não tocadas. A migração foi aplicada só no banco descartável.
- MCP com cliente real: fora do escopo. Pelo código, nada mudou nas ferramentas nesta rodada.

## 5. Método e efeitos colaterais
- Revisão de `git diff adc6946^..ac946e9` (código, migração e testes).
- Suítes do projeto `sec042-046-so-meu-reteste`, `d-ges-55-admin-poderes-plenos`, `us084`, `sec021`, `sec025-026`, `sec038`, `us-030` e `us-035`: **100/100**, no banco descartável `finance_sec_r6`.
- Provas próprias num arquivo de teste e numa configuração de vitest **só no scratchpad**, não versionados: 9 cenários (P1..P5). Incluem as provas originais da SEC-042 (cadeia de 6 passos) e da SEC-044(a)(b)(c); as demais provas originais estão na suíte `sec042-046`, conferida contra o relatório anterior.
- O banco `finance_sec_r6` foi apagado no fim. Sem `next dev`: `tsconfig.json`, `AGENTS.md` e `.next-sec` intactos. `git status` limpo antes do commit deste relatório.
