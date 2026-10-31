# ADR-033: Membro sem conta (`Member.userId` anulável) e convite vinculado ao membro

## Status
**Aceito, com as condições da revisão da Segurança incorporadas** (Tech Lead, 2026-10-30; proposto em 2026-10-26 no spike TL-U1 + TL-U2 + parecer TL-U3). Respostas do usuário a Q-TL-U1..U5 em 2026-10-30 (§9, D-GES-63): U1, U2, U3 e U5 aceitas como recomendado; **U4 mudou: a pessoa escolhe o próprio nome ao assumir o cadastro** (§2.2). Revisão da Segurança: `agents/security/relatorios/revisao-adr033-2026-10-30.md` (SEC-058..068; vereditos: U2 concordo, U3 e U4 concordo com condições, U5 concordo ampliando); condições de projeto emendadas aqui em §2.2, §2.3, §2.5, §2.8, §3, §4, §5 e §9 (marcadas "SEC-0xx"). **Pendentes do usuário, sem bloquear a 092a:** SEC-060 ("Entra na divisão?" no cadastro) e SEC-062(3) ("Desvincular conta"), com hipótese no §9. Emenda o [ADR-019](ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md) §1-§3 (o vínculo pode existir sem usuário) e o ADR-012 §2. SDD das fatias 092a/092b: [SDD-033](../sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md). Rastreabilidade: [NEED-028](../../stakeholder/needs/NEED-028-membro-sem-conta-ativa-e-convite-posterior.md) (Q-U15..U17) · [US-092](../../product-owner/backlog/stories/US-092-cadastrar-membro-sem-conta.md), [US-093](../../product-owner/backlog/stories/US-093-atribuir-contas-e-lancamentos-ao-membro-sem-conta.md), [US-094](../../product-owner/backlog/stories/US-094-convidar-membro-cadastrado-e-assumir-historico.md), [US-095](../../product-owner/backlog/stories/US-095-ciclo-de-vida-do-membro-sem-conta.md) · [FLUXO-020](../../product-owner/flows/FLUXO-020-membro-sem-conta-e-convite-posterior.md) · D-PO-103 · pedidos TL-U1/U2/U3 em [pedidos-ao-tech-lead-uso-real.md](../../product-owner/backlog/pedidos-ao-tech-lead-uso-real.md).

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
3. **Nome exibido = função única** `memberDisplayName(m) = m.name ?? m.user?.name ?? localPart(m.user.email)`. Para membros que entraram por convite comum `Member.name` continua `NULL` (nada muda para eles). Toda leitura de nome passa por essa função (substitui as cópias de `firstName`/`displayName`). O que `Member.name` guarda antes e depois do aceite está no §2.2 (Q-TL-U4, revisada pelo usuário; SEC-063). *Emenda:* a versão proposta dizia "`Member.name` permanece depois do aceite (nada é renomeado)" e o §9 recomendava o Administrador editar o nome depois; **ambos revogados**: no aceite o nome é o escolhido pela pessoa, e depois só ela o altera.
4. **Constraints (SQL cru):**
   - `members_unlinked_has_name_chk`: `"userId" IS NOT NULL OR name IS NOT NULL`.
   - `members_unlinked_is_member_chk`: `"userId" IS NOT NULL OR role = 'MEMBER'` (nunca Administrador sem conta).
   - `members_pending_email_chk`: `"pendingEmail" IS NULL OR ("userId" IS NULL AND "removedAt" IS NULL)` (e-mail só vive enquanto ativo e sem conta).
   - `members_family_pending_email_uq`: `UNIQUE ("familyId", "pendingEmail") WHERE "pendingEmail" IS NOT NULL`.
   - Índices parciais existentes por `userId` ficam: em Postgres `NULL` não colide, então N membros sem conta convivem e "1 vínculo ativo por usuário" segue valendo para quem tem conta.
5. **Gatilho `members_link_guard` (BEFORE UPDATE):** `userId` só muda de `NULL` para não nulo (nunca troca de pessoa nem volta a `NULL`); só se `OLD.removedAt IS NULL` e `NEW.removedAt IS NULL`; na mesma linha `pendingEmail` deve virar `NULL`, `linkedAt` ser preenchido e `name` ficar não nulo (o nome escolhido, §2.2); **no UPDATE de vínculo** `joinedAt` não muda (o acerto EQUAL usa `joinedOn`; o aceite não pode mexer nele); `familyId`, `id`, `createdByMemberId` e `linkedAt` (depois de preenchido) são imutáveis sempre. **SEC-065:** toda comparação usa `IS DISTINCT FROM`/`IS NULL` (nunca `<>`/`=`, que com `NULL` não dispara); `SET search_path = pg_catalog, public`; o vínculo (`NULL` ➔ valor) **só passa com a GUC `app.link_member = <memberId>`** ligada por `set_config(..., true)` na transação de `acceptInvitation` (mesmo padrão de `app.purge_family`/`app.anonymize_user`), então nenhum outro caminho grava `userId`; o teste de `search_path` da SEC-036 passa a varrer **todas** as funções `plpgsql` do schema `public`. *Ajuste do SDD-033:* `joinedAt` fora do vínculo continua editável, porque o harness de famílias (`tests/support/split-universe.ts`) e fixtures retroagem a entrada com `UPDATE`; nenhum código de produção altera `joinedAt`.
6. **Unicidade de nome e e-mail entre membros** (inclui comparação com `User.name`/`User.email` de quem tem conta, que índice não alcança): checada no serviço **sob `lockFamilyAdmins`** (advisory lock da família, já usado por remoção/papéis). Nome: único entre ativos sem diferenciar caixa/acentos (`NAME_TAKEN`). E-mail: recusado se é de membro ativo com conta (`DUPLICATE_MEMBER`) ou de outro cadastro (`EMAIL_BELONGS_TO_OTHER_MEMBER`).
7. **`Invitation.memberId uuid NULL`** com FK composta `(familyId, memberId) → members(familyId, id)` `ON DELETE RESTRICT` e índice único parcial `invitations(memberId) WHERE status = 'PENDING' AND "memberId" IS NOT NULL`. Convite com `memberId` = "convite vinculado"; sem = convite comum (inalterado).
8. **`FamilyEventType` ganha** `MEMBER_CREATED` (cadastro sem acesso), `MEMBER_UPDATED` (nome/e-mail) e `MEMBER_LINKED` (assumiu o cadastro). **`changes` nunca contém e-mail nem nome** (só `hasEmail`/`emailChanged`/`nameChanged`): `family_events` é append-only e não poderia ser anonimizado depois (lição do `INVITATION_RESENT`, SEC-017c). **SEC-061:** `INVITATION_RESENT` deixa de gravar `changes.email` para **todos** os convites (passa a `{ invitationId, resendCount }`); eventos antigos seguem cobertos pela anonimização da SEC-017c. Vai na 094a (antes de existir convite vinculado).

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

### 2.2 Nome do membro antes e depois do aceite (Q-TL-U4, decisão do usuário 2026-10-30)
**Regra:** o nome dado pelo Administrador no cadastro é um **rótulo provisório**. Ao assumir o cadastro, **a pessoa escolhe o próprio nome**, que passa a valer em todo o app; o rótulo **não prevalece** e não é guardado.

| Momento | `members.name` | `memberDisplayName` | Quem altera |
| :-- | :-- | :-- | :-- |
| Cadastro sem conta | rótulo do Administrador (obrigatório, 2..60, único entre ativos) | o rótulo | Só o Administrador (US-095, `MEMBER_UPDATED`) |
| Convite vinculado pendente | o rótulo | o rótulo; a tela de aceite mostra "Você foi cadastrado(a) como {rótulo}" | Administrador (US-095) |
| **Aceite** (`acceptInvitation`) | **sobrescrito pelo nome escolhido** no mesmo `UPDATE` do vínculo (2..60, saneado, único entre ativos pela chave forte abaixo, sob o lock da família) | o nome escolhido | O próprio convidado, no aceite |
| Depois do aceite | o nome escolhido (família-escopado; **não** é `User.name`) | o nome escolhido; o nome do Google (sincronizado em `User.name` a cada login, `profileUpdates`) **não** o substitui | **Só o próprio membro** (SEC-063e; tela "mudar meu nome na família" fica para história futura do PO). O Administrador **nunca** renomeia quem tem conta: 409 `MEMBER_IS_LINKED` |
| Excluir minha conta (US-080) | `NULL` (no mesmo passo da anonimização de `User`) | "Conta excluída" (`DELETED_ACCOUNT_NAME`, `deleted: true`) | — |
| Removido sem nunca ter conta | o rótulo (fica, como nome de ex-membro, U5) | o rótulo, com "(ex-membro)" | — |

**Chave de unicidade e saneamento (SEC-063b, vale no cadastro, na edição e no aceite):** `nameKey` = NFKC, remove caracteres invisíveis/de controle/bidi (`\p{Cf}`, `\p{Cc}`), sem acentos, sem caixa, espaços colapsados; recusa nomes cuja chave seja termo reservado do sistema (`conta excluida`, `ex-membro`, `ex membro`, `administrador`, `sem acesso ao app`, `assistente`, `membro`, `voce`) com 422 `NAME_RESERVED`; esqueleto de confusáveis (cirílico/grego parecido com latim) fica como melhoria (risco baixo, registrado). O nome segue como `untrusted_text` no MCP (SEC-009) e nunca entra nos agregados da IA (ADR-029).

**Por que `members.name` e não `User.name`:** `User.name` é reescrito pelo Google a cada login (`profileUpdates` em `src/lib/auth/config.ts`); gravar ali faria o nome escolhido sumir no próximo login. `members.name` já existe para o cadastro e só é lido por `memberDisplayName`.

**Histórico, relatórios e exportação ("o nome antigo"):** nenhum registro guarda nome de membro como texto: `FamilyEvent.changes`, `TransactionRevision.changes`, `transaction_splits` e o acerto guardam só `memberId`; telas, relatórios, exportação (LGPD), MCP e IA resolvem o nome **na leitura** por `memberDisplayName`. Logo, depois do aceite **todo o histórico passa a mostrar o nome escolhido**, inclusive eventos anteriores ("Mariana cadastrou Bia (sem acesso ao app)"). Regras: (a) `MEMBER_CREATED`, `MEMBER_UPDATED` e `MEMBER_LINKED` **nunca** gravam nome nem e-mail em `changes` (`family_events` é append-only; o rótulo não poderia ser apagado depois: mesma lição do SEC-017c); `MEMBER_UPDATED` grava só `{ nameChanged, emailChanged }` e `MEMBER_LINKED` só `{ invitationId, nameChanged }`; (b) o texto do evento de vínculo passa a "{nome atual} entrou no app e assumiu o cadastro" (a US-094 dizia "assumiu o cadastro de {nome}"; ajuste de texto para o PO, D-GES-63); (c) arquivos de exportação já baixados e respostas de idempotência (24 h) podem conter o rótulo: fora do alcance ou expiram, aceito; (d) a exclusão de conta acrescenta os `members.name` da pessoa aos nomes varridos por `scrubIdempotency`.

**Fluxo de aceite que pede o nome (094b):** em `/convites`, o cartão do convite vinculado mostra a prévia (§4, R5) e o campo obrigatório **"Seu nome na família"**, pré-preenchido com o nome do Google (`User.name`, ou a parte local do e-mail), **nunca com o rótulo** (SEC-063g: a troca de nome no aceite ajuda a denunciar captura), e com a dica "{Administrador} cadastrou você como “{rótulo}”. Você pode manter ou trocar." O botão "Assumir meu cadastro" envia `{ token?, name }`. Erros: `NAME_REQUIRED` 422 (vazio/fora de 2..60), `NAME_TAKEN` 409 (outro membro ativo já usa o nome; o convite segue PENDING e o campo mostra "Já existe um membro com este nome"). Convite comum (sem `memberId`) **não** pede nome e ignora o campo (nada muda para quem entra por convite comum). Não há etapa extra de onboarding: o aceite é a única tela; quem chega pelo link e faz login vai ao gate ➔ `/convites` como hoje.

## 3. Efeitos por domínio
| Domínio | Efeito | Regra |
| :-- | :-- | :-- |
| Sessão / `withApi` / gate | Nenhum caminho resolve membro sem conta (`findActiveMembership(userId)` com `userId` de sessão) | Membro sem conta nunca é `ctx.memberId`; nunca é ator de `FamilyEvent`, revisão, consentimento, MCP |
| **"Mesma pessoa" (SEC-049)** | **Bug latente a corrigir junto:** `ownerStanding` faz `findFirst({ userId: owner.userId, removedAt: null })`; com `owner.userId = NULL` o Prisma traduz para `IS NULL` e qualquer outro cadastro ativo seria tomado como "voltou" (ex-membro sem conta perderia a trava do pagador e o Admin-ex) | **SEC-058 (inteiro na 092a):** função única `samePerson(a, b)` (falso se algum lado é `null`); `ownerStanding` devolve `ownerRemoved: true` para dono removido sem conta **antes** da consulta; `Set`s de `userId` ativos filtram `null` em `privacidade/export.ts` e `analise-ia/suggestions.ts` (o TypeScript não acusa `Set.has(null)`); `memberRefsWithReturn` já correto. **Regra contra `undefined`:** nenhum `where` do Prisma recebe `userId` vindo de linha de `members` sem guarda explícita (`undefined` apaga o filtro): `endUserSessions` recusa `userId` vazio (`if (!userId) return 0`), a remoção não o chama para sem conta e `PATCH role` dá 422 `UNLINKED_MEMBER_ROLE` antes de tocar sessões. Teste por consumidor (ex-membro sem conta + outro cadastro ativo) e teste estático que reprova `userId: <expr>.userId`, `userId: undefined` e `?? undefined` em `where` |
| Acerto (motores) | **Nenhuma mudança** em `split/**`: o membro sem conta é `Member` com `joinedAt`/`removedAt` | EQUAL passa a incluí-lo a partir de `joinedOn` do cadastro (como um aceite hoje); PROPORTIONAL fica `stale` até o Admin redefinir (aceita 0% por membro: `bpsSchema.min(0)`). Aceite não muda `id`/`joinedAt` ⇒ acerto idêntico. Ver Q-TL-U1 |
| `registerSettlement` | Devedor, credor ou ADMIN registram, como hoje. **SEC-059b:** com **credor sem conta**, a conta de destino não pode ter como titular o devedor (422 `SETTLEMENT_DESTINATION_IS_DEBTOR`); a UI sugere a conta do próprio cadastro, se houver (093a) | A2 do acerto |
| Papéis / travas | `LAST_ADMIN` inalterado (sem conta nunca é ADMIN). `PATCH role` para sem conta ⇒ 422 `UNLINKED_MEMBER_ROLE` | §2.4 |
| Contagens de "único membro" | `ONLY_MEMBER` (remoção/saída), `SOLE_MEMBER` (excluir conta), `HAS_OTHER_MEMBERS` (excluir família) passam a contar **só membros ativos com conta** | Senão a família ficaria só com cadastros que ninguém acessa (ou não poderia ser excluída por causa de uma criança) |
| Remoção (US-095, mas o mínimo vai na 092) | Mesmo `removeMember(REMOVED)` com revisão de pendências; sem `endUserSessions`/`revokeMemberGrants` (nada a encerrar); apaga `pendingEmail`; cancela convite vinculado pendente. `LEFT` impossível (sem sessão) | Ex-membro sem conta = ex-membro comum (Admin-ex, pagador imutável, D-GES-59) |
| Reconvite de ex-membro sem conta | Não reativa o vínculo (ADR-019 §3); convite novo = membro novo | US-095 |
| Seletores (pagador, responsável, titular, divisão, filtros) | Listam o sem conta como ativo, com `MemberRef.unlinked: true` (selo "Sem acesso ao app") | `MemberRef` nunca traz `pendingEmail` |
| `GET /family` | `pendingEmail` só para ADMIN; demais veem nome e selo | Dado pessoal de terceiro |
| Exportação (LGPD) | Família completa do solicitante lista o membro por nome; **nunca** `pendingEmail` (regra "nunca e-mail de terceiros"); "Só meu" do sem conta é "alheio" para todos (não sai, SEC-029) | Sem conta não tem exportação própria até assumir |
| Excluir minha conta | Cadastros sem conta ficam com a família (são dados da família) | — |
| Excluir a família | Apaga os cadastros com o resto; tela de confirmação lista quantos cadastros sem conta serão apagados | §3 contagens |
| Anonimização (**Q-TL-U5 aceita pelo usuário; Segurança concorda e amplia**) | Remover sem conta: `pendingEmail = NULL`; `name` fica (histórico, como ex-membro, U5). Na mesma transação da remoção, o convite vinculado PENDING é cancelado e **todos os convites do cadastro** (`invitations.memberId = alvo`, status ≠ PENDING após o cancelamento) têm o e-mail trocado por `deleted+<memberId>@invalid.local` (mesmo formato do SEC-017c); o expurgo de 90 d continua. Na exclusão de conta, `members.name` da pessoa vira `NULL` (§2.2). **Ampliação da Segurança (SEC-061/068):** a mesma anonimização vale ao **editar ou remover** o `pendingEmail` (US-095: o e-mail errado é de um estranho); remoção/edição também chamam `scrubIdempotencyMentioning({ identifiers: [email] })`; `pendingEmail` não tem prazo próprio (vive enquanto o cadastro existir) e o Admin pode apagá-lo a qualquer momento (095) | Titular sem conta não tem como pedir os próprios dados: só via Administrador/suporte (limitação a registrar em privacidade-lgpd) |
| IA / MCP | Agregados sem nomes (ADR-029): sem efeito. Ferramentas MCP que listam membros não expõem `pendingEmail` | — |
| Tetos de convite | Cadastrar não conta; convidar (vinculado) conta como convite. **SEC-068:** teto de **20 cadastros sem conta ativos por família** (422 `UNLINKED_MEMBER_LIMIT`); toda checagem de unicidade de e-mail é por `familyId` (nunca global: seria oráculo entre famílias) | US-092/095 |

## 4. Fluxo de convite vinculado e aceite (TL-U2)
**Criar** `POST /api/v1/members/{id}/invitations` (só ADMIN; `Idempotency-Key`; corpo `.strict()` `{ email }`), dentro de `lockFamilyAdmins(needAdmin)`:
1. Membro ativo, sem conta, da família (senão 404 uniforme).
2. `pendingEmail` preenchido e diferente ⇒ 422 `INVITATION_EMAIL_MISMATCH` ("O e-mail do convite deve ser o do cadastro de Ana"). Vazio ⇒ grava `pendingEmail = email` na mesma transação (regra 6 de unicidade).
3. E-mail de membro ativo com conta ⇒ 409 `DUPLICATE_MEMBER`; de outro cadastro ⇒ 409 `EMAIL_BELONGS_TO_OTHER_MEMBER`; pendente igual ⇒ 409 `DUPLICATE_INVITATION` (índices existentes + o novo por `memberId`).
4. Papel sempre MEMBER; validade 7 d, tetos, reenvio, copiar link e recusa como hoje (US-003/039, SEC-040). **SEC-062(1):** a tela de convite repete o e-mail e avisa "Quem aceitar assume o histórico de {rótulo}"; o e-mail do convite e a página pública `/convite/[token]` **não** trazem o nome do cadastro nem contagens (SEC-064: prévia só em `GET /me/invitations` para o e-mail verificado do convite).
5. **Convite comum** (`POST /invitations`) para um e-mail que é `pendingEmail` de cadastro ⇒ 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER` (orienta "Convide pelo cadastro de Ana"); evita o 2º membro.
6. Editar/remover `pendingEmail` com convite vinculado pendente ⇒ 409 `MEMBER_HAS_PENDING_INVITATION` (cancele antes). Invariante: convite vinculado pendente ⇒ `invitation.email = member.pendingEmail`.

**Aceitar** (mesmo `POST /me/invitations/{id}/accept`, SEC-004 intacto): mesmas pré-condições (`emailVerified`; convite de outro e-mail = 404 uniforme; token divergente 422; vencido 410; já tem família 409 `ALREADY_IN_FAMILY` com convite PENDING). Se `inv.memberId`:
1. Advisory lock da família (mesma chave de `lockFamilyAdmins`, sem exigir ator, pois o convidado ainda não é membro) **como primeiro passo, antes do `claim` e de reler o cadastro** (SEC-066a) ⇒ serializa com remoção, edição e cancelamento do cadastro e com excluir a família; liga `app.link_member` (SEC-065).
2. `claim` condicional do convite (concorrência no mesmo convite: 1 vence).
3. `UPDATE members SET "userId" = $u, "linkedAt" = now(), "pendingEmail" = NULL WHERE id = $m AND "familyId" = $f AND "userId" IS NULL AND "removedAt" IS NULL`: 0 linhas ⇒ rollback e 409 `MEMBER_NO_LONGER_AVAILABLE`; violação de `members_user_active_uq` (aceite simultâneo em outra família) ⇒ 409 `ALREADY_IN_FAMILY`.
4. O mesmo `UPDATE` do passo 3 grava `name = <nome escolhido>` (§2.2), validado (2..60) e checado como único entre ativos **antes** do UPDATE, sob o lock do passo 1 (`NAME_TAKEN` 409 ⇒ rollback, convite segue PENDING).
5. `FamilyEvent MEMBER_LINKED` (ator = o próprio membro já vinculado; `changes: { invitationId, nameChanged }`, sem nome nem e-mail). **SEC-062(2):** após o commit, aviso por e-mail aos Administradores ("O cadastro {rótulo} foi assumido por {e-mail do convite}, que escolheu o nome {nome}") e destaque no histórico; e (SEC-059c) a prévia/primeira visita mostra quantas alterações outros fizeram em nome do cadastro (revisões e eventos já gravados).
6. **Nada mais é escrito**: nenhuma linha de ledger, conta, cartão, prevista, série, split ou revisão ⇒ totais, saldos, acerto e `version`s idênticos por construção.

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
| Mudar divisão, conta, "Pagar com" do "Só meu" | 403 | 403 | sim (poder pleno, como Admin-ex; **não** assume o pagador, SEC-059a) | 403 | idem |
| **Criar** "Só meu" em nome do sem conta (despesa, prevista, série) | só se Admin | — | sim (exceção explícita à SEC-026c; **Q-TL-U3 aceita**) | 403 | `PERSONAL_ON_BEHALF_FORBIDDEN` |
| **Tornar "Só meu"** uma dividida paga pelo sem conta (captura) | 403 | 403 | **403** (**Q-TL-U2 aceita**: ninguém, até ele assumir) | 403 | `PERSONAL_OWNER_ONLY` |
| Definir/trocar pagador ou responsável **para ou de** um sem conta em item existente | sim (correção do que lançou) | 403 | **só para um terceiro membro, nunca para si** (D-GES-47 vale para o Admin; fecha o caminho em dois passos "pagador para mim ➔ Só meu" e o resíduo DEV-132, SEC-059a) | 403 `UNLINKED_PAYER_FORBIDDEN` | novo |
| Criar dividida/receita com pagador sem conta | qualquer membro (vira Lanç) | — | sim | — | autor registrado |
| Titular de conta/cartão = sem conta (criar) | Admin | — | sim | 422 `UNLINKED_OWNER_ADMIN_ONLY` | novo |
| Trocar titular de cartão cujo titular é sem conta | — | — | sim (exceção ao `CARD_OWNER_ONLY`, grava `CARD_OWNER_CHANGED`) | 403 | — |
| Registrar acerto com o sem conta numa ponta | a outra ponta | — | sim | 403 | A2; destino ≠ conta do devedor quando o credor é sem conta (SEC-059b) |

Após o aceite: o tutor perde esses poderes e valem as regras normais (o próprio membro é o Dono), como no retorno da SEC-049. Após a remoção do sem conta: regras de ex-membro (Admin-ex, pagador imutável). Limites da exceção à SEC-026c (SEC-067): só na **criação**, só `ctx.role === "ADMIN"`, só para dono ativo sem conta **lido na transação com `FOR SHARE` ou sob o lock da família** (SEC-066b, contra o aceite concorrente), nunca no ramo `payerChanges` de `assertCanMakePersonal` (não "entrega" item existente) e nunca pelo MCP. Implementação: um único predicado `ownerStanding` com três estados (`ownerIsActor`, `ownerRemoved`, **`ownerUnlinked`**), lido na transação e filtrado por `familyId`, consumido por `assertCanWriteTransaction`, `assertCanMakePersonal`, `assertPersonalForSelf`, `plannedWriteDecision`, `assertPlannedControllerLimits`, `cartoes/service` (titular). Rótulos de 403 listam os nomes de quem pode (incluir "um Administrador").

## 6. Fatiamento e estimativas (TL)
| História | PO | TL | Fatias | Conteúdo |
| :-- | :-: | :-: | :-- | :-- |
| US-092 | 3 | **5** | 092a (3) modelo; 092b (2) cadastro | a: migração §2.1, gatilho, `memberDisplayName` nos ~45 pontos, `MemberRef.unlinked`, contagens `ONLY_MEMBER`/`SOLE_MEMBER`/`HAS_OTHER_MEMBERS`, correção `ownerStanding` com `userId` nulo, remoção mínima segura (sem sessões, apaga e-mail). b: `POST /members` (ADMIN), drawer, selo, `MEMBER_CREATED`, unicidade nome/e-mail |
| US-093 | 5 | **8** | 093a (3) seletores/titular/acerto; 093b (5) "Só meu" | a: seletores, filtros, titular conta/cartão (ADMIN), acerto (sem mudar motor). b: matriz §5 (`ownerUnlinked`), exceção SEC-026c, `UNLINKED_PAYER_FORBIDDEN`, troca de titular; **revisão da Segurança** |
| US-094 | 5 | **8** | 094a (3) convite vinculado; 094b (5) aceite | a: `Invitation.memberId`, rotas, guardas §4 1-6. b: aceite que assume, prévia com contagens, `MEMBER_LINKED`, ex-membro, propriedade de reconciliação |
| US-095 | 2 | **2** | — | editar nome/e-mail (`MEMBER_UPDATED`, `MEMBER_HAS_PENDING_INVITATION`), remover e-mail, polimento da remoção (diálogo sem "sessões") |
| **Total** | 15 | **23** (inalterado após Q-TL-U4: o campo de nome no aceite cabe nos 5 da 094b; zerar `members.name` na exclusão de conta vai na 092a) | ordem 092a ➔ 092b ➔ 093a ➔ 093b ➔ 094a ➔ 094b ➔ 095 | 092a não tem valor visível sozinha, mas pode ir à produção antes (expand) |

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
| R11 | Nome escolhido no aceite (Q-TL-U4): colisão com outro membro, nome enganoso, nome do rótulo preso em trilha append-only | Unicidade sob lock com chave forte e termos reservados (`NAME_TAKEN`/`NAME_RESERVED`); nunca nome em `changes`; nome resolvido na leitura; exclusão de conta zera `members.name` (§2.2, SEC-063) |

Revisão da Segurança (2026-10-30): SEC-058 (Média) e SEC-059 (Média) emendadas em §3/§5; SEC-061, 063, 065 emendadas em §2; SEC-064, 066, 067, 068 nos SDDs indicados; SEC-060 e SEC-062(3) com o usuário (§9.1). Reteste de cada fatia pela Segurança após a implementação.

## 8. Plano de testes (guia para o SDD)
1. **Migração:** dados atuais intactos; CHECKs recusam sem conta sem nome, ADMIN sem conta, e-mail em membro com conta; gatilho recusa `userId` não nulo ➔ outro, ➔ `NULL`, vínculo de removido, mudança de `joinedAt`.
2. **Propriedade de reconciliação do aceite (núcleo da US-094):** com o harness de famílias (`en002-harness`, fábrica nova `makeFamily({ unlinked: n })` com lançamentos aleatórios semeados: divididas, "Só meu", cartão, parcelas, previstas, séries, acertos parciais, motores STORED e LEGACY) tirar um *snapshot* antes e depois do aceite: `ledgerTotals` por mês, `accountBalances`, `computeSettlement` de todos os períodos com despesa, `collectOpenPayables`, soma e lista de `version` de transações/contas/cartões/previstas/séries/família, contagem de membros e de `transaction_splits`. Igualdade exata, ≥ 200 famílias semeadas.
3. **Acerto:** S1..S16 e V1..V10 sem alteração; cenário US-093 (300 pagos por Ana entre 3 ⇒ +200/−100/−100) nos dois motores; cadastro com EQUAL inclui a partir de `joinedOn`.
4. **Matriz §5:** um teste por célula (permitido e 403), também em previstas/séries e cartão; regressão de toda a suíte do "Só meu" (`sec021*`, `us084*`, `sec042-046*`, `sec047-050*`, `d-ges-55*`, `d-ges-59*`, `sec025-026*`).
5. **Regressão R2:** ex-membro sem conta + outro sem conta ativo ⇒ pagador imutável e Admin-ex continuam.
6. **Convite/aceite:** cada linha da tabela do §4, inclusive ex-membro, 2 aceites concorrentes, aceite × remoção, e "nenhum caminho além de `acceptInvitation` grava `userId`" (busca estática + teste).
7. **LGPD:** exportação de Admin e de membro sem `pendingEmail`; remoção apaga e-mail; exclusão da família apaga cadastros; `SOLE_MEMBER`/`HAS_OTHER_MEMBERS` ignoram cadastros.
8. **Canário de isolamento** (ADR-018 §2) nas rotas novas.
9. **Nome (§2.2):** aceite grava o nome escolhido e todo histórico/exportação/MCP mostra o novo nome; nenhum `changes` de `family_events` contém o rótulo nem o nome (busca por `findResidue`); login com outro nome do Google não altera o nome na família; exclusão de conta mostra "Conta excluída".

## 9. Perguntas (respondidas pelo usuário em 2026-10-30, D-GES-63)
| ID | Para | Pergunta | Recomendação do TL | **Resposta** |
| :-- | :-- | :-- | :-- | :-- |
| Q-TL-U1 | Usuário | Ao cadastrar alguém, a divisão EQUAL passa a incluí-lo nas despesas novas (ex.: 3 partes com uma criança). Aceita, ou o cadastro deve perguntar "Entra na divisão?" | Aceitar como está e avisar no drawer; quem não deve dividir usa PROPORTIONAL com 0% | **Aceita.** Aviso no drawer de cadastro (SDD-033 §5.3) |
| Q-TL-U2 | Usuário + Segurança | Alguém pode tornar "Só meu" uma despesa dividida paga pelo sem conta (apaga o crédito dele)? | Ninguém até ele assumir; para corrigir, excluir e relançar (histórico registra, SEC-054) | **Aceita** (usuário); Segurança revisa |
| Q-TL-U3 | Usuário + Segurança | Só o Administrador cria "Só meu" em nome do sem conta (exceção à SEC-026c)? | Sim, só o Administrador | **Aceita** (usuário); Segurança revisa |
| Q-TL-U4 | Usuário | O nome dado no cadastro continua valendo depois que a pessoa assume (em vez do nome do Google)? | Sim (US-094 "nada é renomeado"); o Administrador pode editá-lo depois | **Mudou:** ao assumir, a pessoa escolhe o próprio nome; o do cadastro é rótulo provisório e não prevalece (§2.2) |
| Q-TL-U5 | Segurança | Anonimizar o e-mail dos convites encerrados do cadastro removido na hora da remoção (além do expurgo de 90 d)? | Sim, mesmo mecanismo da SEC-017c | **Aceita pelo usuário**, sujeita à revisão da Segurança (§3 Anonimização) |

### 9.1 Pendentes do usuário vindos da revisão da Segurança (não bloqueiam a 092a)
| ID | Pergunta | Hipótese adotada até a resposta | Impacto se mudar |
| :-- | :-- | :-- | :-- |
| SEC-060 | O cadastro deve perguntar "Entra na divisão das despesas?" (escolha obrigatória, mostrando o efeito "300 entre 3"; "não" grava PROPORTIONAL com 0% na mesma transação)? A Segurança recomenda sim | Vale a resposta do usuário à Q-TL-U1: **aviso** no drawer, sem pergunta; `joinedAt = now()` só no servidor (nunca do corpo) | +1 pt na 092b (pergunta + gravação da regra na mesma transação) |
| SEC-062(3) | Criar "Desvincular conta" (só Admin, janela de 7 dias após o aceite) para desfazer um convite aceito pela pessoa errada (volta `userId` a `NULL` sob GUC própria, encerra sessões/concessões, `MEMBER_UNLINKED`)? | **Não** por ora: mitigações (1) e (2) do §4 (aviso na criação do convite, e-mail aos Admins no vínculo); o gatilho segue proibindo `userId` ➔ `NULL` | Nova fatia (~3 pts) e emenda do gatilho |

## Consequências
- Q-TL-U1..U5 respondidas (2026-10-30). SDD-033 cobre 092a (modelo/migração) e 092b (cadastro). Próximos SDDs: 093a/093b (seletores, titular, acerto, matriz §5), 094a/094b (convite vinculado, aceite com nome escolhido, §2.2 e §4) e 095 (editar/remover); 093b e 094b incorporam as condições da revisão da Segurança já emendadas em §2-§5.
- US-094: o texto "nada é renomeado" passa a valer para o histórico financeiro (nenhuma linha muda), não para o nome do membro (§2.2); o PO ajusta a US-094 (regra e cenário com o campo "Seu nome na família").
- Arquivos de estado a atualizar quando implementado: família-convites-sessões (regras 4, 6, 9, 14, 18-20), só-meu (§b matriz), acerto-divisão (M5 sem mudança; EQUAL com cadastro), privacidade-LGPD (e-mail de terceiro, exportação, contagens).
- ADR-019 §1 ("o nome é preservado porque ... seu `User` continua existindo") passa a valer também por `Member.name`.
