# Estado vigente: "Só meu" (propriedade e controle de lançamentos)

Atualizado: 2026-10-31 (US-093b: dono sem conta). Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit.

## a) Resumo para o usuário
- "Só meu" = despesa com `isSharedExpense=false` (inclui compra no cartão, parcelas, baixa de prevista, lançamento do assistente; prevista/série pelo responsável). Receita, transferência, acerto e pagamento de fatura não são "Só meu".
- Todos veem; altera (valor, data, descrição, categoria, observação, excluir, restaurar, estornar) quem PAGOU, o DONO DA CONTA/CARTÃO e o LANÇADOR. Só o pagador muda divisão, pagador, conta e "Pagar com".
- Ninguém torna "Só meu" o que não é seu nem cria "Só meu" em nome de outro.
- Dono ex-membro: só o Administrador age (poderes plenos: divisão, conta, "Pagar com"), mas o pagador de ex-membro que não voltou é imutável para todos (D-GES-59). Quem volta à família (mesmo usuário, vínculo novo) recupera o controle total do item e o Administrador perde o poder pleno sobre ele (SEC-049).
- Membro sem conta (US-093b, [SDD-034](../tech-lead/sdd/SDD-034-membro-sem-conta-atribuicao-e-acerto-us-093.md); aguarda validação do Gestor e reteste da Segurança): o Administrador é o TUTOR do "Só meu" de dono ATIVO sem conta (mesmos poderes plenos do Admin-ex, sem assumir o pagador) e é o único que cria "Só meu" em nome dele.
- "Só meu" alheio (dono não está nos vínculos do solicitante) nunca vai à exportação.
- Ciclo de segurança encerrado (rodadas 1..8, D-GES-61). Aberto: SEC-054/055/056 aceitos por decisão do Gestor, sujeitos a veto do usuário; UI nunca verificada no navegador.
- Decisões que dependem do usuário: veto a D-GES-57/61 (aceites de risco); reautenticação nas exclusões (SEC-037, recomendação: manter confirmação digitada + e-mail).

## b) Regras vigentes
Siglas: Dono = pagador (sem pagador, autor; prevista/série: responsável). DC = dono da conta/cartão (lido na hora da ação). Lanç = autor (imutável). "Só controla" = DC ou Lanç sem ser Dono. Admin-ex = Administrador atual quando o Dono é ex-membro sem retorno. Voltou = ex-vínculo cujo usuário tem vínculo ativo na MESMA família (vale como Dono, R-9).

| Ação em "Só meu" | Dono (ou voltou) | Só controla | Admin-ex | Outro membro (inclui Admin de membro ativo) | Ex-membro |
| :-- | :-: | :-: | :-: | :-: | :-: |
| Ver (detalhe, Extrato, totais, histórico, MCP) | sim | sim | sim | sim | n/a |
| Editar valor/data/descrição/categoria/observação; excluir; restaurar | sim | sim | sim | 403 | não |
| Estornar baixa / dar baixa (prevista) | sim | sim, conta do responsável ou do próprio ator; pagador original mantido | sim, qualquer conta da família | 403 | não |
| Mudar divisão, conta, "Pagar com" | sim | 403 | sim | 403 | não |
| Mudar/assumir pagador ou responsável | sim, só em nome próprio | 403 | 403 (D-GES-59) | 403 | não |
| Pagador/responsável ex-membro sem retorno (Só meu OU dividida) | só quem voltou | 403 | 403 | 403 | n/a |
| Exportar "Só meu" alheio | n/a | não | não | não | não |

| Tutor (US-093b, `ownerUnlinked`) | Dono ATIVO sem conta (`userId` nulo), lido com `FOR SHARE` na transação (SEC-066b): `adminFullPower` = Admin sobre ex-membro OU sobre sem conta. Admin: editar, excluir, restaurar, estornar, mudar divisão/conta/"Pagar com" = sim; assumir o pagador (para si) = 403 `UNLINKED_PAYER_FORBIDDEN`; entregá-lo a terceiro = 403 `PERSONAL_ON_BEHALF_FORBIDDEN`. Membro comum: só Lanç/DC com conta (403 "Só {nomes} e um Administrador podem alterar este lançamento."; sem conta saem da lista). O aceite/remoção desliga o tutor sem migração. |
| Ordem de travas e baixa do tutor (revisão do TL) | `lockFamilySplit` ➔ contas (`shareLockAccounts`, FOR SHARE, conta ATUAL e NOVA, tomadas antes de qualquer `assertCanWrite*`/`plannedWriteDecision`/`ownerStanding`; `removal.ts` ordena as contas e cartões a arquivar por id) ➔ `FOR SHARE` do dono, a mesma ordem de `removal.ts` (evita 40P01 com a remoção do membro). Baixa do "Só meu" de dono sem conta: pagador = o dono; Admin para si 403 `UNLINKED_PAYER_FORBIDDEN`, para terceiro 403 `PERSONAL_ON_BEHALF_FORBIDDEN`. |
| Auditoria de travas (conta ➔ cartão ➔ dono; todos os chamadores) | `createExpenseCore`/`createInstallmentPurchase`: `lockAccountsForPosting` e `findCardForPosting` (FOR SHARE) já ANTES de `assertPersonalForSelf`. `createPlanned`/`createSeries`: `shareLockAccounts` antes de `assertPlannedResultAllowed` (a FK da criação trava a conta). `updateTransaction`/`loadMutable`, delete/restore (`assertCanWriteTransaction` trava `accountId`+`cardId` da linha), `assertCanWriteParcels`, sugestão da IA: idem, via `ownerStanding(.., accountIds, cardIds)`. `updatePlanned`, baixa, `updateSeries`: `[conta atual, nova]` antes de `assertCanWritePlanned`. `undoPlannedPayment`: `[row.paymentAccountId, t.accountId]` + `t.cardId` antes. `endSeries`: trava `[conta da série, conta de cada ocorrência pendente]` ANTES de `assertCanWritePlanned`/`plannedWriteDecision` (fecha a Baixa do TL; teste 9c "encerrar a série"). `isAdminOverRemovedOwner`: sem chamador. Testes 9c/9d com conexão crua (FOR UPDATE da conta/cartão ➔ `members FOR UPDATE NOWAIT` tem de passar). |
| Criar "Só meu" em nome de sem conta (exceção SEC-026c) | Só CRIAÇÃO (`assertPersonalForSelf`/`assertPlannedResultAllowed`, agora assíncronas), só `ctx.role=ADMIN`, só dono ativo sem conta com `FOR SHARE`, NUNCA com `opts.assistant` (MCP, SEC-067). Edição que muda o pagador/responsável de "Só meu" segue 403. Membro, Admin para membro com conta e Admin para ex-membro sem conta: 403 `PERSONAL_ON_BEHALF_FORBIDDEN`. |
| Pagador/responsável para ou de sem conta (SEC-059a) | `violatesUnlinkedPayerChange`: só o Lanç (autor) ou o Admin; Admin não autor nunca para si (403 `UNLINKED_PAYER_FORBIDDEN`, "Você não pode se colocar como pagador no lugar de quem não tem acesso ao app. Escolha outro membro."); não autor não Admin: 403 "Apenas quem lançou ou o Administrador pode definir este pagador.". Vale em lançamento à vista/cartão/parcelado (EXPENSE), prevista e série; receita fora. Verificada ANTES da trava de captura. Torná-la "Só meu" a dividida paga por sem conta: 403 `PERSONAL_OWNER_ONLY` para todos (Q-TL-U2). |

| Por tipo | Regra |
| :-- | :-- |
| Lançamento / receita / transferência / acerto | Não-"Só meu": qualquer membro (US-013). |
| Cartão / parcelado | DC = titular do cartão. Controle vale por parcela: `assertCanWriteParcels` exige controle sobre todas. Titular do cartão: só o titular atual troca (`CARD_OWNER_ONLY`); Admin só na remoção/saída de membro (`familia/removal.ts`); grava `CARD_OWNER_CHANGED`. Conta bancária não troca de titular. |
| Prevista / série | Dono = `responsibleMemberId`; DC = dono do "Pagar com". Mesmas travas (`assertPlannedControllerLimits`). `endSeries` pula ocorrências "Só meu" alheias sem erro (SEC-045). |
| Baixa / estorno | Estorno exige controle sobre a prevista E sobre a despesa gerada (SEC-044d). Responsável ex-membro sem retorno: a baixa é pagamento novo, pagador = quem a realiza; informar outro = 403 (DEV-135). |
| Acerto | "Só meu" fica fora do motor de acerto (`sharedExpenses` só `isSharedExpense=true`). |
| Exportação | Só "Só meu" cujo dono está nos vínculos do solicitante (SEC-029). Observação de dividida de ex-membro alheio sai `null` (SEC-050). |
| Histórico | `TransactionRevision` grava sempre o ator real (dono da conta, lançador, Admin). Sem e-mail (D-GES-52). |
| Assistente/MCP | Leitura igual à tela. Única escrita (`lancar_despesa`): despesa à vista, "Só meu", do próprio membro, sem editar/excluir/trocar pagador (US-076a). |
| IA | Sugestão de categoria: lista só o que o ator pode escrever; aceitar chama `assertCanWriteTransaction`. |

Mensagens 403 (`PERSONAL_OWNER_ONLY`): lista de nomes ("Só A, B e C podem alterar este lançamento."); captura: "Só quem pagou pode tornar este lançamento "Só meu""; estrutura: SEC-043/044; ex-membro: `GONE_PAYER_LOCKED`. Em nome de outro: `PERSONAL_ON_BEHALF_FORBIDDEN`.

## c) Invariantes e travas anti-captura
1. Só o pagador/responsável ATUAL torna dividida em "Só meu" (SEC-025/038; `assertCanMakePersonal`, `violatesPlannedCapture`).
2. "Só meu" só em nome de quem age, na criação (`assertPersonalForSelf`, SEC-026c) e na edição; edição que mantém o mesmo responsável dispensa a trava (D-GES-50).
3. Quem não é pagador nem autor não se coloca como pagador de dividida alheia (D-GES-47).
4. Quem só controla não muda divisão/pagador/conta/"Pagar com" nem assume pagamento; reenviar o valor atual não conta (SEC-043/044).
5. Pagador ex-membro sem retorno imutável a cada pedido, olhando o estado atual (`violatesGonePayerLock`, `payerGone`), em lançamento, cartão, parcela, prevista, série.
6. Poder pleno (`fullPower`) só: Admin atual, dono ex-membro, item "Só meu"; destinos validados por `findMember`/`findAccount` com `familyId` (IDOR continua 422/404).
7. Dono = PESSOA, não vínculo (`ownerStanding`, sempre filtrado por `familyId`, SEC-049).
8. Travas rodam dentro da transação, antes da mutação.
9. Receita/transferência/acerto/fatura nunca entram na regra (`isPersonalExpense`).

## d) Limitações e riscos aceitos
| ID | Risco | Decisão |
| :-- | :-- | :-- |
| SEC-052 | Remoção: Admin pode ficar com cartão/conta e controlar "Só meu" de ativos ali lançados | Aceito (info); aviso na revisão da remoção (SEC-046) |
| SEC-053 | Quem voltou e divide item antigo aparece 2x no acerto | Aceito (info) |
| SEC-054 | Excluir e relançar move o crédito do ex-membro; qualquer membro, em dividida | Aceito (D-GES-61): inerente ao livro-caixa; defesa = histórico |
| SEC-055 | Estornar baixa e dar nova baixa move o crédito (inclui resíduo DEV-132 via prevista) | Aceito (D-GES-61) |
| SEC-056 | Acerto com ex-membro aceita qualquer conta de destino da família | Aceito (D-GES-61) |
| SEC-057 | Série de removido: editar a série devolve ocorrências ao ex-membro | Só registrado; "encerrar e criar outra" resolve |
| SEC-046 | Remoção dá ao Admin controle dos "Só meu" nas contas reatribuídas | Aceito + aviso |
| SEC-041 | Risco desprezível (convites) | Aceito |
Todos sujeitos a veto do usuário.

## e) Em andamento / pendências
- US-093b implementada (TASK-098), aguarda validação do Gestor, revisão do TL (`ownership.ts`) e reteste da Segurança (SEC-059a, SEC-066b, SEC-067). UI do tutor/pagador (seletores desabilitados, dicas) coberta por E2E, nunca vista no navegador. DEV-163: o autor Admin de um "Só meu" de sem conta pode trocar o pagador para si (Lanç isento, SDD-034 R4).
- Nada mais em implementação. Ciclo de segurança do "Só meu" encerrado (D-GES-61); novos achados só de mudanças futuras.
- Verificação no navegador da UI (seletor "Quem pagou?" fixo para ex-membro, campos desabilitados, `pay-drawer` de quem só controla): NUNCA feita (D-GES-54/56/58/60).
- Polimento citado em D-GES-54/56 (seletor vazio para Admin-ex; `pay-drawer` de quem só controla enviava pagador próprio e levava 403): não confirmado como resolvido.
- Usuário: veto aos aceites; SEC-037 (reautenticação).
- Pergunta ao usuário (pendente): os agregados enviados à IA (D-GES-29) INCLUEM despesas "Só meu" de outros membros (as consultas não filtram `isSharedExpense`; vai só rótulo de categoria e total, sem identificar quem lançou). Recomendação: excluir "Só meu" alheio dos agregados. Detalhe em [ia-assistente-mcp.md](ia-assistente-mcp.md) §d.

## f) Mapa de fontes
Código (`src/modules/`): `transacoes/ownership.ts` (regra única: `canWriteTransaction`, `assertCanWriteTransaction`, `assertCanMakePersonal`, `ownerStanding`, `isAdminOverRemovedOwner`, `canChangeStructure`, `violatesGonePayerLock`, `effectiveOwner`, planned*); `transacoes/{service,mutations,installment-manage,installment-create}.ts`; `previstas/{service,recurring-service}.ts`; `cartoes/service.ts` (`CARD_OWNER_ONLY`); `privacidade/export.ts`; `mcp/assistant-write.ts`; `analise-ia/suggestions.ts`; UI: `app/(app)/extrato/{edit-transaction-form,transaction-detail-drawer}.tsx`, `previstas/{planned-drawer,pay-drawer}.tsx`.
Testes (`tests/`): `unit/sec021-ownership.test.ts`, `unit/transacoes/unlinked-payer.test.ts`, `unit/meta/member-reads.test.ts` (estático: `await`, `FOR SHARE`, MCP); `integration/us-093b-so-meu-e-pagador-sem-conta` (20; matriz, concorrência aceite×Admin); E2E `US-093-*.feature`; `integration/` `sec021-so-meu-dono`, `us084-so-meu-controle`, `sec042-046-so-meu-reteste`, `sec047-050-reteste-rodada6`, `d-ges-55-admin-poderes-plenos`, `d-ges-59-pagador-ex-membro-imutavel`, `sec025-026-so-meu-regras`, `us-030-so-meu-por-padrao`, `sec029-032-exportacao`, `us076-lancar-direto`.
Docs: [US-084](../product-owner/backlog/stories/US-084-lancamento-so-meu-so-o-dono-altera.md); [SDD-028 §11](../tech-lead/sdd/SDD-028-correcoes-de-seguranca-grupo-b.md); [decisões D-GES-42..61](../manager/decisoes-do-gestor.md); relatórios em [`security/relatorios/`](../_historico/security/relatorios/) (`reteste-so-meu-2026-10-25`, `reteste-rodada6/7/8`); D-PO-91..98 em [decisoes-po-seguranca-sec.md](../_historico/product-owner/backlog/decisoes-po-seguranca-sec.md).

| Regra | Origem |
| :-- | :-- |
| Só o dono altera (superada) | SEC-021, D-GES-42, DEV-88 |
| Anti-captura | SEC-025/026/038, D-GES-45/48, D-PO-92 |
| DC e Lanç controlam | D-GES-50, DEV-120..122, D-PO-94 |
| Admin age sobre ex-membro | D-GES-52, DEV-123 |
| Limites de quem só controla; titular do cartão; endSeries | D-GES-53, SEC-042..046, DEV-124..127 |
| Poderes plenos do Admin-ex | D-GES-55, DEV-128..130, D-PO-96 |
| Titular só o atual; dono = pessoa; observação | D-GES-57, SEC-047..050, DEV-131..134, D-PO-97 |
| Pagador de ex-membro imutável; baixa | D-GES-59, SEC-051, DEV-135, D-PO-98 |
| Riscos aceitos | D-GES-61, SEC-052..057 |
| Exportação | SEC-029, D-GES-46 |

Divergências docs x código (código vence):
1. SDD-028 §11.3 item 2 cita `assertControllerLimits`; não existe. Real: trava inline em `assertCanMakePersonal` (despesas) e `assertPlannedControllerLimits` (previstas/séries).
2. SDD-028 §11.2 (baixa, Admin-ex) diz "pagador da baixa = responsável ou o Admin"; vigente (código, §11.3 item 14, DEV-135): pagador = quem realiza a baixa.
3. D-GES-56/58, DEV-129 e o enunciado original do SDD-028 §11.3 itens 12(b)/13 (marcados REVOGADO no SDD) descrevem Admin como possível novo pagador do "Só meu" de ex-membro: revogado por D-GES-59 (o código trava).
4. US-084, status e rastreabilidade acumulam revisões (DEV-88, D-GES-50/52/53/55/57/59) em linha única; regra vigente = §b deste arquivo.
5. D-GES-42 ("só o dono") e D-GES-53 (Admin troca titular por conta própria, via SEC-042) estão superadas por D-GES-50 e D-GES-57.
