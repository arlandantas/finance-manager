# Estado vigente: Privacidade e LGPD (direitos do titular, retenção, exclusão, política)

Atualizado: 2026-10-26. Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit. A regra de exportação do "Só meu" está em [so-meu.md](so-meu.md) (§b "Exportação"): aqui só se resume.

## a) Resumo para o usuário
- Direitos implementados: baixar meus dados (JSON, 3 por dia), excluir minha conta (anonimiza; histórico financeiro da família permanece) e excluir a família (apaga tudo, só o único membro ativo Administrador). Página pública `/privacidade` com a tabela de retenção montada das mesmas constantes do expurgo.
- Ciclo de segurança da LGPD (SEC-017a..e, revisão com SEC-029..037) fechado: todos corrigidos, exceto SEC-035 (aceito).
- O texto de `/privacidade` é RASCUNHO do PO (`POLICY_IS_DRAFT=true`, faixa visível). Nada foi validado juridicamente.
- Decisões que dependem do usuário: (1) aprovar o texto, definir `PRIVACY_CONTACT_EMAIL`, virar `POLICY_IS_DRAFT=false` e ajustar `POLICY_UPDATED_ON`; (2) validação jurídica dos prazos (§e); (3) reautenticação nas exclusões (SEC-037, recomendação: manter confirmação digitada + e-mail de aviso); (4) veto ao aceite de SEC-035.
- Nada em implementação nesta área.

## b) Regras vigentes
| Direito | Rota / tela | Regra |
| :-- | :-- | :-- |
| Baixar meus dados | `GET /api/v1/me/export`; Perfil > "Baixar meus dados" ("Preparando…") | JSON `meus-dados-AAAA-MM-DD.json`, `Content-Disposition: attachment`, `ExportSchema` `.strict()` `version:1`, centavos inteiros. Transação READ ONLY. Não aplica "ocultar valores". |
| Excluir minha conta | `POST /api/v1/me/delete-account`; Perfil > `/perfil/excluir-conta`; destino `/conta-excluida` | Corpo `.strict()`: `confirmEmail` (igual ao e-mail da conta, sem caixa/espaços) + pendências da saída (`acknowledgeSettlement`, `reassign`, as mesmas de `RemoveMemberSchema`/US-035). |
| Excluir a família | `POST /api/v1/family/delete`; `/familia/excluir`; destino `/onboarding?deleted=1` | Corpo `.strict()`: `confirmFamilyName` (igual ao nome atual, aparado). Só Administrador ativo que é o ÚNICO membro ativo. |
| Política | `/privacidade` (pública; links no rodapé do login e no Perfil) | Versão e data visíveis (`POLICY_VERSION=1`, `POLICY_UPDATED_ON=2026-10-26`); contato por `PRIVACY_CONTACT_EMAIL` (vazio mostra marcador). |

Exportação (conteúdo):
| Quem | Recebe |
| :-- | :-- |
| Membro ativo | perfil (nome, e-mail, criação), vínculos (todas as famílias), consentimentos de IA, conexões do assistente (sem tokens), família atual completa (membros por nome, contas, cartões, categorias, lançamentos, previstas, recorrentes, acertos). |
| Ex-membro (família anterior) | só lançamentos em que foi autor ou pagador, e só os nomes de quem aparece neles (nunca e-mail, papel, contas ou cartões). |
| Filtros comuns | "Só meu" alheio nunca sai, nem para ex-membro (SEC-029; regra em so-meu.md). Observação de dividida/prevista de ex-membro alheio sai `null` (SEC-050). Nome de membro sem nome = parte local do e-mail (`localPart`). Nunca e-mail de terceiros, tokens de sessão/OAuth/Google. |
| Limites | 3 por dia por pessoa (429 `EXPORT_LIMIT`; janela fixa de 24 h por `rate-limit.hit`). Teto 50 MB (`EXPORT_MAX_BYTES`, sobrescrevível por `PRIVACY_EXPORT_MAX_BYTES`): 413 `EXPORT_TOO_LARGE` orienta o suporte. 5xx e 413 devolvem a cota (`refund`). Lançamentos e divisões carregados em lotes de 5000 (SEC-032). |

Excluir minha conta, na ordem (uma transação, `FOR NO KEY UPDATE` no usuário):
| # | Efeito |
| :-- | :-- |
| 0 | Conta já excluída: idempotente por ESTADO (`{deleted:true}`, rota `idempotent:false` por causa do FK/deadlock), apenas varre idempotência. E-mail divergente: 422 `EMAIL_MISMATCH`. |
| 1 | Vínculo ativo: bloqueia `SOLE_MEMBER` (409; excluir a família antes) e `LAST_ADMIN` (409; passar a administração); senão sai pelo `removeMember(..., "LEFT")` (US-035). |
| 2 | Consentimentos de IA vigentes dados por ele: evento `DISABLED` + `AI_CONSENT_CHANGED` (`reason: ACCOUNT_DELETED`). Grants MCP ativos revogados (`MEMBER_REMOVED`), tokens e pedidos de autorização apagados, limites do assistente apagados. |
| 3 | Apaga `sessions` (todos os aparelhos), `accounts` (Google), `verification_tokens` do e-mail; `scrubIdempotency`. |
| 4 | E-mail antigo vira `deleted+<userId>@invalid.local` em convites NÃO pendentes e em eventos `INVITATION_RESENT` (GUC `app.anonymize_user`, escopada por titular). Convites PENDENTES ficam e valem para a conta nova. |
| 5 | Rede de segurança: vínculos ainda ativos recebem `removedAt` + `LEFT`. |
| 6 | `users`: `name="Conta excluída"`, `email` anonimizado, `image=null`, `emailVerified=null`, `deletedAt=now`. O histórico (membros, lançamentos, eventos) continua apontando para a linha (ADR-019). Rótulo "ex-membro (conta excluída)" decidido por `deletedAt`, não pelo nome (SEC-033). |
| Depois | Aviso por e-mail ao endereço ANTIGO, só na 1ª exclusão, melhor esforço pós-commit (`sendDeletionNotice`; falha só vira log). Login posterior com o mesmo Google cria usuário NOVO e vazio. |

Excluir a família: `lockFamilyAdmins`, `families FOR UPDATE`; 409 `HAS_OTHER_MEMBERS`; 422 `NAME_MISMATCH`; apaga idempotência ligada (por colunas/identificadores próprios) e então as tabelas de `FAMILY_TABLES_DELETE_ORDER` (26 tabelas com `familyId`, filhas antes das mães) e `families`, sob `app.purge_family=<familyId>` (exceção das travas `forbid_mutation`, só DELETE, só dessa família, só na transação). Ex-membros ficam sem vínculo; usuários continuam existindo. Aviso por e-mail ao Administrador. Tabela nova com `familyId` sem entrada na lista reprova o teste (`information_schema`).

Retenção (tabela do `/privacidade`, gerada de constantes; teste amarra texto e código):
| Dado | Prazo | Mecanismo |
| :-- | :-- | :-- |
| Sessões | 30 dias sem uso / 90 dias absolutos; encerradas por remoção: 7 dias | cron `auth:purge-sessions` (≤ 1 dia) |
| Tokens de verificação vencidos | ≤ 1 dia | cron |
| Convites encerrados/vencidos | 90 dias após a última data do status | cron `familia:purge-invitations` |
| Idempotência | 24 h | cron `api:purge-idempotency` (e na exclusão, na hora) |
| Uso e análises de IA | 24 meses (`AI_RETENTION_MONTHS`); a família apaga análises antes | `ia/purge.ts` |
| Auditoria do assistente (MCP) | 12 meses (365 d) | `mcp/purge.ts` |
| Tokens Google (`accounts`) | não guardados (null no `linkAccount`; migração `sec017_strip_google_tokens`) | adaptador |
| Dados financeiros | enquanto a família existir; ao sair, o histórico fica com a família | ADR-019 |
| Nome, e-mail, foto | enquanto a conta existir; excluir anonimiza | 017c |

IA e privacidade (ver [ADR-029](../tech-lead/adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md), [SDD-022](../tech-lead/sdd/SDD-022-opt-in-privacidade-en-005.md)): opt-in por família e finalidade, só Administrador liga, versão do texto vigente; payload só de agregados por allowlist (sem nomes, ids, descrições, datas). Consentimento é append-only; desligar não apaga dados. Detalhe pertence à área "IA e assistente".

## c) Invariantes
1. Todas as rotas tiram usuário, família e papel SÓ da sessão; corpos `.strict()` (campo extra = 400); confirmação comparada com a própria conta/família (sem IDOR/BOLA, revisão LGPD).
2. Conta excluída nunca autentica: `findSessionUser` recusa `deletedAt` (401 e apaga a sessão); login de teste recusa (403 `ACCOUNT_DELETED`, nada regravado) (SEC-030).
3. Exclusões apagam na hora a idempotência ligada (a janela de 24 h não vale para PII de excluídos, SEC-031). Alcance por colunas próprias: UUIDs e e-mail completo em qualquer linha; NOME só nas linhas dos co-membros (SEC-039). Nunca por trecho de texto em toda a tabela.
4. Exclusão da família é a única exceção a "nada é apagado"; a exceção é escopada por `familyId` e por transação; `UPDATE` em `transaction_revisions`/`family_events` segue bloqueado.
5. Funções de trava têm `search_path=pg_catalog, public`; `app.anonymize_user` só aceita trocar o e-mail DAQUELE titular pelo anonimizado (SEC-036, migração `20261027030000`).
6. Exportação é READ ONLY e nunca contém e-mail de terceiros, tokens, "Só meu" alheio.
7. Prazos do texto e do comportamento saem das mesmas constantes (`policy.ts` importa de `cron/retention`, `ia/purge`, `auth/session`).
8. `?deleted=`/`?left=` nunca exibem texto da URL; só sinalizador `1` (SEC-034).

## d) Limitações e riscos aceitos
| ID | Risco | Razão do aceite |
| :-- | :-- | :-- |
| SEC-035 | Cota de exportação: janela fixa (00:00 UTC) permite 6 downloads em 2 min na virada; GET cruzado de outro site consome a cota da vítima | Informativo (D-GES-46): sem vazamento (sem CORS, arquivo cai no navegador da vítima). Correção possível: exigir `Sec-Fetch-Site: same-origin`/janela deslizante. Sujeito a veto. |
| SEC-037 | Exclusões sem reautenticação (só digitar e-mail/nome + aviso por e-mail) | Decisão do usuário pendente; aviso por e-mail implementado. |
| (info) | Corrida exclusão da família x aceite de convite: aceite devolve 500 cosmético (FK); ninguém fica ligado a família inexistente | Sem efeito de segurança. |
| (info) | Repetir a mesma `Idempotency-Key` após excluir a família dá 403 `NO_FAMILY` (checagem de família vem antes) | UX; sem risco. |
| (info) | Arquivo ainda montado em memória (validado por Zod e serializado), não em stream; 3 exportações simultâneas perto do teto podem estourar a função serverless | Não medido em produção; teto 50 MB. |
| (info) | Texto livre digitado por usuários (descrições, nomes de contas) permanece no histórico de ex-membros/conta excluída | Previsto no ADR-019 (livro-caixa da família). |
| (info) | Role da aplicação pode ser dona das tabelas em produção (as travas protegem de erro, não de quem tem a credencial) | Não verificado no Prisma Postgres. |

## e) Em andamento / pendências
- Usuário/jurídico: aprovar o texto, definir `PRIVACY_CONTACT_EMAIL`, virar `POLICY_IS_DRAFT=false` e ajustar `POLICY_UPDATED_ON`/`POLICY_VERSION` ([checklist Vercel 9.3 e 9.6](../manager/checklist-vercel-producao.md)).
- Prazos a validar juridicamente (U5, D-GES-42; nenhum validado): sessões 30/90 d; convites 90 d; idempotência 24 h; IA 24 meses; auditoria MCP 12 meses; permanência indefinida dos dados financeiros de ex-membro e de conta excluída "enquanto a família existir"; prazo de resposta a pedidos por e-mail (o suporte atende exportação acima de 50 MB). Também: base legal, DPO/encarregado, canal de contato e transferência internacional (hospedagem e provedor de IA) NÃO constam da política atual.
- Decisão do usuário: SEC-037 (reautenticação); veto a SEC-035.
- Não verificado: login Google real após exclusão cria usuário novo (só simulado); revogação MCP real com claude.ai; aplicação da migração `20261027030000` e role do banco em produção; UI de `/perfil/excluir-conta` e `/familia/excluir` no navegador depois das últimas rodadas.
- Fora desta área e não coberto: backups do banco (o apagamento definitivo não alcança cópias) e logs de infraestrutura.

## f) Mapa de fontes
Código: `src/modules/privacidade/{export,export-schema,delete-account,delete-family,deletion-notice,policy}.ts`; rotas `src/app/api/v1/me/{export,delete-account}/route.ts`, `src/app/api/v1/family/delete/route.ts`; telas `src/app/perfil/{perfil-screen.tsx,excluir-conta/}`, `src/app/privacidade/page.tsx`, `src/app/conta-excluida/page.tsx`, `src/app/(app)/familia/excluir`; retenção `src/modules/cron/{retention,purge}.ts`, `src/modules/ia/purge.ts`, `src/modules/mcp/purge.ts`; `src/lib/deleted-account.ts`, `src/lib/auth/{session,dev-login}.ts`; IA: `src/modules/ia/{consent,consent-texts}.ts`.
Testes: `tests/integration/` `sec017a-retencao`, `sec017b-exportar-dados`, `sec017c-excluir-conta`, `sec017d-excluir-familia`, `sec029-032-exportacao`, `sec030-033-conta-excluida`, `sec031-idempotencia-excluidos`, `sec039-idempotencia-escopo`, `sec036-travas`, `sec037-aviso-exclusao`, `en005-consentimento`; `tests/unit/privacidade/politica.test.tsx`.
Docs: US [079](../product-owner/backlog/stories/US-079-baixar-meus-dados.md), [080](../product-owner/backlog/stories/US-080-excluir-minha-conta.md), [081](../product-owner/backlog/stories/US-081-excluir-a-familia.md), [082](../product-owner/backlog/stories/US-082-pagina-de-privacidade.md); [SDD-028 §7](../tech-lead/sdd/SDD-028-correcoes-de-seguranca-grupo-b.md); [SDD-022](../tech-lead/sdd/SDD-022-opt-in-privacidade-en-005.md); ADR-019, [ADR-029](../tech-lead/adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md), ADR-032 §6; [revisao-lgpd-2026-10-25](../_historico/security/relatorios/revisao-lgpd-2026-10-25.md), [reteste-final-2026-10-25](../_historico/security/relatorios/reteste-final-2026-10-25.md); decisões D-GES-42 (U5), 45, 46, 48, 49 em [decisoes-do-gestor.md](../manager/decisoes-do-gestor.md); DEV-99, DEV-101..105 em [pedidos-ao-gestor.md](../manager/pedidos-ao-gestor.md); D-PO-86, 87, 89.

| Regra | Origem |
| :-- | :-- |
| Expurgos técnicos e tokens Google | SEC-017a, DEV-99 |
| Exportação; ex-membro | SEC-017b, DEV-101, SEC-029 (D-GES-46), SEC-032 |
| Exclusão de conta; conta nunca autentica; rótulo por `deletedAt` | SEC-017c, SEC-030, SEC-033 |
| Exclusão da família | SEC-017d, SEC-036 |
| Idempotência de excluídos | SEC-031, SEC-039 (D-GES-48) |
| Aviso por e-mail | SEC-037 (D-GES-46) |
| Política e retenção | SEC-017e, DEV-104, US-082 |

Divergências docs x código (código vence):
1. SDD-028 §7.3 prevê "stream em JSON"; o código monta o arquivo em memória (lotes só na leitura) e mede o tamanho após `JSON.stringify`.
2. SDD-028 §7.4: `DeleteAccountBodySchema` só com `confirmEmail` e rota idempotente; real: inclui as pendências da US-035 e a rota é `idempotent:false` (idempotência por estado).
3. SDD-028 §7.4 diz apagar "preferências"; real: apaga limites do assistente, tokens e pedidos MCP (não há outras preferências), e desliga consentimentos de IA do titular (não previsto no SDD).
4. SDD-028 §7.3 cita `tags` no arquivo; o schema de exportação não tem tags.
5. SDD-028 §7.1 prevê auditoria MCP/IA "sem mudança"; o texto e o expurgo fixam 12 meses (MCP) e 24 meses (IA).
6. SDD-028 §7.5 cita `SET LOCAL app.purge_family`; real: `set_config(..., true)` (equivalente).
7. US-082 e a revisão LGPD descrevem SEC-029..037 como abertos; todos corrigidos (D-GES-46/48), exceto SEC-035 aceito.
