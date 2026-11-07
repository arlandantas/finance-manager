# Spec 09 — Família, convites, membros e sessões

Atualizado: 2026-11-07. Fonte de verdade: código + testes. Membro sem conta: US-092a/092b/093a/093b/094a implementadas; 094b/095 especificadas (regras 28b-28c, ADR-038), não iniciadas.

## Resumo
- Login só com Google. Admin convida por e-mail (7 dias); vínculo só no aceite explícito em `/convites`. Papéis ADMIN/MEMBER, sempre >=1 ADMIN.
- Sessão: 30 dias sem uso, 90 absolutos; removido perde todas na hora.
- Membro sem conta (ADR-033): cadastrado pelo Admin (nome, e-mail opcional), selo "Sem acesso ao app", sem e-mail nem sessão.

## Regras
| # | Regra | Valor / comportamento |
| :-- | :-- | :-- |
| 1 | Login | Google; `email_verified` obrigatório (`EmailNotVerified`) |
| 2 | Cadastro restrito | `ALLOWED_SIGNUP_EMAILS` (CSV normalizado): fora da lista `SignupRestricted`; vazia = aberto |
| 4 | Criar família | Sem vínculo ativo; vira ADMIN; categorias padrão + EQUAL; 1 vínculo ativo por usuário (índice parcial) |
| 5 | Convidar | Só ADMIN; padrão MEMBER; 7 dias; só hash do token; e-mail após o commit (falha: `FAILED`, UI oferece copiar link); e-mail trim+minúsculas |
| 6 | Convite duplicado | Membro ativo 409 `DUPLICATE_MEMBER`; pendente 409 `DUPLICATE_INVITATION`; vencido libera (EXPIRED); recusado pode reconvidar |
| 7 | Tetos | Família 5/h e 10/dia (advisory lock); PESSOA 5/h e 10/dia somando famílias (inclusive excluídas) e reenvios com e-mail; 429 `INVITATION_LIMIT` sem gastar cota |
| 8 | Copiar link / Reenviar | ROTACIONAM o token, validade mantida; só reenviar conta (máx. 3, 422 `RESEND_LIMIT_REACHED`); vencido 422, cancelado 409; evento `INVITATION_RESENT` |
| 9 | Aceite explícito | `POST /me/invitations/{id}/accept` é o ÚNICO vínculo. Exige `emailVerified`; outro e-mail 404; token divergente 422; já tem família 409 `ALREADY_IN_FAMILY`; vencido 410; UPDATE condicional; `MEMBER_JOINED`. Link, login e gate NUNCA vinculam |
| 10 | Recusar | `DECLINED` sem vínculo; Admin vê "Recusado" 30 dias; 20 aceites/recusas por usuário/h |
| 11 | Gate | Sem vínculo: convite válido => `/convites`; vencido <=30 d => `/onboarding?notice=invite_expired`; remoção não avisada => `/api/auth/membership-ended`; senão `/onboarding` |
| 12 | Papéis | Só ADMIN convida, cancela, remove, muda papel, renomeia, exclui família. Último ADMIN: 422 `LAST_ADMIN`; trocar papel encerra as sessões do alvo |
| 13 | Sessão | Auth.js em banco; cookie só token, banco guarda `sha256`. Ocioso 30 d, absoluto 90 d; conta excluída nunca autentica; "Encerrar as outras" apaga as demais |
| 14 | Remover | Só ADMIN, alvo ativo; `Member` nunca apagado (`removedAt`, `REMOVED`); atômico sob lock; sessões e concessões do removido encerradas |
| 15 | Sair | Sobre si; `ONLY_MEMBER`/`LAST_ADMIN`; mantém a sessão; `plannedTo` deve ser ADMIN ativo |
| 16 | Pendências na remoção | Conta com saldo != 0 / cartão com fatura aberta: reatribuir a ativo (`ACCOUNT_NEEDS_OWNER`/`CARD_NEEDS_OWNER`), senão arquivados; previstas a `plannedTo` (padrão quem remove) |
| 16b | Remoção (cont.) | Acerto aberto exige `acknowledgeSettlement`; `reassignNotice` avisa que quem recebe controla os "Só meu"; erros `INVALID_REASSIGN_TARGET`, `REMOVAL_BLOCKED` |
| 18 | Ex-membros | Reconvite = NOVO `Member` sem histórico; `/family` mostra só nome/foto/data |
| 20 | Excluir conta / família | `removeMember(LEFT)`; `SOLE_MEMBER`/`LAST_ADMIN`; família só por ADMIN único ativo (detalhes em Privacidade) |
| 21 | Modelo do sem conta | `members.userId` anulável + `name`, `pendingEmail`, `linkedAt`, `createdByMemberId`; sempre MEMBER (ADMIN em `PATCH /members/{id}` = 422 `UNLINKED_MEMBER_ROLE`); nome 2..60; e-mail único por família |
| 21b | Modelo (cont.) | CHECKs: nome obrigatório, papel MEMBER, `pendingEmail` só em ativo sem conta, `linkedAt` exige `userId`. Gatilho `members_link_guard`: ids/`familyId`/`createdByMemberId`/`linkedAt` imutáveis; vínculo só com GUC `app.link_member` (094b). `invitations.memberId` usado pela 094a |
| 22 | Nome exibido único | `memberDisplayName`/`toMemberRef`: `members.name` > `user.name` > parte local; conta excluída "Conta excluída"; `MemberRef.unlinked`; `samePerson` nunca iguala nulos |
| 22b | Nome (cont.) | Teste estático: sem `user.name ??`/`localPart(` fora da fonte; `pendingEmail` só em `familia/**`, `privacidade/delete-*` e tela Família |
| 23 | Sem conta nas leituras | `ONLY_MEMBER`/`SOLE_MEMBER`/`HAS_OTHER_MEMBERS` contam só ativos COM conta; `ownerStanding`, exportação e sugestões ignoram `userId` nulo; `endUserSessions("")` = 0 |
| 23b | Remover/excluir sem conta | Remover sem conta zera `pendingEmail` com `removedAt`, anonimiza convites do cadastro (`deleted+<id>@invalid.local`) e apaga idempotência com o e-mail; excluir a conta zera `members.name` |
| 23c | "Só meu" do sem conta | Admin cria "Só meu" em nome do sem conta ativo e é tutor dele (membro comum: 403 `PERSONAL_ON_BEHALF_FORBIDDEN`); ver spec do "Só meu" |
| 24 | Cadastrar sem conta | `POST /api/v1/members` `{name, email?}` (`.strict()`, 201), só ADMIN, sob `lockFamilyAdmins`, `Idempotency-Key`; `joinedAt` do servidor; erro de corpo (Zod) = 400 `VALIDATION_ERROR` |
| 24b | Cadastro: nome | Saneado (NFKC, sem invisíveis), 2..60, único entre ativos sem caixa/acentos (inclui quem tem conta): 409 `NAME_TAKEN`; reservados ("Conta excluída", "Administrador", "Sem acesso ao app"...): 422 `NAME_RESERVED`; 20 sem conta ativos: 422 `UNLINKED_MEMBER_LIMIT` |
| 24c | Cadastro: e-mail | Opcional: de membro com conta 409 `DUPLICATE_MEMBER`; de outro cadastro 409 `EMAIL_BELONGS_TO_OTHER_MEMBER` (inclui corrida); convite comum pendente 409 `EMAIL_HAS_PENDING_INVITATION`; ex-membro ou OUTRA família permitido |
| 24d | Cadastro: efeitos | Sem e-mail, cota, sessão ou concessão. Evento `MEMBER_CREATED` com `{hasEmail}` apenas |
| 25 | Convite x cadastro | `createInvitation` usa `lockFamilyAdmins` e recusa, sem gastar cota, e-mail que é `pendingEmail` de ativo: 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER`. Simultâneos do mesmo e-mail: um só sobrevive |
| 26 | Leitura e tela | `GET /family`: `pendingEmail` só para ADMIN e só em sem conta (chave ausente para MEMBER); `email: null`, `canChangeRole: false`. "Cadastrar membro" (só ADMIN) abre drawer com aviso de divisão: EQUAL inclui o cadastrado só nas despesas NOVAS; PROPORTIONAL fica `stale`, 0% permitido |
| 26b | Tela (cont.) | Selo "Sem acesso ao app"; menu só com Remover; histórico "{ator} cadastrou {alvo} (sem acesso ao app)"; `Drawer` com `returnFocusId` |
| 27 | Titular sem conta (093a) | Conta/cartão com titular sem conta só por ADMIN: não-ADMIN 422 `UNLINKED_OWNER_ADMIN_ONLY` (`path: ownerMemberId`) em `createAccount`/`createCard`/troca de titular; candidato = ativo da família (senão 422 `INVALID_REFERENCE`) |
| 27b | Cartão de sem conta | Cartão cujo titular ATUAL é sem conta ativo: só ADMIN troca (403 `CARD_OWNER_ONLY`, avaliado antes; `CARD_OWNER_CHANGED` com o ator real) |
| 27c | Selo na UI | `UnlinkedBadge` e `memberOptionLabel` ("Ana · sem acesso ao app") nos seletores (opção `disabled` "(só Administrador)" para MEMBER), chips, Contas, Cartões, A pagar, detalhe, Acerto e Regra; ex-membro sem conta sem selo |
| 28 | Convite vinculado (US-094a; ADR-038) | `POST /members/{id}/invitations` `{email}` só ADMIN sob `lockFamilyAdmins`; cadastro inexistente/removido/com conta/outra família 404 uniforme; e-mail = `pendingEmail` (`INVITATION_EMAIL_MISMATCH` 422) ou grava-o; recusas (`DUPLICATE_MEMBER`, `EMAIL_BELONGS_TO_OTHER_MEMBER`, `DUPLICATE_INVITATION`) antes das cotas; papel MEMBER; mesmas cotas/validade/reenvio/e-mail (sem nome); `InvitationDTO.memberId`; `MemberDTO.pendingInvitation {id, expiresAt}` só ADMIN; lista "Convites pendentes" omite vinculados; `INVITATION_RESENT` só `{invitationId, resendCount}` (SEC-061); UI: "Convidar" no menu do sem conta, selo "Convite pendente" com reenviar/copiar/cancelar |
| 28b | Aceite vinculado (PLANEJADA, US-094b) | Advisory `family:{id}` primeiro; `{token?, name}` (`NAME_REQUIRED` 422, `NAME_TAKEN` 409 com convite ainda PENDING); claim; `UPDATE members` com GUC `app.link_member` (0 linhas `MEMBER_NO_LONGER_AVAILABLE`); `MEMBER_LINKED` sem PII; e-mail aos ADMIN após o commit; nada financeiro escrito. Prévia com contagens só ao e-mail verificado |
| 28c | Editar sem conta (PLANEJADA, US-095) | `PATCH /members/{id}/profile` `{name?, email?: string\|null}` só ADMIN; com conta 409 `MEMBER_IS_LINKED`; com convite vinculado pendente 409 `MEMBER_HAS_PENDING_INVITATION`; trocar/remover e-mail anonimiza convites encerrados; `MEMBER_UPDATED` só flags |

## Invariantes
1. Só `acceptInvitation` cria `Member` por convite ou grava `userId` em linha existente (gatilho + teste estático).
2. 1 `Member` ativo por usuário (índice parcial); `Member`/`FamilyEvent` nunca apagados (exceto exclusão da família).
3. Sempre >=1 ADMIN ativo: rebaixar/remover/sair sob `lockFamilyAdmins`.
4. Convites e cadastros escopados por `familyId` (outra família => 404); tokens só em hash; cotas consumidas na transação.
5. Remoção/reatribuição/arquivamento atômicos.
6. `pendingEmail` só sai para ADMIN; nunca em `MemberRef`, evento, exportação, MCP, IA ou log.

## Riscos aceitos
- Remoção dá ao Admin controle dos "Só meu" reatribuídos (SEC-046/052; aviso na revisão). Exclusões só com confirmação digitada (SEC-037, pendente do usuário).
- Dados de ex-membro mantidos até excluir a conta (LGPD a validar). Membro com conta não ADMIN não passa o próprio cartão a um sem conta: arquiva e o ADMIN recria.
- Editar/remover o e-mail do cadastro é 095 (convite vinculado pendente bloqueia).

## Fontes
Código: `src/modules/familia/{service,manage,removal,repo,schemas,hooks,settings,members,display-name}.ts`, `familia/invitations/{linked,...}`, `src/lib/auth/*`, `src/proxy.ts`, `modules/cron/retention.ts`; rotas `src/app/api/v1/{families,family,members,invitations,me/invitations,me/sessions/revoke-others}`; telas `src/app/{convites,(app)/familia,(public)/convite/[token]}`; `components/ui/unlinked-badge.tsx`, `privacidade/delete-*`.
Testes: int `us-094a-convite-vinculado`, `us-093a-*`, `us-092b-cadastrar-membro`, `us-092a-*`, `sec036-travas`, `us-00{1,2,3}-*`, `u6-*`, `us-039-*`, `sec040-*`, `us-034-*`, `us-035-*`, `sec018-sessao`, `sec017d-*`; unit `familia/{display-name,create-unlinked-member-schema}`, `meta/member-reads`, `auth/auth-pure`; E2E `US-092-*`, `US-093-*`, `US-094a-*` (.feature).
Migrações: `20261030020000`, `20261030020100`, `20261031000000`.

## Pendências
- 094b (aceite, nome escolhido, SEC-062/063/064), 095 (editar nome/e-mail; remoção do sem conta já entregue). Contrato nas regras 28-28c e no ADR-038.
- Usuário: SEC-060 "Entra na divisão?" (hipótese: só aviso); SEC-062 "Desvincular conta" (hipótese: não); `ALLOWED_SIGNUP_EMAILS`; SEC-037. LGPD: titular sem conta exerce direitos via Admin; citar em `/privacidade`.
- Fase 2 da SEC-018 (`prisma/pending/20261027000000_*`); schema ainda mantém `sessionToken`.
- Não verificado: UI do aviso da remoção; migração `20261031000000` fora de produção.
- Divergência: Extrato só tem filtro "Membro" (não existe "Quem pagou" separado); erro Zod é 400, `NAME_RESERVED` 422 vem do serviço.
