# Spec 01 — "Só meu" (propriedade e controle de lançamentos)

Atualizado: 2026-10-31

## Resumo
- "Só meu" = despesa com `isSharedExpense=false` (compra no cartão, parcelas, baixa de prevista, lançamento do assistente; prevista/série pelo responsável). Receita, transferência, acerto e pagamento de fatura não são "Só meu".
- Todos veem. Altera (valor, data, descrição, categoria, observação, excluir, restaurar, estornar) quem PAGOU, o DONO DA CONTA/CARTÃO e o LANÇADOR. Só o pagador muda divisão, pagador, conta e "Pagar com".
- Ninguém torna "Só meu" o que não é seu nem cria "Só meu" em nome de outro (exceção: Admin para dono ativo sem conta, abaixo).
- Dono ex-membro: só o Administrador age (poderes plenos), mas o pagador de ex-membro que não voltou é imutável para todos (D-GES-59). Quem volta (mesmo usuário, vínculo novo) recupera o controle e o Admin perde o poder pleno (SEC-049).
- "Só meu" alheio (dono fora dos vínculos do solicitante) nunca vai à exportação.

## Regras
Siglas: Dono = pagador (sem pagador, autor; prevista/série: responsável). DC = dono da conta/cartão (lido na hora da ação). Lanç = autor (imutável). "Só controla" = DC ou Lanç sem ser Dono. Admin-ex = Administrador atual quando o Dono é ex-membro sem retorno. Voltou = ex-vínculo cujo usuário tem vínculo ativo na MESMA família (vale como Dono).

| Ação em "Só meu" | Dono (ou voltou) | Só controla | Admin-ex | Outro membro (inclui Admin de membro ativo) | Ex-membro |
| :-- | :-: | :-: | :-: | :-: | :-: |
| Ver (detalhe, Extrato, totais, histórico, MCP) | sim | sim | sim | sim | n/a |
| Editar valor/data/descrição/categoria/observação; excluir; restaurar | sim | sim | sim | 403 | não |
| Estornar baixa / dar baixa (prevista) | sim | sim, conta do responsável ou do próprio ator; pagador original mantido | sim, qualquer conta da família | 403 | não |
| Mudar divisão, conta, "Pagar com" | sim | 403 | sim | 403 | não |
| Mudar/assumir pagador ou responsável | sim, só em nome próprio | 403 | 403 (D-GES-59) | 403 | não |
| Pagador/responsável ex-membro sem retorno (Só meu OU dividida) | só quem voltou | 403 | 403 | 403 | n/a |
| Exportar "Só meu" alheio | n/a | não | não | não | não |

Tutor do dono ATIVO sem conta (US-093b, `ownerUnlinked`, SDD-034):
- `adminFullPower` = Admin sobre ex-membro OU sobre dono sem conta (`userId` nulo, lido com `FOR SHARE` na transação, SEC-066b).
- Admin: editar, excluir, restaurar, estornar, mudar divisão/conta/"Pagar com" = sim.
- Admin assumir o pagador (para si) = 403 `UNLINKED_PAYER_FORBIDDEN`; entregá-lo a terceiro = 403 `PERSONAL_ON_BEHALF_FORBIDDEN`.
- Membro comum: só Lanç/DC com conta; senão 403 "Só {nomes} e um Administrador podem alterar este lançamento."; sem conta saem da lista.
- Aceite/remoção do membro desliga o tutor sem migração. Baixa do "Só meu" de dono sem conta: pagador = o dono.
- Criar "Só meu" em nome de sem conta (SEC-026c): só CRIAÇÃO (`assertPersonalForSelf`/`assertPlannedResultAllowed`, assíncronas), só `ctx.role=ADMIN`, só dono ativo sem conta com `FOR SHARE`, NUNCA com `opts.assistant` (MCP, SEC-067).
- Edição que muda pagador/responsável de "Só meu" segue 403. Membro, Admin para membro com conta e Admin para ex-membro sem conta: 403 `PERSONAL_ON_BEHALF_FORBIDDEN`.
- Pagador/responsável para ou de sem conta (SEC-059a, `violatesUnlinkedPayerChange`): só Lanç ou Admin; Admin não autor nunca para si (403 `UNLINKED_PAYER_FORBIDDEN`: "Você não pode se colocar como pagador no lugar de quem não tem acesso ao app. Escolha outro membro.").
- Não autor e não Admin: 403 "Apenas quem lançou ou o Administrador pode definir este pagador.". Vale em EXPENSE à vista/cartão/parcelado, prevista e série; receita fora. Verificada ANTES da trava de captura.
- Tornar "Só meu" a dividida paga por sem conta: 403 `PERSONAL_OWNER_ONLY` para todos.
- DEV-163: o autor Admin de um "Só meu" de sem conta pode trocar o pagador para si (Lanç isento, SDD-034 R4).

Ordem de travas (todos os chamadores): `lockFamilySplit` -> contas (`shareLockAccounts`, FOR SHARE, conta ATUAL e NOVA, antes de qualquer `assertCanWrite*`/`plannedWriteDecision`/`ownerStanding`) -> cartão -> `FOR SHARE` do dono, na ordem de `removal.ts` (evita 40P01).
- `removal.ts` ordena contas e cartões a arquivar por id.
- `createExpenseCore`/`createInstallmentPurchase`: `lockAccountsForPosting` e `findCardForPosting` (FOR SHARE) ANTES de `assertPersonalForSelf`.
- `createPlanned`/`createSeries`: `shareLockAccounts` antes de `assertPlannedResultAllowed`.
- `updateTransaction`/`loadMutable`, delete/restore (`assertCanWriteTransaction` trava `accountId`+`cardId`), `assertCanWriteParcels`, sugestão da IA: via `ownerStanding(.., accountIds, cardIds)`.
- `updatePlanned`, baixa, `updateSeries`: `[conta atual, nova]` antes de `assertCanWritePlanned`. `undoPlannedPayment`: `[row.paymentAccountId, t.accountId]` + `t.cardId`.
- `endSeries`: trava `[conta da série, conta de cada ocorrência pendente]` ANTES de `assertCanWritePlanned`/`plannedWriteDecision`. `isAdminOverRemovedOwner`: sem chamador.

| Por tipo | Regra |
| :-- | :-- |
| Lançamento / receita / transferência / acerto | Não-"Só meu": qualquer membro (US-013). |
| Cartão / parcelado | DC = titular do cartão. Controle por parcela: `assertCanWriteParcels` exige controle sobre todas. |
| Titular do cartão | Só o titular atual troca (`CARD_OWNER_ONLY`); Admin só na remoção/saída de membro (`familia/removal.ts`); grava `CARD_OWNER_CHANGED`. Conta bancária não troca de titular. |
| Prevista / série | Dono = `responsibleMemberId`; DC = dono do "Pagar com". Mesmas travas (`assertPlannedControllerLimits`). `endSeries` pula ocorrências "Só meu" alheias sem erro (SEC-045). |
| Baixa / estorno | Estorno exige controle sobre a prevista E sobre a despesa gerada (SEC-044d). Responsável ex-membro sem retorno: baixa é pagamento novo, pagador = quem realiza; informar outro = 403 (DEV-135). |
| Acerto | "Só meu" fica fora do motor de acerto (`sharedExpenses` só `isSharedExpense=true`). |
| Exportação | Só "Só meu" cujo dono está nos vínculos do solicitante (SEC-029). Observação de dividida de ex-membro alheio sai `null` (SEC-050). |
| Histórico | `TransactionRevision` grava sempre o ator real (dono da conta, lançador, Admin). Sem e-mail (D-GES-52). |
| Assistente/MCP | Leitura igual à tela. Única escrita (`lancar_despesa`): despesa à vista, "Só meu", do próprio membro, sem editar/excluir/trocar pagador (US-076a). |
| IA | Sugestão de categoria lista só o que o ator pode escrever; aceitar chama `assertCanWriteTransaction`. |

Mensagens 403 `PERSONAL_OWNER_ONLY`: lista de nomes ("Só A, B e C podem alterar este lançamento."); captura: "Só quem pagou pode tornar este lançamento "Só meu""; estrutura: SEC-043/044; ex-membro: `GONE_PAYER_LOCKED`.

## Invariantes
1. Só o pagador/responsável ATUAL torna dividida em "Só meu" (SEC-025/038; `assertCanMakePersonal`, `violatesPlannedCapture`).
2. "Só meu" só em nome de quem age, na criação (`assertPersonalForSelf`, SEC-026c) e na edição; edição que mantém o mesmo responsável dispensa a trava (D-GES-50).
3. Quem não é pagador nem autor não se coloca como pagador de dividida alheia (D-GES-47).
4. Quem só controla não muda divisão/pagador/conta/"Pagar com" nem assume pagamento; reenviar o valor atual não conta (SEC-043/044).
5. Pagador ex-membro sem retorno imutável a cada pedido, pelo estado atual (`violatesGonePayerLock`, `payerGone`), em lançamento, cartão, parcela, prevista, série.
6. Poder pleno (`fullPower`) só: Admin atual, dono ex-membro, item "Só meu"; destinos validados por `findMember`/`findAccount` com `familyId` (IDOR = 422/404).
7. Dono = PESSOA, não vínculo (`ownerStanding`, sempre filtrado por `familyId`, SEC-049).
8. Travas rodam dentro da transação, antes da mutação.
9. Receita/transferência/acerto/fatura nunca entram na regra (`isPersonalExpense`).

## Riscos aceitos
Todos sujeitos a veto do usuário (D-GES-57/61).

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

## Fontes (código/testes)
Código (`src/modules/`): `transacoes/ownership.ts` (regra única: `canWriteTransaction`, `assertCanWriteTransaction`, `assertCanMakePersonal`, `ownerStanding`, `canChangeStructure`, `violatesGonePayerLock`, `effectiveOwner`, planned*); `transacoes/{service,mutations,installment-manage,installment-create}.ts`; `previstas/{service,recurring-service}.ts`; `cartoes/service.ts` (`CARD_OWNER_ONLY`); `privacidade/export.ts`; `mcp/assistant-write.ts`; `analise-ia/suggestions.ts`.
UI: `app/(app)/extrato/{edit-transaction-form,transaction-detail-drawer}.tsx`, `previstas/{planned-drawer,pay-drawer}.tsx`.
Testes: `tests/unit/sec021-ownership.test.ts`, `tests/unit/transacoes/unlinked-payer.test.ts`, `tests/unit/meta/member-reads.test.ts` (estático: `await`, `FOR SHARE`, MCP).
Integração (`tests/integration/`): `us-093b-so-meu-e-pagador-sem-conta` (matriz, concorrência), `sec021-so-meu-dono`, `us084-so-meu-controle`, `sec042-046-so-meu-reteste`, `sec047-050-reteste-rodada6`, `d-ges-55-admin-poderes-plenos`, `d-ges-59-pagador-ex-membro-imutavel`, `sec025-026-so-meu-regras`, `us-030-so-meu-por-padrao`, `sec029-032-exportacao`, `us076-lancar-direto`. E2E `US-093-*.feature`. Testes 9c/9d usam conexão crua (FOR UPDATE conta/cartão -> `members FOR UPDATE NOWAIT` tem de passar).
Âncoras: US-084, SDD-028 §11, SDD-034, D-GES-42..61 (a regra "só o dono" de D-GES-42 e "Admin troca titular" de D-GES-53 estão superadas).

## Pendências
- US-093b (TASK-098): aguarda validação do Gestor, revisão do TL (`ownership.ts`) e reteste da Segurança (SEC-059a, SEC-066b, SEC-067). UI do tutor/pagador coberta por E2E e verificada no navegador.
- Ciclo de segurança do "Só meu" encerrado (D-GES-61); novos achados só de mudanças futuras.
- Sem verificação no navegador: seletor "Quem pagou?" fixo para ex-membro e `pay-drawer` de quem só controla (D-GES-54/56/58/60); polimento do seletor vazio para Admin-ex não confirmado.
- Usuário: veto aos aceites; SEC-037 (reautenticação nas exclusões; recomendação: manter confirmação digitada + e-mail).
- Pergunta ao usuário: agregados enviados à IA (D-GES-29) INCLUEM "Só meu" de outros (consultas não filtram `isSharedExpense`; vai só rótulo de categoria e total). Recomendação: excluir "Só meu" alheio dos agregados (ver spec de IA/MCP).
- Divergência doc x código (código vence): SDD-028 §11.3 cita `assertControllerLimits` (inexistente; real: trava inline em `assertCanMakePersonal` e `assertPlannedControllerLimits`); pagador da baixa = quem realiza (DEV-135); Admin novo pagador de ex-membro revogado por D-GES-59.
