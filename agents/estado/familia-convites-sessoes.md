# Estado vigente: Família, convites, membros e sessões

Atualizado: 2026-10-30 (US-092a implementada: modelo do membro sem conta e leitura segura; 092b em diante não iniciadas). Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit.

## a) Resumo para o usuário
- Cadastro: login só com Google (e-mail verificado). Com `ALLOWED_SIGNUP_EMAILS` preenchida só e-mails da lista CRIAM conta (convite não contorna); vazia = aberto. Hoje a lista é ação do usuário na Vercel (checklist 9.1).
- Convite: Administrador convida por e-mail (válido 7 dias). Vínculo só no aceite explícito do convidado em `/convites`; quem já tem família não aceita (409). Tetos: 5/h e 10/dia por família e por pessoa que convida; reenvio máx. 3.
- Papéis: Administrador e Membro; a família sempre mantém ao menos 1 Administrador. Remoção/saída exige revisar contas, cartões, previstas e acerto em aberto; o Administrador que remove recebe aviso de que passa a controlar os "Só meu" nas contas reatribuídas.
- Sessão: 30 dias sem uso, 90 dias absolutos; removido perde todas as sessões na hora; quem sai mantém a atual.
- Membro sem conta (NEED-028, US-092..095): modelo **aceito** no [ADR-033](../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (com as condições da revisão da Segurança, SEC-058..068); SDD da US-092 pronto ([SDD-033](../tech-lead/sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md)). **092a implementada (TASK-093, aguardando validação do Gestor)**: o banco e a leitura já aceitam membro sem conta (regras 21-23), mas **nenhum caminho o cria ainda** (rota `POST /members` é a 092b), então nada muda para o usuário.
- Aberto: fase 2 da SEC-018 (remover `sessionToken` legado) agendada ao Gestor; definir `ALLOWED_SIGNUP_EMAILS` na Vercel; SEC-037 (reautenticação nas exclusões) sem decisão do usuário.

## b) Regras vigentes
| # | Regra | Valor / comportamento | Origem |
| :-- | :-- | :-- | :-- |
| 1 | Login | Google; `email_verified` obrigatório (`/login?error=EmailNotVerified`) | SDD-003, US-001 |
| 2 | Cadastro restrito | `ALLOWED_SIGNUP_EMAILS` (CSV normalizado): só e-mail da lista cria usuário (`SignupRestricted`); usuário já existente entra mesmo fora da lista; vazia = aberto | D-GES-42 U6 |
| 3 | E-mail | Sempre trim + minúsculas (`normalizeEmail`) | SDD-003 §1 |
| 4 | Criar família | Quem não tem vínculo ativo; vira ADMIN; categorias padrão + regra de divisão EQUAL; 1 vínculo ativo por usuário (índice parcial) | US-002 |
| 5 | Convidar | Só ADMIN; papel padrão MEMBER (pode ADMIN); validade 7 dias; só o hash do token é guardado; e-mail sai após o commit, falha vira `emailStatus=FAILED` e a UI oferece copiar o link | US-003, D-GES-07, ADR-012 |
| 6 | Convite duplicado | Já membro ativo: 409 `DUPLICATE_MEMBER`; pendente igual: 409 `DUPLICATE_INVITATION`; vencido libera reconvite (vira EXPIRED); recusado pode ser reconvidado | US-003 |
| 7 | Tetos de convite | Por família 5/h e 10/dia (conta convites criados, advisory lock); por PESSOA convidante 5/h e 10/dia somando todas as famílias, inclusive excluídas, e contando reenvio com e-mail; excesso = 429 `INVITATION_LIMIT` sem consumir cota | SEC-014/027/040 |
| 8 | Copiar link / Reenviar | Ambos ROTACIONAM o token (link anterior morre), validade original mantida; só reenviar conta (máx. 3, depois 422 `RESEND_LIMIT_REACHED`); vencido 422, cancelado 409; reenvio grava `INVITATION_RESENT` | US-039 |
| 9 | Aceite explícito | `POST /me/invitations/{id}/accept` é o ÚNICO ponto que vincula. Exige `emailVerified`; convite de outro e-mail = 404 uniforme; token opcional (divergente 422); já tem família = 409 `ALREADY_IN_FAMILY` (convite segue PENDING); vencido 410; concorrência por UPDATE condicional; grava `MEMBER_JOINED`. Abrir o link, login e gate NUNCA vinculam | SEC-004, SDD-028 §1 |
| 10 | Recusar | `DECLINED`, sem vínculo; Administrador vê "Recusado" por 30 dias. Limite 20 aceites/recusas por usuário/hora (429) | SEC-004 |
| 11 | Gate de entrada | Com vínculo: segue. Sem: convite válido => `/convites`; convite vencido há <=30 dias => `/onboarding?notice=invite_expired`; remoção ainda não avisada => `/api/auth/membership-ended`; senão `/onboarding` | SDD-028 §1.1 |
| 12 | Papéis | Só ADMIN convida, cancela, remove, muda papel, renomeia, exclui família. Rebaixar/remover o último ADMIN = 422 `LAST_ADMIN`. Trocar papel de outra pessoa encerra as sessões dela | US-034, SEC-018 |
| 13 | Sessão | Auth.js com sessão em banco, cookie só com token, banco guarda `sha256`. Ociosidade 30 d (renovação deslizante, a cada >=1 d), absoluto 90 d desde `createdAt`; vencida = linha apagada. Conta excluída (`deletedAt`) nunca autentica. "Encerrar as outras sessões" apaga todas menos a atual | SEC-018, RN-012.3, US-078 |
| 14 | Remover membro | Só ADMIN, alvo ativo da mesma família; `Member` nunca é apagado (`removedAt`, `removalKind=REMOVED`); tudo ou nada sob lock de família, pendências reavaliadas dentro do lock; sessões do removido (todos os aparelhos) marcadas `endedAt` na hora; concessões de assistente revogadas; aviso único de acesso encerrado por aparelho | US-035, ADR-019, DEV-91 |
| 15 | Sair | Qualquer membro sobre si; bloqueios `ONLY_MEMBER` e `LAST_ADMIN`; mantém a sessão atual (vê "Você saiu"); sem aviso de acesso encerrado; `plannedTo` na saída deve ser ADMIN ativo | US-035 |
| 16 | Pendências na remoção/saída | Conta com saldo != 0 ou cartão com fatura em aberto: reatribuir a membro ativo (`ACCOUNT_NEEDS_OWNER`/`CARD_NEEDS_OWNER`); sem pendência: arquivados. Previstas do alvo vão a `plannedTo` (padrão: quem remove). Acerto em aberto exige `acknowledgeSettlement` (`SETTLEMENT_NOT_ACKNOWLEDGED`). Destino inválido = `INVALID_REASSIGN_TARGET`. Erro geral 422 `REMOVAL_BLOCKED` | SDD-012 §4.3 |
| 17 | Aviso na revisão | `reassignNotice` na revisão: contas/cartões reatribuídos passam a quem remove (ou a quem o alvo escolher na saída), que controlará os "Só meu" lançados neles | SEC-046, D-GES-53 |
| 18 | Reconvite de ex-membro | Mesmo fluxo; volta como NOVO `Member` sem herdar histórico (ver so-meu.md para controle do que era dele) | US-035, SEC-049 |
| 19 | Ex-membros | Aparecem em `/family` só com nome/foto e data (nunca e-mail); excluídos marcados `deleted` | ADR-019 |
| 20 | Excluir minha conta / família | Fora desta área (ver Privacidade); relação: conta ativa sai pela mesma `removeMember(LEFT)`; bloqueios `SOLE_MEMBER`/`LAST_ADMIN`; família só por ADMIN único membro ativo | US-080/081, SEC-017c/d |
| 21 | **Membro sem conta (092a, ADR-033/SDD-033)**: `members.userId` anulável + `name`, `pendingEmail`, `linkedAt`, `createdByMemberId`; sem conta é sempre MEMBER (nunca ADMIN: 422 `UNLINKED_MEMBER_ROLE` em `PATCH /members/{id}`), com nome 2..60 e e-mail pendente minúsculo e único por família. Gatilho `members_link_guard` (search_path fixo): `userId`/`linkedAt`/`id`/`familyId`/`createdByMemberId` imutáveis; vínculo (NULL ➔ conta) só com a GUC `app.link_member` = id do membro (aceite, 094b), sem remoção, sem `pendingEmail`, com `linkedAt` e `name`. `invitations.memberId` (FK composta, único PENDING) existe, sem uso até a 094a. Enum `FamilyEventType` ganhou `MEMBER_CREATED/UPDATED/LINKED` (sem uso) | `prisma/migrations/20261030020000_us092_enum_member_events`, `20261030020100_us092_unlinked_member` |
| 22 | **Nome exibido único**: `memberDisplayName`/`memberFirstName`/`toMemberRef` (`familia/display-name.ts`): `members.name` > `user.name` > parte local do e-mail; conta excluída = "Conta excluída"; `MemberRef.unlinked` quando `userId` nulo (ex-membro sem conta leva `removed` e `unlinked`). `samePerson(a,b)` nunca iguala `null`/`undefined`. Teste estático (`tests/unit/meta/member-reads.test.ts`) proíbe `user.name ??`/`localPart(` fora da fonte e `pendingEmail` fora de `familia/**` e `privacidade/delete-*` | `display-name.ts` |
| 23 | **Sem conta nas contagens e leituras (092a)**: `ONLY_MEMBER`, `SOLE_MEMBER` e `HAS_OTHER_MEMBERS` contam só ativos COM conta; remover um sem conta nunca dá `ONLY_MEMBER`, não encerra sessão nem concessão, grava `pendingEmail = NULL` na mesma linha de `removedAt`, cancela e anonimiza (`deleted+<id>@invalid.local`) os convites do cadastro e apaga respostas de idempotência com o e-mail. `ownerStanding`: dono sem conta removido nunca "volta" (`ownerRemoved`); exportação e sugestões de categoria ignoram `userId` nulo nos conjuntos de ativos (SEC-050/058). `endUserSessions` com `userId` vazio devolve 0. `GET /family`: sem conta com `unlinked`, `email: null`, `canChangeRole: false` (sem selo na tela: é da 092b/093a). Excluir a conta zera `members.name`. D-033-4: até a 093b o sem conta ativo é "outro membro ativo" no "Só meu" (só DC/Lanç controlam; Admin cria "Só meu" em nome dele ➔ 403 `PERSONAL_ON_BEHALF_FORBIDDEN`) | `removal.ts`, `manage.ts`, `ownership.ts`, `privacidade/{export,delete-*}.ts`, `analise-ia/suggestions.ts` |

## c) Invariantes
1. Nenhum caminho além de `acceptInvitation` cria `Member` por convite (SEC-004); teste de reprodução em `us-003-convites`.
2. Uma pessoa tem no máximo 1 `Member` ativo (índice parcial `members(userId) WHERE removedAt IS NULL`); corrida de dois aceites termina com 1 vínculo.
3. Sempre existe >=1 ADMIN ativo: rebaixar/remover/sair rodam sob `lockFamilyAdmins` (advisory lock por família, reconfere ator ativo/ADMIN).
4. `Member` e `FamilyEvent` nunca são apagados (exceto exclusão da família); nenhuma FK `ON DELETE CASCADE` para `members`.
5. Toda leitura/escrita de convites é escopada por `familyId`; Admin de outra família => 404.
6. Token de convite e de sessão: só hash em repouso; cookie de sessão nunca volta em `/api/auth/session`.
7. Cotas de convite consumidas dentro da transação: pedido recusado/revertido não gasta cota.
8. Remoção, reatribuição e arquivamento são atômicos; falha no meio não persiste nada.

## d) Limitações e riscos aceitos
| ID | Risco | Razão do aceite |
| :-- | :-- | :-- |
| SEC-041 | Convites/reenvios ainda permitem algum volume de e-mail por pessoa | Risco desprezível após SEC-040 (D-GES-49) |
| SEC-046/052 | Remoção dá ao Administrador controle dos "Só meu" nas contas reatribuídas | Aceito + aviso na revisão (ver so-meu.md) |
| SEC-037 | Exclusões irreversíveis pedem só e-mail/nome digitado (sem reautenticação Google) | Decisão do usuário pendente; recomendação do TL: manter confirmação digitada + e-mail de aviso |
| ADR-019 §alternativas | Texto antigo dizia que a remoção não apagaria sessões | Superado por DEV-91: sessão do removido é encerrada (ver §f) |
| U5 | Dados de ex-membro são mantidos; anonimização só ao excluir a conta | Preserva histórico financeiro; prazos de LGPD a validar juridicamente pelo usuário |
| Gate | Proxy checa só presença do cookie (otimista); autoridade é `requireSession`/`withApi` | Evita consulta ao banco no proxy (SDD-003 §3.4) |

## e) Em andamento / pendências
- Nada em implementação nesta área. 092b (cadastro: rota, drawer, selo, guarda do convite comum, saneamento/reservados/teto) e 093a..095 **não iniciadas**.
- **Aceito, parcialmente vigente (092a feita; resto não vigente) (ADR-033; decisões do usuário Q-TL-U1..U5 em 2026-10-30, D-GES-63):** membro sem conta = `members.userId NULL` (+ `name`, `pendingEmail`, `linkedAt`, `createdByMemberId`), nunca ADMIN, não é ex-membro; convite vinculado (`invitations.memberId`) assumido no aceite por `UPDATE` condicional sob lock da família, sem tocar o ledger; contagens `ONLY_MEMBER`/`SOLE_MEMBER`/`HAS_OTHER_MEMBERS` passam a ignorar cadastros sem conta.
  - U1: EQUAL inclui o cadastrado nas despesas novas, com aviso no cadastro; quem não divide usa PROPORTIONAL com 0%. U2: ninguém torna "Só meu" uma dividida paga pelo sem conta até ele assumir. U3: só o Administrador cria "Só meu" em nome dele. U5: a remoção (e, na 095, a edição) anonimiza o e-mail de todos os convites do cadastro; `INVITATION_RESENT` deixa de gravar e-mail (SEC-061).
  - **U4 (mudou):** o nome do cadastro é rótulo provisório; no aceite a pessoa escolhe o próprio nome, gravado em `members.name` (não em `User.name`, que o Google reescreve a cada login); nomes nunca vão para `family_events`/revisões, então todo histórico, relatório e exportação mostram o nome escolhido; excluir a conta zera `members.name` ("Conta excluída").
  - Revisão da Segurança (2026-10-30, SEC-058..068) incorporada: comparação de pessoa nunca com `userId` nulo nem `undefined` no `where` (SEC-058, na 092a); Admin nunca se põe como pagador no lugar do sem conta e acerto com credor sem conta não vai para conta do devedor (SEC-059); `INVITATION_RESENT` sem e-mail (SEC-061); nome escolhido saneado/único/reservados, só o próprio renomeia (SEC-063); gatilho com `IS DISTINCT FROM` e GUC `app.link_member` (SEC-065); teto de 20 cadastros (SEC-068). **Pendentes do usuário (não bloqueiam a 092a):** SEC-060 "Entra na divisão?" no cadastro (hipótese: só o aviso da U1) e SEC-062(3) "Desvincular conta" (hipótese: não, com aviso aos Admins no vínculo).
  - SDD-033 (US-092, 5 pts: 092a modelo 3 + 092b cadastro 2) **aprovado para Dev**; corrige junto o bug latente do `ownerStanding` e da exportação com `userId` nulo. Próximos SDDs: 093a, 093b, 094a, 094b, 095 (seguem o mapa de achados SEC-058..068 do SDD-033 §5). Estimativa total TL: 23 pts.
- Fase 2 da SEC-018: `prisma/pending/20261027000000_sec018_drop_plain_session_token` ainda pendente; `Session.sessionToken` legado existe no schema. Só >=1 dia após a fase 1 em produção, rodar `scripts/sec018-phase2-check.ts`; tarefa do Gestor (D-GES-44, checklist Vercel 9.7).
- Usuário: definir `ALLOWED_SIGNUP_EMAILS` na Vercel (checklist 9.1) antes de divulgar; decidir SEC-037.
- Cron `retention.ts`: sessões encerradas apagadas após 7 dias; convites após 90 dias.
- Não verificado: UI no navegador do fluxo de aviso/revisão da remoção após SEC-046.

## f) Mapa de fontes
Código: `src/modules/familia/{service,manage,removal,repo,schemas,hooks,settings,roles}.ts`; `familia/invitations/{service,repo,schemas,email,constants}.ts`; `src/lib/auth/{config,session,session-adapter,membership-ended,email,sign-out}.ts`; `src/proxy.ts`; `src/modules/cron/retention.ts`; rotas `src/app/api/v1/{families,family,members/[id]{,/remove,/removal-review},invitations,me/invitations,me/sessions/revoke-others}`; telas `src/app/{convites,(app)/familia,(public)/convite/[token],(public)/login}`; `privacidade/{delete-account,delete-family}.ts`.
Testes (`tests/integration/`): `us-092a-modelo-membro-sem-conta` (20), `us-092a-harness-sem-conta` (240 famílias com 1..2 sem conta), `sec036-travas` (todas as funções do schema), `us-001-auth`, `u6-cadastro-lista`, `us-002-familia`, `us-003-convites`, `us-039-convites-reenvio`, `sec040-convites-por-pessoa`, `us-034-familia-papeis`, `us-035-remover-membro`, `sec018-sessao`, `sec017d-excluir-familia`; `tests/unit/auth/auth-pure.test.ts`, `tests/unit/familia/display-name.test.ts`, `tests/unit/meta/member-reads.test.ts`.
Docs (membro sem conta, não vigente): [ADR-033](../tech-lead/adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md), [SDD-033](../tech-lead/sdd/SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md), [US-092](../product-owner/backlog/stories/US-092-cadastrar-membro-sem-conta.md)..US-095.
Docs: [US-001](../product-owner/backlog/stories/US-001-login-com-google.md), [US-002](../product-owner/backlog/stories/US-002-criar-familia.md), [US-003](../product-owner/backlog/stories/US-003-convidar-membro.md), [US-034](../product-owner/backlog/stories/US-034-editar-familia-e-papeis.md), [US-035](../product-owner/backlog/stories/US-035-remover-membro-e-sair-da-familia.md), [US-039](../product-owner/backlog/stories/US-039-polimento-da-homologacao.md), [US-078](../product-owner/backlog/stories/US-078-encerrar-as-outras-sessoes.md), [US-080](../product-owner/backlog/stories/US-080-excluir-minha-conta.md), [US-081](../product-owner/backlog/stories/US-081-excluir-a-familia.md); [SDD-003](../tech-lead/sdd/SDD-003-auth-familia-convite.md), [SDD-012](../tech-lead/sdd/SDD-012-manutencao-de-cadastros.md), [SDD-028 §1, §6](../tech-lead/sdd/SDD-028-correcoes-de-seguranca-grupo-b.md); ADR-002, ADR-012, [ADR-019](../tech-lead/adrs/ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md), ADR-032; relação com "Só meu" e ex-membro: [so-meu.md](so-meu.md).

| Regra | Origem |
| :-- | :-- |
| Convite 7 dias | D-GES-07 |
| Aceite explícito, sessão 30/90, lista de e-mails | D-GES-42 (U1, U2, U6), SEC-004/018, DEV-88..96 |
| Sessão do removido encerrada, aviso por aparelho | DEV-91, D-GES-44 |
| Tetos de convite | SEC-014/027 (família), SEC-040 (pessoa), D-GES-48/49 |
| Aviso na remoção | SEC-046, D-GES-53/54 |
| Fase 2 da sessão | D-GES-44, checklist-vercel-producao 9.7 |

Divergências docs x código (código vence):
1. ADR-019 (alternativas rejeitadas) diz que a remoção não encerra sessões; o código as encerra (`endUserSessions`, DEV-91, SDD-028 §6.2).
2. US-003/SDD-003 §5.5-5.6 descrevem vínculo automático no login/gate; revogado por SEC-004: só `acceptInvitation` vincula.
3. SDD-003 cita convite sem teto por pessoa; vigente: teto por família E por pessoa (SEC-040) e reenvio com e-mail conta.
4. SDD-028 §6 fala em 018b limitando a coluna legada; o schema ainda mantém `sessionToken` (fase 2 não promovida).
