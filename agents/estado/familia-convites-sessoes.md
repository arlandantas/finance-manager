# Estado vigente: Família, convites, membros e sessões

Atualizado: 2026-10-31 (US-092b, 093a e 093b implementadas; 094a em diante não iniciadas). Fonte de verdade: código + testes (§f).

## a) Resumo para o usuário
- Login só com Google; `ALLOWED_SIGNUP_EMAILS` preenchida restringe quem cria conta (ação do usuário na Vercel, 9.1).
- O Administrador convida por e-mail (7 dias); o vínculo só ocorre no aceite explícito em `/convites`. Há tetos de convites por família e por pessoa.
- Papéis Administrador e Membro, sempre >=1 Administrador. Remoção/saída exige revisar contas, cartões, previstas e acerto; quem remove controla os "Só meu" das contas reatribuídas (aviso).
- Sessão: 30 dias sem uso, 90 absolutos; removido perde todas na hora.
- **Membro sem conta** (NEED-028, US-092..095; ADR-033/SDD-033): **092a (modelo) e 092b (cadastro) implementadas**. O Administrador usa "Cadastrar membro" em Família (nome, e-mail opcional); a pessoa aparece com o selo "Sem acesso ao app" e nos seletores, sem e-mail nem sessão. Convidar, editar, selo nos seletores, "Só meu" e aceite são 093a..095.

## b) Regras vigentes
| # | Regra | Valor / comportamento | Origem |
| :-- | :-- | :-- | :-- |
| 1 | Login | Google; `email_verified` obrigatório (`EmailNotVerified`) | US-001 |
| 2 | Cadastro restrito | `ALLOWED_SIGNUP_EMAILS` (CSV normalizado): fora da lista não cria usuário (`SignupRestricted`); vazia = aberto | D-GES-42 |
| 4 | Criar família | Sem vínculo ativo; vira ADMIN; categorias padrão + EQUAL; 1 vínculo ativo por usuário (índice parcial) | US-002 |
| 5 | Convidar | Só ADMIN; papel padrão MEMBER; 7 dias; só o hash do token; e-mail após o commit (falha: `FAILED`, UI oferece copiar o link); e-mail sempre trim+minúsculas | US-003, ADR-012 |
| 6 | Convite duplicado | Membro ativo 409 `DUPLICATE_MEMBER`; pendente 409 `DUPLICATE_INVITATION`; vencido libera (EXPIRED); recusado pode reconvidar | US-003 |
| 7 | Tetos | Família 5/h e 10/dia (advisory lock); PESSOA 5/h e 10/dia somando famílias (inclusive excluídas) e reenvios com e-mail; 429 `INVITATION_LIMIT` sem gastar cota | SEC-014/027/040 |
| 8 | Copiar link / Reenviar | ROTACIONAM o token, validade mantida; só reenviar conta (máx. 3, 422 `RESEND_LIMIT_REACHED`); vencido 422, cancelado 409; `INVITATION_RESENT` | US-039 |
| 9 | Aceite explícito | `POST /me/invitations/{id}/accept` é o ÚNICO vínculo. Exige `emailVerified`; outro e-mail 404; token divergente 422; já tem família 409 `ALREADY_IN_FAMILY`; vencido 410; UPDATE condicional; `MEMBER_JOINED`. Link, login e gate NUNCA vinculam | SEC-004 |
| 10 | Recusar | `DECLINED` sem vínculo; Admin vê "Recusado" 30 dias; 20 aceites/recusas por usuário/h | SEC-004 |
| 11 | Gate | Sem vínculo: convite válido => `/convites`; vencido <=30 d => `/onboarding?notice=invite_expired`; remoção não avisada => `/api/auth/membership-ended`; senão `/onboarding` | SDD-028 §1.1 |
| 12 | Papéis | Só ADMIN convida, cancela, remove, muda papel, renomeia, exclui família. Último ADMIN: 422 `LAST_ADMIN`; trocar papel encerra as sessões do alvo | US-034 |
| 13 | Sessão | Auth.js em banco; cookie só token, banco guarda `sha256`. Ocioso 30 d, absoluto 90 d; conta excluída nunca autentica; "Encerrar as outras" apaga as demais | SEC-018, US-078 |
| 14 | Remover | Só ADMIN, alvo ativo; `Member` nunca apagado (`removedAt`, `REMOVED`); atômico sob lock; sessões e concessões do removido encerradas | US-035, ADR-019, DEV-91 |
| 15 | Sair | Sobre si; `ONLY_MEMBER`/`LAST_ADMIN`; mantém a sessão; `plannedTo` deve ser ADMIN ativo | US-035 |
| 16 | Pendências | Conta com saldo != 0 / cartão com fatura aberta: reatribuir a ativo (`ACCOUNT_NEEDS_OWNER`/`CARD_NEEDS_OWNER`), senão arquivados; previstas a `plannedTo` (padrão quem remove); acerto aberto exige `acknowledgeSettlement`; `reassignNotice` avisa que quem recebe controla os "Só meu"; erros `INVALID_REASSIGN_TARGET`, `REMOVAL_BLOCKED` | SDD-012 §4.3 |
| 18 | Ex-membros | Reconvite = NOVO `Member` sem histórico; `/family` mostra só nome/foto/data | SEC-049, ADR-019 |
| 20 | Excluir conta / família | Ver Privacidade; `removeMember(LEFT)`; `SOLE_MEMBER`/`LAST_ADMIN`; família só por ADMIN único ativo | US-080/081 |
| 21 | **Modelo do sem conta (092a)** | `members.userId` anulável + `name`, `pendingEmail`, `linkedAt`, `createdByMemberId`; sempre MEMBER (ADMIN em `PATCH /members/{id}` = 422 `UNLINKED_MEMBER_ROLE`); nome 2..60; e-mail único por família. CHECKs: nome obrigatório, papel MEMBER, `pendingEmail` só em ativo sem conta, **`linkedAt` exige `userId` (092b)**. Gatilho `members_link_guard`: ids/`familyId`/`createdByMemberId`/`linkedAt` imutáveis; vínculo só com GUC `app.link_member` (094b). `invitations.memberId` sem uso até a 094a | migrações `20261030020000/020100`, `20261031000000` |
| 22 | **Nome exibido único** | `memberDisplayName`/`toMemberRef` (`display-name.ts`): `members.name` > `user.name` > parte local; conta excluída "Conta excluída"; `MemberRef.unlinked`; `samePerson` nunca iguala nulos. Teste estático: sem `user.name ??`/`localPart(` fora da fonte; `pendingEmail` só em `familia/**`, `privacidade/delete-*` e tela Família | `display-name.ts` |
| 23 | **Sem conta nas leituras (092a)** | `ONLY_MEMBER`/`SOLE_MEMBER`/`HAS_OTHER_MEMBERS` contam só ativos COM conta; remover sem conta zera `pendingEmail` com `removedAt`, anonimiza convites do cadastro (`deleted+<id>@invalid.local`) e apaga idempotência com o e-mail; `ownerStanding`, exportação e sugestões ignoram `userId` nulo (SEC-050/058); `endUserSessions("")` = 0; excluir a conta zera `members.name`. D-033-4 REVOGADA pela 093b: o Admin cria "Só meu" em nome do sem conta ativo e é tutor dele (membro comum: 403 `PERSONAL_ON_BEHALF_FORBIDDEN`); ver [so-meu.md](so-meu.md) | `removal.ts`, `ownership.ts`, `privacidade/*` |
| 24 | **Cadastrar sem conta (092b)** | `POST /api/v1/members` `{name, email?}` (`.strict()`, 201), só ADMIN, sob `lockFamilyAdmins`, `Idempotency-Key`; na família do ator, `joinedAt` do servidor. Nome saneado (NFKC, sem invisíveis), 2..60, único entre ativos sem caixa/acentos (inclui nome de quem tem conta): 409 `NAME_TAKEN`; reservados ("Conta excluída", "Administrador", "Sem acesso ao app"...): 422 `NAME_RESERVED`; 20 sem conta ativos: 422 `UNLINKED_MEMBER_LIMIT`. E-mail opcional: de membro com conta 409 `DUPLICATE_MEMBER`; de outro cadastro 409 `EMAIL_BELONGS_TO_OTHER_MEMBER` (inclui corrida); convite comum pendente 409 `EMAIL_HAS_PENDING_INVITATION` (vencido vira EXPIRED); de ex-membro ou de OUTRA família é permitido. Sem e-mail, cota, sessão ou concessão. `MEMBER_CREATED` com `{hasEmail}` apenas. Erro de corpo (Zod) = 400 `VALIDATION_ERROR` | `familia/members.ts` |
| 25 | **Convite x cadastro (092b)** | `createInvitation` ganhou `lockFamilyAdmins` e recusa, sem gastar cota, o e-mail que é `pendingEmail` de um ativo: 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER`. Cadastro e convite simultâneos do mesmo e-mail: um só sobrevive | `invitations/service.ts` |
| 27 | **Titular e selo (093a)** | Titular sem conta (conta ou cartão) só por ADMIN: não-ADMIN 422 `UNLINKED_OWNER_ADMIN_ONLY` (`path: ownerMemberId`) em `createAccount`/`createCard`/troca de titular do cartão; titular candidato = ativo da família (outra família ou ex-membro: 422 `INVALID_REFERENCE`). Cartão cujo titular ATUAL é sem conta ativo: só ADMIN troca (não-ADMIN 403 `CARD_OWNER_ONLY` "Só um Administrador pode trocar o titular deste cartão."; `CARD_OWNER_CHANGED` com o ator real); `CARD_OWNER_ONLY` vem antes. Selo `UnlinkedBadge` ("Sem acesso ao app", `member-unlinked`) e `memberOptionLabel` ("Ana · sem acesso ao app") nos seletores (Nova conta/cartão com opção `disabled` "(só Administrador)" para MEMBER; filtro Membro; edição), chips de pagador/responsável, Contas, Cartões, A pagar, detalhe, Acerto e Regra; ex-membro sem conta não leva selo | `display-name.ts`, `contas|cartoes/service.ts`, `components/ui/unlinked-badge.tsx` |
| 26 | **Leitura e tela (092b)** | `GET /family`: `pendingEmail` só para ADMIN e só em sem conta (chave ausente para MEMBER); `email: null`, `canChangeRole: false`. Botão "Cadastrar membro" (só ADMIN) abre drawer (Nome, E-mail opcional, nota "não terá acesso ao app", aviso de divisão com acerto ligado: EQUAL inclui o cadastrado nas despesas NOVAS; PROPORTIONAL fica `stale`, 0% permitido); selo "Sem acesso ao app"; menu só com Remover; histórico "{ator} cadastrou {alvo} (sem acesso ao app)" | `add-member-drawer.tsx`, `familia-screen.tsx` |

## c) Invariantes
1. Só `acceptInvitation` cria `Member` por convite ou grava `userId` em linha existente (SEC-004; gatilho + teste estático).
2. 1 `Member` ativo por usuário (índice parcial); `Member`/`FamilyEvent` nunca apagados (exceto exclusão da família).
3. Sempre >=1 ADMIN ativo: rebaixar/remover/sair sob `lockFamilyAdmins`.
4. Convites e cadastros escopados por `familyId` (outra família => 404); token de convite e de sessão só em hash; cotas consumidas na transação.
5. Remoção/reatribuição/arquivamento atômicos.
6. `pendingEmail` só sai para ADMIN; nunca em `MemberRef`, evento, exportação, MCP, IA ou log.

## d) Riscos aceitos
| ID | Risco | Razão |
| :-- | :-- | :-- |
| SEC-046/052 | Remoção dá ao Admin controle dos "Só meu" reatribuídos | Aviso na revisão |
| SEC-037 | Exclusões pedem só confirmação digitada | Decisão do usuário pendente |
| U5 | Dados de ex-membro mantidos até excluir a conta | Preserva histórico; LGPD a validar |
| R7 | Membro com conta (não ADMIN) não passa o próprio cartão a um sem conta (SDD-034 R7): arquiva e o ADMIN recria | TL-093-4 |
| R3 | Até a 094a o e-mail cadastrado não convida pela UI (409; editar/remover e-mail é 095) | Ordem 092b ➔ 093 ➔ 094a |

## e) Em andamento / pendências
- **092b implementada (TASK-094), aguarda validação do Gestor.** 093a (TASK-097) e 093b (TASK-098, "Só meu", SEC-059a/066b/067; aguarda validação, revisão do TL e reteste da Segurança) implementadas. Próximas ("Só meu", SEC-059/066b/067), 094a (convite vinculado, SEC-061), 094b (aceite, nome escolhido, SEC-062/063/064), 095 (editar). SDD-034 (093a/093b) aprovado (D-GES-66) e implementado; SDDs 094..095 por escrever (TL).
- D-GES-63: nome do cadastro é rótulo provisório; o aceite grava o nome escolhido em `members.name` (nunca em eventos); só o Admin cria "Só meu" em nome do sem conta; remoção/edição anonimiza e-mails dos convites do cadastro.
- Usuário (não bloqueiam): SEC-060 "Entra na divisão?" (hipótese: só o aviso), SEC-062(3) "Desvincular conta" (hipótese: não), `ALLOWED_SIGNUP_EMAILS`, SEC-037. LGPD: titular sem conta (talvez criança, art. 14) exerce direitos via Admin; citar em `/privacidade` (Gestor).
- Fase 2 da SEC-018 (`prisma/pending/20261027000000_*`, checklist 9.7).
- UI da 092b/093 verificada no navegador (QA exploratório): selo "Sem acesso ao app" quebra de linha no mobile (/familia, /contas, /cartões); aviso de divisão do cadastro só com nome e com altura reservada; `Drawer` ganhou `returnFocusId` (Esc devolve o foco ao botão "Cadastrar membro"); aria-label do pagador/responsável inclui "(sem acesso ao app)" (E2E usa regex).
- Não verificado: UI do aviso da remoção (SEC-046); migração `20261031000000` fora de produção.

## f) Mapa de fontes
Código: `src/modules/familia/{service,manage,removal,repo,schemas,hooks,settings,members,display-name}.ts`, `familia/invitations/*`, `src/lib/auth/*`, `src/proxy.ts`, `modules/cron/retention.ts`; rotas `src/app/api/v1/{families,family,members,invitations,me/invitations,me/sessions/revoke-others}`; telas `src/app/{convites,(app)/familia,(public)/convite/[token]}`; `privacidade/delete-*`.
Testes: int `us-093a-titular-e-seletores` (10) e `us-093a-harness-acerto-sem-conta`, `us-092b-cadastrar-membro` (14), `us-092a-*` (20 + harness 240), `sec036-travas`, `us-00{1,2,3}-*`, `u6-*`, `us-039-*`, `sec040-*`, `us-034-*`, `us-035-*`, `sec018-sessao`, `sec017d-*`; unit `familia/{display-name,create-unlinked-member-schema}`, `meta/member-reads`, `auth/auth-pure`; E2E `US-092-cadastrar-membro-sem-conta.feature`, `US-093-membro-sem-conta-atribuicao.feature` (7 cenários da 093a).
Docs: [ADR-033](../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md), [SDD-033](../tech-lead/sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md); SDD-003/012/028; ADR-012/019; "Só meu": [so-meu.md](so-meu.md).

Divergências docs x código (código vence):
1. ADR-019: remoção não encerra sessões; o código encerra (DEV-91).
2. SDD-003 §5.5-5.6: vínculo automático no login; revogado (SEC-004).
3. SDD-003: sem teto por pessoa; vigente família E pessoa (SEC-040).
4. SDD-028 §6: o schema ainda mantém `sessionToken` (fase 2 pendente).
5. SDD-033: erro de corpo 422 e `NAME_RESERVED` no Zod; o código: 400 no Zod, 422 `NAME_RESERVED` no serviço.
6. SDD-034 §3.1/§7.4: o Extrato só tem o filtro "Membro" (não existe "Quem pagou" separado); o selo/rótulo entra nele (DEV-162). SDD-034 §5 U2/U4 divergem do motor (DEV-161, ver acerto-divisao).
