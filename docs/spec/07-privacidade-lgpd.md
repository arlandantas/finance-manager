# Spec 07 — Privacidade e LGPD

Atualizado: 2026-10-26

## Resumo
- Direitos implementados: baixar meus dados (JSON, 3 por dia), excluir minha conta (anonimiza; histórico financeiro da família permanece), excluir a família (apaga tudo; só o único membro ativo Administrador). Página pública `/privacidade` com tabela de retenção gerada das constantes do expurgo.
- Ciclo SEC-017a..e (revisão SEC-029..037) fechado; todos corrigidos, exceto SEC-035 (aceito).
- Texto de `/privacidade` é RASCUNHO (`POLICY_IS_DRAFT=true`, faixa visível); nada validado juridicamente.
- Regra de exportação do "Só meu": ver spec do "Só meu"; aqui só se resume.

## Regras
| Direito | Rota / tela | Regra |
| :-- | :-- | :-- |
| Baixar meus dados | `GET /api/v1/me/export`; Perfil > "Baixar meus dados" | JSON `meus-dados-AAAA-MM-DD.json`, `Content-Disposition: attachment`, `ExportSchema` `.strict()` `version:1`, centavos inteiros. Transação READ ONLY. Não aplica "ocultar valores". US-100: `transferenciasPrevistas` (todas da família; sem "Só meu"; só ids, centavos, datas, situação, descrição) |
| Excluir minha conta | `POST /api/v1/me/delete-account`; `/perfil/excluir-conta`; destino `/conta-excluida` | Corpo `.strict()`: `confirmEmail` (igual ao e-mail da conta, sem caixa/espaços) + pendências da saída (`acknowledgeSettlement`, `reassign`, como `RemoveMemberSchema`/US-035) |
| Excluir a família | `POST /api/v1/family/delete`; `/familia/excluir`; destino `/onboarding?deleted=1` | Corpo `.strict()`: `confirmFamilyName` (igual ao nome atual, aparado). Só Administrador ativo que é o ÚNICO membro ativo |
| Política | `/privacidade` (pública; rodapé do login e Perfil) | Versão e data visíveis (`POLICY_VERSION=1`, `POLICY_UPDATED_ON=2026-10-26`); contato `PRIVACY_CONTACT_EMAIL` (vazio mostra marcador) |

Exportação:
| Quem | Recebe |
| :-- | :-- |
| Membro ativo | perfil (nome, e-mail, criação), vínculos (todas as famílias), consentimentos de IA, conexões do assistente (sem tokens), família atual completa (membros por nome, contas, cartões, categorias, lançamentos, previstas, recorrentes, acertos) |
| Ex-membro | só lançamentos em que foi autor ou pagador e os nomes de quem aparece neles (nunca e-mail, papel, contas ou cartões) |
| Filtros comuns | "Só meu" alheio nunca sai, nem para ex-membro (SEC-029). Observação de dividida/prevista de ex-membro alheio = `null` (SEC-050). Membro sem nome = parte local do e-mail. Nunca e-mail de terceiros nem tokens de sessão/OAuth/Google |
| Limites | 3/dia por pessoa (429 `EXPORT_LIMIT`; janela fixa 24 h por `rate-limit.hit`). Teto 50 MB (`EXPORT_MAX_BYTES`, `PRIVACY_EXPORT_MAX_BYTES`): 413 `EXPORT_TOO_LARGE` orienta o suporte. 5xx e 413 devolvem a cota (`refund`). Lotes de 5000 (SEC-032) |

Excluir minha conta (uma transação, `FOR NO KEY UPDATE` no usuário):
| # | Efeito |
| :-- | :-- |
| 0 | Já excluída: idempotente por ESTADO (`{deleted:true}`; rota `idempotent:false` por FK/deadlock), só varre idempotência. E-mail divergente: 422 `EMAIL_MISMATCH` |
| 1 | Vínculo ativo: bloqueia `SOLE_MEMBER` (409; excluir a família antes) e `LAST_ADMIN` (409; passar a administração); senão `removeMember(..., "LEFT")` (US-035) |
| 2 | Consentimentos de IA dados por ele: evento `DISABLED` + `AI_CONSENT_CHANGED` (`reason: ACCOUNT_DELETED`). Grants MCP revogados (`MEMBER_REMOVED`); tokens, pedidos e limites do assistente apagados |
| 3 | Apaga `sessions` (todos os aparelhos), `accounts` (Google), `verification_tokens` do e-mail; `scrubIdempotency` |
| 4 | E-mail antigo vira `deleted+<userId>@invalid.local` em convites NÃO pendentes e eventos `INVITATION_RESENT` (GUC `app.anonymize_user`, por titular). Convites PENDENTES ficam e valem para a conta nova |
| 5 | Rede de segurança: vínculos ainda ativos recebem `removedAt` + `LEFT` |
| 6 | `users`: `name="Conta excluída"`, `email` anonimizado, `image=null`, `emailVerified=null`, `deletedAt=now`. Histórico continua apontando para a linha (ADR-019). Rótulo "ex-membro (conta excluída)" por `deletedAt`, não pelo nome (SEC-033) |
| Depois | Aviso por e-mail ao endereço ANTIGO, só na 1ª exclusão, melhor esforço pós-commit (`sendDeletionNotice`). Novo login Google cria usuário NOVO e vazio |

Excluir a família: `lockFamilyAdmins`, `families FOR UPDATE`; 409 `HAS_OTHER_MEMBERS`; 422 `NAME_MISMATCH`; apaga idempotência ligada (colunas/identificadores próprios), depois `FAMILY_TABLES_DELETE_ORDER` (26 tabelas com `familyId`, filhas antes das mães) e `families`, sob `app.purge_family=<familyId>` (exceção de `forbid_mutation`: só DELETE, só dessa família, só na transação). Ex-membros ficam sem vínculo; usuários continuam. Aviso por e-mail ao Administrador. Tabela nova com `familyId` fora da lista reprova o teste (`information_schema`).

Retenção (tabela do `/privacidade`, gerada de constantes; teste amarra texto e código):
| Dado | Prazo | Mecanismo |
| :-- | :-- | :-- |
| Sessões | 30 dias sem uso / 90 absolutos; encerradas por remoção: 7 dias | cron `auth:purge-sessions` (≤1 dia) |
| Tokens de verificação vencidos | ≤1 dia | cron |
| Convites encerrados/vencidos | 90 dias após a última data do status | cron `familia:purge-invitations` |
| Idempotência | 24 h | cron `api:purge-idempotency` (e na exclusão, na hora) |
| Uso e análises de IA | 24 meses (`AI_RETENTION_MONTHS`); a família apaga análises antes | `ia/purge.ts` |
| Auditoria do assistente (MCP) | 12 meses (365 d) | `mcp/purge.ts` |
| Tokens Google (`accounts`) | não guardados (null no `linkAccount`; migração `sec017_strip_google_tokens`) | adaptador |
| Dados financeiros | enquanto a família existir; ao sair, histórico fica com a família | ADR-019 |
| Nome, e-mail, foto | enquanto a conta existir; excluir anonimiza | SEC-017c |

IA: opt-in por família e finalidade, só Administrador liga, versão do texto vigente; payload só de agregados por allowlist; consentimento append-only; desligar não apaga dados (detalhe em spec 06a).

## Invariantes
1. Rotas tiram usuário, família e papel SÓ da sessão; corpos `.strict()` (extra = 400); confirmação comparada com a própria conta/família (sem IDOR/BOLA).
2. Conta excluída nunca autentica: `findSessionUser` recusa `deletedAt` (401 e apaga a sessão); login de teste recusa (403 `ACCOUNT_DELETED`, SEC-030).
3. Exclusões apagam na hora a idempotência ligada (SEC-031). Alcance por colunas próprias: UUIDs e e-mail completo em qualquer linha; NOME só nas linhas dos co-membros (SEC-039). Nunca por trecho de texto na tabela toda.
4. Exclusão da família é a única exceção a "nada é apagado", escopada por `familyId` e transação; `UPDATE` em `transaction_revisions`/`family_events` segue bloqueado.
5. Funções de trava com `search_path=pg_catalog, public`; `app.anonymize_user` só troca o e-mail DAQUELE titular pelo anonimizado (SEC-036, migração `20261027030000`).
6. Exportação é READ ONLY, sem e-mail de terceiros, tokens, "Só meu" alheio.
7. Prazos do texto e do comportamento vêm das mesmas constantes (`policy.ts` importa de `cron/retention`, `ia/purge`, `auth/session`).
8. `?deleted=`/`?left=` nunca exibem texto da URL; só sinalizador `1` (SEC-034).

## Riscos aceitos
| ID | Risco | Razão |
| :-- | :-- | :-- |
| SEC-035 | Cota de exportação em janela fixa (00:00 UTC) permite 6 downloads em 2 min na virada; GET cruzado de outro site consome a cota da vítima | Informativo (D-GES-46): sem vazamento. Correção possível: `Sec-Fetch-Site: same-origin`/janela deslizante. Sujeito a veto |
| SEC-037 | Exclusões sem reautenticação (digitar e-mail/nome + aviso por e-mail) | Decisão do usuário pendente (recomendação: manter) |
| info | Corrida exclusão da família x aceite de convite: 500 cosmético (FK); ninguém fica ligado a família inexistente | Sem efeito de segurança |
| info | Repetir `Idempotency-Key` após excluir a família dá 403 `NO_FAMILY` | UX |
| info | Arquivo montado em memória (Zod + serialização), não stream; 3 exportações simultâneas perto do teto podem estourar a função serverless | Não medido; teto 50 MB |
| info | Texto livre digitado (descrições, nomes de contas) permanece no histórico de ex-membros/conta excluída | ADR-019 |
| info | Role da aplicação pode ser dona das tabelas em produção (travas protegem de erro, não da credencial) | Não verificado no Prisma Postgres |

## Fontes
Código: `src/modules/privacidade/{export,export-schema,delete-account,delete-family,deletion-notice,policy}.ts`; rotas `src/app/api/v1/me/{export,delete-account}/route.ts`, `src/app/api/v1/family/delete/route.ts`; telas `src/app/perfil/{perfil-screen.tsx,excluir-conta/}`, `src/app/privacidade/page.tsx`, `src/app/conta-excluida/page.tsx`, `src/app/(app)/familia/excluir`; `src/modules/cron/{retention,purge}.ts`, `src/modules/ia/purge.ts`, `src/modules/mcp/purge.ts`; `src/lib/deleted-account.ts`, `src/lib/auth/{session,dev-login}.ts`; `src/modules/ia/{consent,consent-texts}.ts`.
Testes: `tests/integration/{sec017a-retencao,sec017b-exportar-dados,sec017c-excluir-conta,sec017d-excluir-familia,sec029-032-exportacao,sec030-033-conta-excluida,sec031-idempotencia-excluidos,sec039-idempotencia-escopo,sec036-travas,sec037-aviso-exclusao,en005-consentimento}`; `tests/unit/privacidade/politica.test.tsx`.
Âncoras: US-079..082; SDD-028 §7, SDD-022; ADR-019, ADR-029, ADR-032 §6; D-GES-42 (U5), 45, 46, 48, 49; DEV-99, DEV-101..105; SEC-017a..e, 029..039. Vigente sobre SDD-028 §7: arquivo em memória (sem stream), sem tags no export, `DeleteAccountBodySchema` com pendências US-035, rota `idempotent:false`, `set_config(..., true)`.

## Pendências
- Usuário/jurídico: aprovar o texto, definir `PRIVACY_CONTACT_EMAIL`, `POLICY_IS_DRAFT=false`, ajustar `POLICY_UPDATED_ON`/`POLICY_VERSION` (checklist produção 9.3/9.6).
- Validar juridicamente (U5, D-GES-42; nenhum validado): sessões 30/90 d; convites 90 d; idempotência 24 h; IA 24 meses; auditoria MCP 12 meses; permanência de dados financeiros de ex-membro/conta excluída; prazo de resposta a pedidos por e-mail (suporte atende exportação >50 MB). Base legal, DPO/encarregado, canal de contato e transferência internacional (hospedagem, provedor de IA) NÃO constam da política.
- Decisão do usuário: SEC-037 (reautenticação); veto a SEC-035.
- Não verificado: login Google real após exclusão (só simulado); revogação MCP real com claude.ai; migração `20261027030000` e role do banco em produção; UI de `/perfil/excluir-conta` e `/familia/excluir` no navegador.
- Fora do escopo: backups do banco (apagamento não alcança cópias) e logs de infraestrutura.
