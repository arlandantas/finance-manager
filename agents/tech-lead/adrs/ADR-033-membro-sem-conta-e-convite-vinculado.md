# ADR-033: Membro sem conta (`Member.userId` anulável) e convite vinculado ao membro

## Status
**Proposto** (Tech Lead, 2026-10-26; spike TL-U1 + TL-U2 + parecer TL-U3, sem código). Emenda o [ADR-019](ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md) §1-§3 (o vínculo pode existir sem usuário) e o ADR-012 §2. Depende de: **decisões do usuário Q-TL-U1..U4 (§9)** e **revisão do Agente de Segurança (§7)** antes de virar SDD. Rastreabilidade: [NEED-028](../../stakeholder/needs/NEED-028-membro-sem-conta-ativa-e-convite-posterior.md) (Q-U15..U17) · [US-092](../../product-owner/backlog/stories/US-092-cadastrar-membro-sem-conta.md), [US-093](../../product-owner/backlog/stories/US-093-atribuir-contas-e-lancamentos-ao-membro-sem-conta.md), [US-094](../../product-owner/backlog/stories/US-094-convidar-membro-cadastrado-e-assumir-historico.md), [US-095](../../product-owner/backlog/stories/US-095-ciclo-de-vida-do-membro-sem-conta.md) · [FLUXO-020](../../product-owner/flows/FLUXO-020-membro-sem-conta-e-convite-posterior.md) · D-PO-103 · pedidos TL-U1/U2/U3 em [pedidos-ao-tech-lead-uso-real.md](../../product-owner/backlog/pedidos-ao-tech-lead-uso-real.md).

Evidência lida em 2026-10-26: `prisma/schema.prisma` (`User`, `Member`, `Invitation`, `FamilyEvent`), migração `20261005120000_r21_ex_membro` (índices parciais `members_user_active_uq`, `members_family_user_active_uq`), `src/modules/transacoes/ownership.ts` (`ownerStanding`, `assertCanMakePersonal`, `assertPersonalForSelf`), `familia/invitations/service.ts` (`acceptInvitation`), `familia/{manage,removal}.ts`, `privacidade/{delete-account,delete-family,export}.ts`, `split/{inputs,repo,schemas}.ts`.

## Contexto
Hoje `Member.userId` é `NOT NULL` e **o nome do membro não existe em `Member`**: é lido de `User.name` (ou da parte local do e-mail) em ~45 pontos (`m.user.name ?? localPart(m.user.email)` em `contas/service`, `previstas/service`, `privacidade/export`, `familia/manage`, `ownership.deny`, repos). Só `acceptInvitation` cria `Member` por convite (SEC-004). A NEED-028 pede um membro que exista **antes** (ou **sem nunca**) ter login, com o mesmo mecanismo para adulto e criança (Q-U15), que participa do acerto (Q-U16), cadastrado e convidado só pelo Administrador (Q-U17), e que, ao aceitar um convite, **assume** o mesmo vínculo sem duplicar nada.

## 1. Opções avaliadas
| Critério | **A. `Member.userId` anulável** (escolhida) | B. Entidade separada (`Dependent`/`Person`) | C. Usuário "fantasma" (`User` sem login) |
| :-- | :-- | :-- | :-- |
| FKs do ledger (pagador, autor, titular, responsável, `transaction_splits`) | Inalteradas: já apontam para `(familyId, memberId)` | Todas viram polimórficas ou duplicadas (2 colunas por papel) | Inalteradas |
| "Assumir" no aceite | 1 `UPDATE members SET userId` (nenhuma linha do ledger muda; `version`s idênticas) | Reescrever FKs em transações, splits, contas, cartões, previstas, revisões (`forbid_mutation` bloqueia revisões) | Ou fundir usuários (reescrever `members.userId` do fantasma para o real = igual a A, com lixo) ou "transformar" o fantasma no usuário real (trocar `User.email`: risco de tomada de conta pelo vínculo por e-mail do Auth.js, `ALLOWED_SIGNUP_EMAILS`, idempotência por `userId`) |
| Acerto (STORED/LEGACY) | Nada muda: o membro é um `Member` como os outros | Motores e `explainByRules` passam a ler 2 fontes | Nada muda |
| LGPD | E-mail opcional numa coluna própria, apagável; sem linha em `users` | Idem | Linha em `users` com PII/e-mail fictício: entra em exportação, exclusão, `deletedAt`, retenção; confunde "conta" com "pessoa" |
| Sessão/MCP/consentimento | Impossível por construção (`findActiveMembership(userId)` nunca acha `NULL`) | Impossível | Precisa de trava extra para o fantasma nunca autenticar (`findSessionUser`, login de teste) |
| Custo de código | ~45 leituras de nome passam a `memberDisplayName` (o TypeScript aponta todas: `user` vira `User \| null`) + comparações de "mesma pessoa" | Alto (todas as consultas e DTOs de membro) | Baixo no início, alto em exceções espalhadas |
| Veredito | **Aceita** | Descartada (custo e quebra da propriedade "nada muda no aceite") | Descartada (risco de identidade e LGPD) |

## 2. Decisão (modelo)
1. **`members.userId` passa a `NULL`-ável.** "Membro sem conta" (`unlinked`) ⇔ `userId IS NULL`. **Não é ex-membro**: ativo continua sendo `removedAt IS NULL`; sem conta é um estado ortogonal.
2. **Colunas novas em `members`:** `name text NULL` (nome na família, 2..60, aparado), `pendingEmail text NULL` (e-mail opcional do cadastro, normalizado, só para o convite), `linkedAt timestamptz NULL` (quando o cadastro foi assumido), `createdByMemberId uuid NULL`.
3. **Nome exibido = função única** `memberDisplayName(m) = m.name ?? m.user?.name ?? localPart(m.user.email)`. `Member.name` permanece depois do aceite (US-094: "nada é renomeado"); para membros que entraram por convite comum continua `NULL` (nada muda para eles). Toda leitura de nome passa por essa função (substitui as cópias de `firstName`/`displayName`).
4. **Constraints (SQL cru):**
   - `members_unlinked_has_name_chk`: `"userId" IS NOT NULL OR name IS NOT NULL`.
   - `members_unlinked_is_member_chk`: `"userId" IS NOT NULL OR role = 'MEMBER'` (nunca Administrador sem conta).
   - `members_pending_email_chk`: `"pendingEmail" IS NULL OR ("userId" IS NULL AND "removedAt" IS NULL)` (e-mail só vive enquanto ativo e sem conta).
   - `members_family_pending_email_uq`: `UNIQUE ("familyId", "pendingEmail") WHERE "pendingEmail" IS NOT NULL`.
   - Índices parciais existentes por `userId` ficam: em Postgres `NULL` não colide, então N membros sem conta convivem e "1 vínculo ativo por usuário" segue valendo para quem tem conta.
5. **Gatilho `members_link_guard` (BEFORE UPDATE):** `userId` só muda de `NULL` para não nulo (nunca troca de pessoa nem volta a `NULL`); só se `OLD.removedAt IS NULL`; na mesma linha `pendingEmail` deve virar `NULL` e `linkedAt` ser preenchido; `joinedAt`, `familyId` e `id` imutáveis (o acerto EQUAL usa `joinedOn`; o aceite não pode mexer nele).
6. **Unicidade de nome e e-mail entre membros** (inclui comparação com `User.name`/`User.email` de quem tem conta, que índice não alcança): checada no serviço **sob `lockFamilyAdmins`** (advisory lock da família, já usado por remoção/papéis). Nome: único entre ativos sem diferenciar caixa/acentos (`NAME_TAKEN`). E-mail: recusado se é de membro ativo com conta (`DUPLICATE_MEMBER`) ou de outro cadastro (`EMAIL_BELONGS_TO_OTHER_MEMBER`).
7. **`Invitation.memberId uuid NULL`** com FK composta `(familyId, memberId) → members(familyId, id)` `ON DELETE RESTRICT` e índice único parcial `invitations(memberId) WHERE status = 'PENDING' AND "memberId" IS NOT NULL`. Convite com `memberId` = "convite vinculado"; sem = convite comum (inalterado).
8. **`FamilyEventType` ganha** `MEMBER_CREATED` (cadastro sem acesso), `MEMBER_UPDATED` (nome/e-mail) e `MEMBER_LINKED` (assumiu o cadastro). **`changes` nunca contém e-mail** (só `emailChanged: true`): `family_events` é append-only e não poderia ser anonimizado depois (lição do `INVITATION_RESENT`, SEC-017c).

### 2.1 Migração segura (expand/contract, sem reescrita de tabela)
| Passo | SQL | Risco |
| :-- | :-- | :-- |
| 1 | `ALTER TABLE members ALTER COLUMN "userId" DROP NOT NULL` | Só metadado; nenhuma linha muda |
| 2 | `ADD COLUMN name/pendingEmail/linkedAt/createdByMemberId` (nulos, sem default) | Instantâneo |
| 3 | CHECKs com `NOT VALID` + `VALIDATE CONSTRAINT` | Todas as linhas atuais têm `userId` ⇒ passam |
| 4 | Gatilho `members_link_guard` (`search_path = pg_catalog, public`, como SEC-036) | Não afeta updates atuais (`removedAt`, `role`, `assistantReviewedAt`) |
| 5 | `invitations.memberId` + FK composta + índice parcial; `ALTER TYPE "FamilyEventType" ADD VALUE` (fora de transação, migração própria) | Instantâneo |
| 6 | `FAMILY_TABLES_DELETE_ORDER`: `invitations` antes de `members` (conferir; o teste de `information_schema` já reprova tabela nova sem entrada) | — |

O código antigo nunca grava `NULL`, então o schema pode subir antes do código. **Ponto sem volta:** após o primeiro membro sem conta em produção, voltar a `NOT NULL` exige removê-lo/vinculá-lo; até lá, `SET NOT NULL` desfaz. Nenhuma migração de dados é necessária (não há linhas a converter).

## 3. Efeitos por domínio
| Domínio | Efeito | Regra |
| :-- | :-- | :-- |
| Sessão / `withApi` / gate | Nenhum caminho resolve membro sem conta (`findActiveMembership(userId)` com `userId` de sessão) | Membro sem conta nunca é `ctx.memberId`; nunca é ator de `FamilyEvent`, revisão, consentimento, MCP |
| **"Mesma pessoa" (SEC-049)** | **Bug latente a corrigir junto:** `ownerStanding` faz `findFirst({ userId: owner.userId, removedAt: null })`; com `owner.userId = NULL` o Prisma traduz para `IS NULL` e qualquer outro cadastro ativo seria tomado como "voltou" (ex-membro sem conta perderia a trava do pagador e o Admin-ex) | Toda comparação de pessoa exige `userId != null` (`ownerStanding`, `memberRefsWithReturn`, exportação, remoção). Teste de regressão obrigatório (§8) |
| Acerto (motores) | **Nenhuma mudança** em `split/**`: o membro sem conta é `Member` com `joinedAt`/`removedAt` | EQUAL passa a incluí-lo a partir de `joinedOn` do cadastro (como um aceite hoje); PROPORTIONAL fica `stale` até o Admin redefinir (aceita 0% por membro: `bpsSchema.min(0)`). Aceite não muda `id`/`joinedAt` ⇒ acerto idêntico. Ver Q-TL-U1 |
| `registerSettlement` | Inalterado: devedor, credor ou ADMIN. Com membro sem conta numa ponta, só a outra ponta ou o Admin registra | A2 do acerto |
| Papéis / travas | `LAST_ADMIN` inalterado (sem conta nunca é ADMIN). `PATCH role` para sem conta ⇒ 422 `UNLINKED_MEMBER_ROLE` | §2.4 |
| Contagens de "único membro" | `ONLY_MEMBER` (remoção/saída), `SOLE_MEMBER` (excluir conta), `HAS_OTHER_MEMBERS` (excluir família) passam a contar **só membros ativos com conta** | Senão a família ficaria só com cadastros que ninguém acessa (ou não poderia ser excluída por causa de uma criança) |
| Remoção (US-095, mas o mínimo vai na 092) | Mesmo `removeMember(REMOVED)` com revisão de pendências; sem `endUserSessions`/`revokeMemberGrants` (nada a encerrar); apaga `pendingEmail`; cancela convite vinculado pendente. `LEFT` impossível (sem sessão) | Ex-membro sem conta = ex-membro comum (Admin-ex, pagador imutável, D-GES-59) |
| Reconvite de ex-membro sem conta | Não reativa o vínculo (ADR-019 §3); convite novo = membro novo | US-095 |
| Seletores (pagador, responsável, titular, divisão, filtros) | Listam o sem conta como ativo, com `MemberRef.unlinked: true` (selo "Sem acesso ao app") | `MemberRef` nunca traz `pendingEmail` |
| `GET /family` | `pendingEmail` só para ADMIN; demais veem nome e selo | Dado pessoal de terceiro |
| Exportação (LGPD) | Família completa do solicitante lista o membro por nome; **nunca** `pendingEmail` (regra "nunca e-mail de terceiros"); "Só meu" do sem conta é "alheio" para todos (não sai, SEC-029) | Sem conta não tem exportação própria até assumir |
| Excluir minha conta | Cadastros sem conta ficam com a família (são dados da família) | — |
| Excluir a família | Apaga os cadastros com o resto; tela de confirmação lista quantos cadastros sem conta serão apagados | §3 contagens |
| Anonimização | Remover sem conta: `pendingEmail = NULL`; `name` fica (histórico, como ex-membro, U5). E-mail em `invitations` some no expurgo de 90 d (já existe); convites encerrados do membro removido podem ter o e-mail trocado por `deleted+<memberId>@invalid.local` na remoção (decidir no SDD; Segurança opina) | Titular sem conta não tem como pedir os próprios dados: só via Administrador/suporte (limitação a registrar em privacidade-lgpd) |
| IA / MCP | Agregados sem nomes (ADR-029): sem efeito. Ferramentas MCP que listam membros não expõem `pendingEmail` | — |
| Tetos de convite | Cadastrar não conta; convidar (vinculado) conta como convite | US-095 |

## 4. Fluxo de convite vinculado e aceite (TL-U2)
**Criar** `POST /api/v1/members/{id}/invitations` (só ADMIN; `Idempotency-Key`; corpo `.strict()` `{ email }`), dentro de `lockFamilyAdmins(needAdmin)`:
1. Membro ativo, sem conta, da família (senão 404 uniforme).
2. `pendingEmail` preenchido e diferente ⇒ 422 `INVITATION_EMAIL_MISMATCH` ("O e-mail do convite deve ser o do cadastro de Ana"). Vazio ⇒ grava `pendingEmail = email` na mesma transação (regra 6 de unicidade).
3. E-mail de membro ativo com conta ⇒ 409 `DUPLICATE_MEMBER`; de outro cadastro ⇒ 409 `EMAIL_BELONGS_TO_OTHER_MEMBER`; pendente igual ⇒ 409 `DUPLICATE_INVITATION` (índices existentes + o novo por `memberId`).
4. Papel sempre MEMBER; validade 7 d, tetos, reenvio, copiar link e recusa como hoje (US-003/039, SEC-040).
5. **Convite comum** (`POST /invitations`) para um e-mail que é `pendingEmail` de cadastro ⇒ 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER` (orienta "Convide pelo cadastro de Ana"); evita o 2º membro.
6. Editar/remover `pendingEmail` com convite vinculado pendente ⇒ 409 `MEMBER_HAS_PENDING_INVITATION` (cancele antes). Invariante: convite vinculado pendente ⇒ `invitation.email = member.pendingEmail`.

**Aceitar** (mesmo `POST /me/invitations/{id}/accept`, SEC-004 intacto): mesmas pré-condições (`emailVerified`; convite de outro e-mail = 404 uniforme; token divergente 422; vencido 410; já tem família 409 `ALREADY_IN_FAMILY` com convite PENDING). Se `inv.memberId`:
1. Advisory lock da família (mesma chave de `lockFamilyAdmins`, sem exigir ator, pois o convidado ainda não é membro) ⇒ serializa com remoção, edição e cancelamento do cadastro e com excluir a família.
2. `claim` condicional do convite (concorrência no mesmo convite: 1 vence).
3. `UPDATE members SET "userId" = $u, "linkedAt" = now(), "pendingEmail" = NULL WHERE id = $m AND "familyId" = $f AND "userId" IS NULL AND "removedAt" IS NULL`: 0 linhas ⇒ rollback e 409 `MEMBER_NO_LONGER_AVAILABLE`; violação de `members_user_active_uq` (aceite simultâneo em outra família) ⇒ 409 `ALREADY_IN_FAMILY`.
4. `FamilyEvent MEMBER_LINKED` (ator = o próprio membro já vinculado; `changes: { invitationId }`, sem e-mail).
5. **Nada mais é escrito**: nenhuma linha de ledger, conta, cartão, prevista, série, split ou revisão ⇒ totais, saldos, acerto e `version`s idênticos por construção.

| Caso | Comportamento |
| :-- | :-- |
| Idempotência | `Idempotency-Key` de `withApi` como hoje; repetição após sucesso devolve a resposta gravada; sem chave, a 2ª chamada cai em `INVITATION_NOT_PENDING` sem efeito |
| Corrida aceite × remoção do cadastro | Lock da família: remoção primeiro cancela o convite (aceite ⇒ 409 `INVITATION_NOT_PENDING`); aceite primeiro ⇒ remoção trata membro com conta (encerra sessões) |
| Corrida aceite × edição de e-mail/cancelamento | Lock da família; edição exige cancelar (passo 6) |
| E-mail que já foi ex-membro desta família | **Permitido.** O usuário U assume o cadastro (vínculo novo); o vínculo antigo continua removido e **não é reativado nem fundido**. Pela regra vigente "dono = pessoa" (SEC-049) U recupera o controle dos itens do vínculo antigo; no acerto os dois vínculos seguem separados (SEC-053, aceito). A tela de aceite avisa "Você já foi membro desta família" |
| E-mail diferente do cadastrado | Recusado na criação (422); no aceite vale o 404 uniforme (convite de outro e-mail). Correção: cancelar, editar o e-mail, reconvidar |
| Expiração / recusa / cancelamento | Convite vira EXPIRED/DECLINED/CANCELED; membro e histórico intactos; selo volta a "Sem acesso ao app"; reconvite liberado |
| Prévia em `/convites` | Para o convidado (ainda não membro) só: nome da família, nome do cadastro e **contagens** (contas, cartões, lançamentos, previstas). Sem valores nem descrições antes do aceite |

## 5. Matriz de controle do "Só meu" com dono sem conta (TL-U3)
Dono = pagador/responsável sem conta, **ativo**. "Tutor" = Administrador ativo (Q-U17: só ele cadastra e convida). Lanç = autor; DC = titular da conta/cartão (lido na hora). Regras anti-captura atuais seguem para todos os demais casos.

| Ação | Lanç | DC (com conta) | Admin (tutor) | Outro membro | Código |
| :-- | :-: | :-: | :-: | :-: | :-- |
| Ver | sim | sim | sim | sim | — |
| Editar valor/data/descrição/categoria/observação; excluir; restaurar; estornar/dar baixa (pagador original mantido) | sim | sim | sim | 403 | `PERSONAL_OWNER_ONLY` |
| Mudar divisão, conta, "Pagar com" do "Só meu" | 403 | 403 | sim (poder pleno, como Admin-ex) | 403 | idem |
| **Criar** "Só meu" em nome do sem conta (despesa, prevista, série) | só se Admin | — | sim (exceção explícita à SEC-026c) | 403 | `PERSONAL_ON_BEHALF_FORBIDDEN` |
| **Tornar "Só meu"** uma dividida paga pelo sem conta (captura) | 403 | 403 | **403** (rec.; Q-TL-U2) | 403 | `PERSONAL_OWNER_ONLY` |
| Definir/trocar pagador ou responsável **para ou de** um sem conta em item existente | sim | 403 | sim | 403 `UNLINKED_PAYER_FORBIDDEN` | novo |
| Criar dividida/receita com pagador sem conta | qualquer membro (vira Lanç) | — | sim | — | autor registrado |
| Titular de conta/cartão = sem conta (criar) | Admin | — | sim | 422 `UNLINKED_OWNER_ADMIN_ONLY` | novo |
| Trocar titular de cartão cujo titular é sem conta | — | — | sim (exceção ao `CARD_OWNER_ONLY`, grava `CARD_OWNER_CHANGED`) | 403 | — |
| Registrar acerto com o sem conta numa ponta | a outra ponta | — | sim | 403 | A2 |

Após o aceite: o tutor perde esses poderes e valem as regras normais (o próprio membro é o Dono), como no retorno da SEC-049. Após a remoção do sem conta: regras de ex-membro (Admin-ex, pagador imutável). Implementação: um único predicado `ownerStanding` com três estados (`ownerIsActor`, `ownerRemoved`, **`ownerUnlinked`**), lido na transação e filtrado por `familyId`, consumido por `assertCanWriteTransaction`, `assertCanMakePersonal`, `assertPersonalForSelf`, `plannedWriteDecision`, `assertPlannedControllerLimits`, `cartoes/service` (titular). Rótulos de 403 listam os nomes de quem pode (incluir "um Administrador").

## 6. Fatiamento e estimativas (TL)
| História | PO | TL | Fatias | Conteúdo |
| :-- | :-: | :-: | :-- | :-- |
| US-092 | 3 | **5** | 092a (3) modelo; 092b (2) cadastro | a: migração §2.1, gatilho, `memberDisplayName` nos ~45 pontos, `MemberRef.unlinked`, contagens `ONLY_MEMBER`/`SOLE_MEMBER`/`HAS_OTHER_MEMBERS`, correção `ownerStanding` com `userId` nulo, remoção mínima segura (sem sessões, apaga e-mail). b: `POST /members` (ADMIN), drawer, selo, `MEMBER_CREATED`, unicidade nome/e-mail |
| US-093 | 5 | **8** | 093a (3) seletores/titular/acerto; 093b (5) "Só meu" | a: seletores, filtros, titular conta/cartão (ADMIN), acerto (sem mudar motor). b: matriz §5 (`ownerUnlinked`), exceção SEC-026c, `UNLINKED_PAYER_FORBIDDEN`, troca de titular; **revisão da Segurança** |
| US-094 | 5 | **8** | 094a (3) convite vinculado; 094b (5) aceite | a: `Invitation.memberId`, rotas, guardas §4 1-6. b: aceite que assume, prévia com contagens, `MEMBER_LINKED`, ex-membro, propriedade de reconciliação |
| US-095 | 2 | **2** | — | editar nome/e-mail (`MEMBER_UPDATED`, `MEMBER_HAS_PENDING_INVITATION`), remover e-mail, polimento da remoção (diálogo sem "sessões") |
| **Total** | 15 | **23** | ordem 092a ➔ 092b ➔ 093a ➔ 093b ➔ 094a ➔ 094b ➔ 095 | 092a não tem valor visível sozinha, mas pode ir à produção antes (expand) |

Linha de corte: a US-095 (2) pode sair; a 094 inteira pode ir para depois (092+093 já entregam valor sem convite). 093b não pode ser cortada sem 093a perder sentido: sem ela o sem conta só aparece em dividida.

## 7. Riscos e o que a Segurança deve validar
| # | Risco / ponto de auditoria | Mitigação proposta |
| :-- | :-- | :-- |
| R1 | **IDOR/BOLA**: `memberId` de outra família em `/members/{id}/invitations`, no pagador, titular, responsável e divisão | FK composta + `findMember` com `familyId`; 404/422 uniformes; teste canário (ADR-018 §2) estendido às rotas novas |
| R2 | **Comparação de pessoa com `NULL`** (`userId: null` vira `IS NULL` no Prisma) em `ownerStanding`/`memberRefsWithReturn`/exportação | Correção na 092a + teste: ex-membro sem conta com outro cadastro ativo continua "ex-membro" |
| R3 | **Crédito em nome de quem não contesta** (SEC-048/DEV-132): trocar pagador para/de sem conta; Admin devedor do sem conta | Só Lanç ou Admin; captura proibida (Q-TL-U2); histórico com ator real; Segurança avalia se o Admin-tutor precisa de aviso |
| R4 | **Captura de cadastro no convite**: Admin vincula e-mail errado; convidado assume histórico e "Só meu" do cadastro | Só ADMIN convida; e-mail = cadastro; aceite explícito com prévia; `MEMBER_LINKED` na trilha; nenhum caminho fora de `acceptInvitation` grava `userId` (gatilho + teste "SEC-004" estendido) |
| R5 | **Vazamento antes do aceite** na prévia de `/convites` | Só contagens e nomes; só para o dono do e-mail verificado do convite |
| R6 | **PII de terceiro** (`pendingEmail`): aparece para não-Admin, em exportação, eventos, logs | DTO por papel; nunca em `changes`, `MemberRef`, MCP; apagado na remoção e no aceite |
| R7 | **Exceção à SEC-026c** (Admin cria "Só meu" em nome do sem conta) reabre caminho de captura | Vale só com dono `ownerUnlinked` lido na transação; testes negativos para dono com conta |
| R8 | Corridas aceite × remoção/edição/exclusão da família; dois aceites | Lock da família + UPDATE condicional + índice parcial; testes concorrentes |
| R9 | EQUAL muda a divisão de despesas novas ao cadastrar uma criança | Informativo na UI do cadastro + Q-TL-U1 |
| R10 | Gatilho `members_link_guard` com `search_path` | Mesmo padrão da SEC-036 |

## 8. Plano de testes (guia para o SDD)
1. **Migração:** dados atuais intactos; CHECKs recusam sem conta sem nome, ADMIN sem conta, e-mail em membro com conta; gatilho recusa `userId` não nulo ➔ outro, ➔ `NULL`, vínculo de removido, mudança de `joinedAt`.
2. **Propriedade de reconciliação do aceite (núcleo da US-094):** com o harness de famílias (`en002-harness`, fábrica nova `makeFamily({ unlinked: n })` com lançamentos aleatórios semeados: divididas, "Só meu", cartão, parcelas, previstas, séries, acertos parciais, motores STORED e LEGACY) tirar um *snapshot* antes e depois do aceite: `ledgerTotals` por mês, `accountBalances`, `computeSettlement` de todos os períodos com despesa, `collectOpenPayables`, soma e lista de `version` de transações/contas/cartões/previstas/séries/família, contagem de membros e de `transaction_splits`. Igualdade exata, ≥ 200 famílias semeadas.
3. **Acerto:** S1..S16 e V1..V10 sem alteração; cenário US-093 (300 pagos por Ana entre 3 ⇒ +200/−100/−100) nos dois motores; cadastro com EQUAL inclui a partir de `joinedOn`.
4. **Matriz §5:** um teste por célula (permitido e 403), também em previstas/séries e cartão; regressão de toda a suíte do "Só meu" (`sec021*`, `us084*`, `sec042-046*`, `sec047-050*`, `d-ges-55*`, `d-ges-59*`, `sec025-026*`).
5. **Regressão R2:** ex-membro sem conta + outro sem conta ativo ⇒ pagador imutável e Admin-ex continuam.
6. **Convite/aceite:** cada linha da tabela do §4, inclusive ex-membro, 2 aceites concorrentes, aceite × remoção, e "nenhum caminho além de `acceptInvitation` grava `userId`" (busca estática + teste).
7. **LGPD:** exportação de Admin e de membro sem `pendingEmail`; remoção apaga e-mail; exclusão da família apaga cadastros; `SOLE_MEMBER`/`HAS_OTHER_MEMBERS` ignoram cadastros.
8. **Canário de isolamento** (ADR-018 §2) nas rotas novas.

## 9. Perguntas abertas (bloqueiam o SDD de 093b/094b; 092a pode começar)
| ID | Para | Pergunta | Recomendação do TL |
| :-- | :-- | :-- | :-- |
| Q-TL-U1 | Usuário | Ao cadastrar alguém, a divisão EQUAL passa a incluí-lo nas despesas novas (ex.: 3 partes com uma criança). Aceita, ou o cadastro deve perguntar "Entra na divisão?" | Aceitar como está e avisar no drawer; quem não deve dividir usa PROPORTIONAL com 0% |
| Q-TL-U2 | Usuário + Segurança | Alguém pode tornar "Só meu" uma despesa dividida paga pelo sem conta (apaga o crédito dele)? | Ninguém até ele assumir; para corrigir, excluir e relançar (histórico registra, SEC-054) |
| Q-TL-U3 | Usuário + Segurança | Só o Administrador cria "Só meu" em nome do sem conta (exceção à SEC-026c)? | Sim, só o Administrador |
| Q-TL-U4 | Usuário | O nome dado no cadastro continua valendo depois que a pessoa assume (em vez do nome do Google)? | Sim (US-094 "nada é renomeado"); o Administrador pode editá-lo depois |
| Q-TL-U5 | Segurança | Anonimizar o e-mail dos convites encerrados do cadastro removido na hora da remoção (além do expurgo de 90 d)? | Sim, mesmo mecanismo da SEC-017c |

## Consequências
- SDDs de 092..095 só depois das respostas Q-TL-U1..U5 e da revisão da Segurança sobre §5/§7; a 092a (modelo, sem UI) pode ser especificada já.
- Arquivos de estado a atualizar quando implementado: família-convites-sessões (regras 4, 6, 9, 14, 18-20), só-meu (§b matriz), acerto-divisão (M5 sem mudança; EQUAL com cadastro), privacidade-LGPD (e-mail de terceiro, exportação, contagens).
- ADR-019 §1 ("o nome é preservado porque ... seu `User` continua existindo") passa a valer também por `Member.name`.
