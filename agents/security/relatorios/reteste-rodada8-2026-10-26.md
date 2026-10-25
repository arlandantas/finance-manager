# Reteste da rodada 8 do "Só meu" (SEC-051 e resíduo DEV-132, D-GES-59/60) — 2026-10-26

**Autor:** Agente de Segurança da Informação · **Tipo:** reteste curto + busca de caminhos alternativos
**Código analisado:** `55c46b5`..`a0415d6` (US-084, SDD-028 §11.3 item 14, TASK-085, DEV-135), em `HEAD` `fe8a7a3`. Foco: `transacoes/ownership.ts` (`violatesGonePayerLock`, `assertCanMakePersonal`, `assertPlannedControllerLimits`), `transacoes/mutations.ts`, `previstas/service.ts` (`payPlannedExpense`, `undoPlannedPayment`), `previstas/recurring-service.ts`, `split/service.ts` (`registerSettlement`), `familia/removal.ts`, `mcp/assistant-write.ts`, `analise-ia/suggestions.ts` e as telas tocadas (`edit-transaction-form`, `planned-drawer`, `pay-drawer`).
**Ambiente:** Route Handlers reais em processo, pelo `call()` das suítes de integração (sessão por cookie, `withApi`, Origin, idempotência). Banco **descartável** `finance_sec_r8` no `db-test` (porta 5443), criado para este reteste e **apagado** no fim (`DROP DATABASE … WITH (FORCE)`). Sem `next dev`. Dados só de teste (`*@sec.test`, `*@exemplo.com`). Produção, banco DEV, Google, claude.ai e Anthropic não foram tocados. Não alterei código.

---

## 1. Resumo executivo

**Situação dos itens**

| Item | Situação | Prova |
| :-- | :-- | :-- |
| SEC-051 (Baixa) | **Corrigido** no `PATCH` (caminhos por fora ⇒ SEC-054/055) | Lucas (ex-membro) pagou R$ 300. Depois de o Admin dividir (200, pagador segue Lucas), trocar o pagador ⇒ **403** `PERSONAL_OWNER_ONLY` para Mariana→Mariana, Mariana→Carla, Carla→Carla, Carla→Bia e Bia→Bia. Compra no cartão com pagador ex-membro: Admin e Carla ⇒ 403. `payerMemberId: null` ⇒ 400. |
| Resíduo DEV-132 | **Fechado** no `PATCH` (reaparece pelo estorno da baixa ⇒ SEC-055) | Admin assumir o "Só meu" ⇒ **403**; assumir e dividir no mesmo pedido ⇒ **403**. Pela suíte, os dois pedidos (assumir, depois dividir) ⇒ o primeiro é 403 e o acerto não muda. |
| Previstas e séries | **Corrigido** | Responsável ex-membro é fixo para Admin e demais ("Só meu" e dividida, prevista e série). Admin trocar o responsável da série ⇒ 403. |
| Baixa de prevista de ex-membro (DEV-135) | **Conforme** | Dividida: Carla informar pagador Lucas ou Bia ⇒ **403**; omitir ⇒ **201**, pagadora Carla, responsável da prevista segue Lucas. "Só meu": Carla (não Admin) ⇒ 403; Admin com pagadora Carla ⇒ 403; Admin omitindo ⇒ 201, pagadora Mariana, "Só meu". |
| Criação já com ex-membro | **Recusada** | Lançamento dividido e parcelado com pagador Lucas ⇒ 422 `INVALID_REFERENCE`. Prevista e série com responsável Lucas ⇒ 400. |
| SEC-050 (observação na exportação) | **Não volta** | Teste de regressão da suíte: depois de dividir e das tentativas de troca (403), a exportação de Carla, Bia e Mariana traz `observacao: null`; o banco guarda a nota. |
| SEC-049 (quem voltou) | **Mantido** | Teste da suíte: Lucas volta, divide o item antigo e troca o pagador da dividida (200); o Admin segue sem poder pleno. |
| Poderes do Admin sobre ex-membro | **Mantidos** | Editar valor (200), trocar conta (200), dividir (200), excluir (200), restaurar (200, pagador segue Lucas). Estornar a baixa de prevista "Só meu" do ex-membro (200, prova A3); pela suíte, "Pagar com" segue. Desfazer a divisão (voltar a "Só meu") ⇒ 403 para Admin e Carla: só o pagador atual torna "Só meu" (SEC-025), então dividir o item de ex-membro não tem volta. |
| Membros ativos | **Inalterado** | Testes da suíte: na dividida de membro ativo, qualquer membro troca o pagador como antes; prevista dividida de ativo idem; IDOR (pagador de outra família) segue recusado. |
| IA, MCP, importação | **Sem caminho** | Sugestões da IA só gravam `categoryId`. O MCP (`lancar_despesa`) cria só "Só meu" com o próprio ator como pagador. Não existe rota de importação. |

**Regressões:** nenhuma. Suíte de integração completa **94 arquivos, 1106 passed, 1 skipped**, e unitário `sec021-ownership` **23/23**, no banco descartável.

**Achados novos**

| Severidade | Qtde | IDs |
| :-- | :-: | :-- |
| Crítica | 0 | — |
| Alta | 0 | — |
| Média | 0 | — |
| Baixa | 3 | SEC-054, SEC-055, SEC-056 |
| Informativa | 1 | SEC-057 |

**Top riscos**
1. **SEC-055 (Baixa):** o estorno da baixa reabre o que o D-GES-59 fechou. Na prevista **dividida** paga pelo ex-membro, um membro comum estorna e dá nova baixa na mesma conta: o crédito de R$ 225 do Lucas passa para a Carla, e o saldo da conta não muda. Na prevista **"Só meu"** paga pelo ex-membro, o Admin estorna, dá nova baixa (vira dele) e divide: **Mariana +R$ 225** por um pagamento que foi do Lucas. É o resíduo DEV-132 por outro caminho. A tela da prevista só mostra "paga por Carla/Mariana".
2. **SEC-054 (Baixa):** excluir e relançar. A mensagem do 403 sugere isso ("exclua e lance de novo"). Na dividida do ex-membro, **qualquer membro** (não só o Admin) exclui e relança em nome próprio: Carla +R$ 225, Lucas −R$ 75. A exclusão fica no histórico, mas o efeito é o mesmo da SEC-051.
3. **SEC-056 (Baixa):** o acerto com ex-membro credor aceita qualquer conta de destino da família. Carla registra que "pagou" R$ 75 ao Lucas mandando o dinheiro para a própria poupança (201). O Admin registra Bia→Lucas entre contas da Mariana e da Carla (201). O saldo do Lucas cai de R$ 225 para R$ 75 sem que nada saia da família.

### Perguntas ao usuário (via Gestor)
1. **SEC-054 + SEC-055 (recomendação conjunta).** O D-GES-59 deixa a troca de pagador de ex-membro só pelo caminho "excluir e relançar". Isso deve valer para **qualquer membro** e também para o **estorno da baixa seguido de nova baixa**? Recomendação: (a) na despesa **dividida** paga por ex-membro, excluir (e estornar a baixa que a gerou) fica só para o **Admin**, como já é no "Só meu"; (b) estornar a baixa de prevista paga por ex-membro só com aviso explícito ("o crédito do ex-membro será removido do acerto") e com revisão nomeando quem estornou; (c) relançar fica livre, mas a exclusão aparece no acerto/histórico do período. Alternativa de aceite: registrar o risco, como o D-GES-58 fez com o DEV-132, porque fica no histórico com o nome de quem agiu.
2. **SEC-056.** No acerto com **ex-membro** como credor (ou devedor), a conta do lado dele deve ser exigida como "fora da família" (registro sem conta de destino, só a saída) ou ficar restrita ao Admin? Recomendação: só o Admin registra acerto envolvendo ex-membro, e o lado do ex-membro não usa conta da família (o dinheiro sai de fato). Na mesma linha, vale o TL avaliar se a conta de destino de qualquer acerto deve ser do credor.
3. **SEC-057.** A série do membro removido continua com ele como responsável e, desde o D-GES-59, ninguém pode trocar. Ao editar a série, as ocorrências que a remoção passou ao Admin voltam ao ex-membro. Corrigir na remoção (reatribuir também a série) ou só registrar?

---

## 2. Achados

### SEC-054 — Excluir e relançar move o crédito do ex-membro, e qualquer membro pode
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. Exige agir sobre um item de ex-membro, que não está lá para contestar. Fica a revisão `DELETE` com o nome de quem excluiu. |
| Local | `src/modules/transacoes/ownership.ts:219-224` (`assertCanWriteTransaction` libera qualquer membro na despesa dividida: `if (!isPersonalExpense(row)) return;`). `mutations.ts` `deleteTransaction` não olha o pagador. `ownership.ts` `GONE_PAYER_LOCKED_MESSAGE` ("Para outro pagador, exclua e lance de novo"). |
| Descrição e impacto | O D-GES-59 travou o pagador, mas a saída oficial é excluir e relançar. Na dividida paga pelo ex-membro, isso não exige o Admin: qualquer membro ativo exclui e relança com ele mesmo como pagador, e o crédito do ex-membro vira dele. O ex-membro passa a dever a própria cota. O Admin faz o mesmo com o "Só meu" (excluir é poder dele, D-GES-59) e relança dividido, o que dá o resultado do DEV-132. |
| Como explorar (prova local) | Lucas pagou R$ 300 dividido na conta da Carla e saiu. Acerto 2026-10: Lucas +22.500, demais −7.500.<br>1. Carla `POST /transactions/:id/delete` ⇒ **200**.<br>2. Carla `POST /transactions {type: EXPENSE, accountId: contaCarla, amountInCents: 30000, occurredOn: 2026-10-02, isSharedExpense: true}` ⇒ **201**. Acerto: **Carla +22.500**, Lucas −7.500, Mariana e Bia −7.500.<br>Variação (Admin, "Só meu" do Lucas): excluir ⇒ 200, relançar dividido em nome próprio ⇒ 201. Acerto: **Mariana +22.500**, Lucas −7.500. |
| Correção sugerida | Ver pergunta 1: na despesa dividida paga por ex-membro sem retorno, excluir fica só para o Admin, e a exclusão aparece no acerto do período. Rever a mensagem do 403, que hoje ensina o contorno. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | SEC-051, DEV-132, D-GES-58, D-GES-59, US-084 |

### SEC-055 — Estornar a baixa e dar nova baixa move o crédito do ex-membro (resíduo DEV-132 pela prevista)
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. Mais discreto que a SEC-054: a conta não muda de saldo (estorno e nova baixa na mesma conta) e a prevista aparece como paga pelo novo pagador. A revisão `UNDO` fica na despesa estornada, com o nome de quem estornou. |
| Local | `src/modules/previstas/service.ts` `undoPlannedPayment` (≈ linha 455-500): checa `assertCanWritePlanned` e `assertCanWriteTransaction`, que liberam qualquer membro na dividida e o Admin no "Só meu" de ex-membro (D-GES-52). Depois, `payPlannedExpense` (DEV-135) põe o ator como pagador. |
| Descrição e impacto | O DEV-135 está certo para a baixa **nova**. Mas se a prevista já foi paga pelo ex-membro antes de sair, o estorno devolve-a a `PREVISTO`, e a nova baixa é tratada como pagamento novo em nome de quem a realiza. Na dividida, qualquer membro faz isso e fica com o crédito. No "Só meu", o Admin estorna, dá a baixa (vira "Só meu" dele) e divide a despesa gerada, que agora é dele: cria crédito para si com o dinheiro do ex-membro, exatamente o que o D-GES-59 queria fechar. |
| Como explorar (prova local) | **Dividida:** prevista R$ 300 do Lucas, paga por ele (201) na conta da Carla; Lucas sai. Acerto: Lucas +22.500. Carla `POST /planned-expenses/:id/undo-payment` ⇒ **200**; Carla `POST …/pay {accountId: contaCarla}` ⇒ **201**, pagadora Carla. Acerto: **Carla +22.500**, Lucas −7.500. Histórico da despesa original: `UNDO` por Carla.<br>**"Só meu":** prevista R$ 300 "Só meu" do Lucas, paga por ele; Lucas sai. Acerto: todos 0. Carla estornar ⇒ 403. Mariana (Admin) estornar ⇒ **200**; nova baixa ⇒ **201**, pagadora Mariana; `PATCH {isSharedExpense: true}` na despesa gerada ⇒ **200**. Acerto: **Mariana +22.500**, Lucas, Carla e Bia −7.500. |
| Correção sugerida | Ver pergunta 1: estornar a baixa cuja despesa foi paga por ex-membro sem retorno só pelo Admin e com aviso; ou a nova baixa de prevista que **já foi paga** por ex-membro mantém o ex-membro como pagador (não é pagamento novo). Cobrir com teste de integração os dois casos acima. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | DEV-135, DEV-132, SEC-051, D-GES-52, D-GES-59, SEC-044d |

### SEC-056 — Acerto com ex-membro credor aceita qualquer conta de destino da família
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Baixa. O devedor (ou o Admin) apaga o crédito do ex-membro sem que dinheiro saia da família. Fica um registro de acerto com o nome de quem registrou e uma transferência entre contas da família. |
| Local | `src/modules/split/service.ts:425-490` (`registerSettlement`): valida que `fromMemberId`/`toMemberId` são da família (inclui removidos) e que as contas existem, mas não que a conta de destino seja do credor, nem trata o credor ex-membro. |
| Descrição e impacto | O ex-membro não tem mais conta ativa na família (na remoção as contas são arquivadas ou passadas a outro). Mesmo assim, o acerto "pagar ao Lucas" é aceito com destino em qualquer conta, inclusive do próprio devedor. A dívida some do painel e o dinheiro continua com quem devia. Para credor ativo, o mesmo vale, mas ele vê e contesta; o ex-membro, não. |
| Como explorar (prova local) | Lucas pagou R$ 300 dividido e saiu. Sugestões: Mariana, Carla e Bia devem R$ 75 ao Lucas.<br>1. Carla `POST /settlements {period: 2026-10, from: Carla, to: Lucas, amountInCents: 7500, fromAccountId: contaCarla, toAccountId: poupançaCarla}` ⇒ **201**.<br>2. Mariana (Admin) `POST /settlements {from: Bia, to: Lucas, 7500, fromAccountId: contaMariana, toAccountId: poupançaCarla}` ⇒ **201**.<br>3. Bia (não envolvida, não Admin) registrar Mariana→Lucas ⇒ 403 (correto).<br>Painel depois: Lucas `balanceInCents` 7.500 (era 22.500); Carla e Bia 0. |
| Correção sugerida | Ver pergunta 2. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | SDD-002 §3, US-011, NEED-020 (RN-020.1), SEC-051 |

### SEC-057 — Série do membro removido fica com ele e editar a série desfaz a reatribuição da remoção
| Campo | Conteúdo |
| :-- | :-- |
| Severidade | Informativa (coerência; sem ganho de crédito). |
| Local | `src/modules/familia/removal.ts:222-293` (reatribui só `plannedExpense` em `PREVISTO`, não a série `recurringExpense`). `src/modules/previstas/recurring-service.ts` `updateSeries` (reaplica `responsibleMemberId` da série às ocorrências afetadas) e a trava D-GES-59 no responsável. |
| Descrição e impacto | Na remoção pela API, as ocorrências em aberto passam ao Admin (US-035), mas a série segue com o ex-membro. Desde o D-GES-59, ninguém troca o responsável da série (403). Se o Admin editar só o valor, as ocorrências futuras voltam a ter o ex-membro como responsável. Na série "Só meu", isso devolve as previstas ao modo "somente leitura, exceto Admin". O único jeito de corrigir é encerrar a série e criar outra. |
| Como explorar (prova local) | Lucas cria série dividida (12 ocorrências, responsável Lucas). Mariana remove o Lucas pela API (200): ocorrências = Mariana ×12, série = Lucas. Mariana `PATCH /recurring-expenses/:id {amountInCents: 12000}` ⇒ 200: ocorrências = **Lucas ×12**. Mariana `PATCH {responsibleMemberId: Mariana}` ⇒ 403. |
| Correção sugerida | Ver pergunta 3: na remoção, reatribuir também as séries ativas ao mesmo `plannedTo`. TL ⇒ Dev. |
| Status | Em análise (usuário) |
| Rastreio | US-035, D-GES-59, SDD-028 §11.3 item 14 |

---

## 3. Outras verificações (sem achado)

| Tema | Resultado |
| :-- | :-- |
| Trava no estado atual | `violatesGonePayerLock` compara o pagador **atual** com o pedido, para qualquer ator, sempre que o pagador atual é ex-membro sem retorno (`ownerStanding.ownerRemoved`). Não depende do pedido que divide. Vale para lançamento, compra no cartão e parcela (mesmo `PATCH`), prevista e série. |
| Tipo do lançamento | O `PATCH` não muda `kind`, então não há como tirar o item de "despesa" para escapar da trava. |
| Parcelado | `installment-plans/:id` só tem GET, delete e restore; a parcela é editada pelo `PATCH` do lançamento (403). |
| Baixa em conta de outro | Na baixa da dividida, Carla usa a conta da Mariana (201) e fica com o crédito; o Admin dá baixa no "Só meu" com a conta da Carla. É a regra geral de lançamento (qualquer membro lança em qualquer conta ativa da família), não algo novo desta rodada. |
| Sugestões da IA | `acceptSuggestion` grava só `categoryId` (com versão e categoria atual conferidas). |
| MCP | `lancar_despesa` monta `CreateExpenseSchema` com `isSharedExpense: false` e sem `payerMemberId`: o pagador é sempre o ator. |
| Importação | Não há rota de importação de lançamentos. |
| Remoção | Não reatribui pagador de lançamentos; reatribui contas, cartões e previstas em aberto (SEC-052, aceito). |
| UI | Lida no código: `edit-transaction-form` (`lockGonePayer = kind === "EXPENSE" && ownerGone`, com `effectiveOwner` tratando quem voltou), `planned-drawer` (`lockGoneResponsible`) e `pay-drawer` (envia o próprio membro quando o responsável é ex-membro). **Não verificada no navegador.** |

## 4. Método e limites
- Provas próprias num arquivo de teste e numa configuração de vitest **só no scratchpad**, não versionados: 10 cenários (S1..S4, A1..A6).
- Suíte de integração completa no banco descartável `finance_sec_r8`: **94 arquivos, 1106 passed, 1 skipped**. Unitário `tests/unit/sec021-ownership.test.ts`: **23/23**.
- Ex-membro simulado por `removedAt` no banco (como no DEV-133), exceto no A6 (remoção pela API).
- **Não verificado:** a UI no navegador; o efeito em família com motor `STORED` x legado nos cenários A1..A5 (a família de teste é a padrão da fábrica); acerto em mês já acertado (`confirmSettledPeriod`), que o próprio ator envia.
- O banco `finance_sec_r8` foi apagado no fim. Sem `next dev`. `git status` limpo antes do commit deste relatório e do status.
