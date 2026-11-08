# Spec 08 — Segurança (transversal)

Atualizado: 2026-10-31. Fonte de verdade: código + testes. Regra do "Só meu" fica na spec própria. Reviewer: checar invariantes e proteções abaixo em todo PR que toque auth, dado pessoal, integração ou endpoint novo.

## Resumo
- 69 achados SEC; 0 Crítica aberta. Abertos: SEC-061 e SEC-063 (até US-094a/094b), SEC-018 fase 2, SEC-019, SEC-006 parcial.
- Isolamento é aplicacional por `familyId` (NÃO há RLS) + gatilhos + funções com `search_path` fixo.
- `X-Forwarded-For`/`x-real-ip` só são confiáveis atrás de proxy confiável (Vercel, que os sobrescreve). No self-host o limite por IP (30 falhas/min no MCP, `/token`) é freio de conveniência, forjável (SEC-005); a defesa real é o token de 256 bits.
- Nunca verificado em produção: `x-real-ip` na Vercel (SEC-005), HSTS efetivo, role dona das tabelas (SEC-036), claude.ai real, Google OAuth real, CSP completa em navegador.

## Regras (proteções vigentes)
| Área | Proteção | Onde |
| :-- | :-- | :-- |
| Isolamento | `familyId` da sessão; gatilhos `forbid_mutation` em ledger/revisões/eventos; exceções `app.purge_family` (só excluir família) e `app.anonymize_user` (com escopo); `search_path = pg_catalog, public` em toda função | `prisma/migrations/*sec017_forbid*`, `*sec036*` |
| Sessão | Só `sha256(token)` no banco; ocioso 30 d, absoluto 90 d; "Encerrar as outras"; conta excluída nunca autentica; sessões encerradas apagadas após 7 d | `lib/auth/session-adapter.ts`, `config.ts` |
| Cadastro | `ALLOWED_SIGNUP_EMAILS` (vazia = aberto); só restringe criar conta | `lib/auth/config.ts` |
| CSRF | Mutação `/api/v1`: `Content-Type: application/json` + `Origin` = `AUTH_URL` (dev: origens de dev) | `lib/api/with-api.ts` |
| Idempotência | `Idempotency-Key` UUID obrigatória; reuso com outro corpo = erro; apagada em 24 h e na exclusão de conta/família, por identificadores (nunca por trecho de nome) | `lib/api/idempotency.ts`, `privacidade/delete-account.ts` |
| Taxa (Postgres `mcp_rate_buckets`) | `/api/v1` 300/min/usuário; aceite/recusa de convite 20/h; convites 5/h e 10/dia por pessoa, reenvio máx. 3; exportação 3/dia | `lib/api/rate-limit.ts`, `familia/invitations/service.ts` |
| Taxa MCP | `/token` 30/min por IP+client e 10 falhas/min por segredo; authorize 20/min; register 10/h; grant 60/min e 1000/dia | `mcp/config.ts` |
| Entrada | Zod `.strict()`; corpo com teto (413); texto saneado (NFKC, sem invisíveis) | `lib/api/read-body.ts`, `lib/text` |
| Cabeçalhos | `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'`, HSTS em produção; CSP completa só Report-Only | `lib/security-headers.ts` |
| Proxy | Checagem otimista do cookie; autoridade = `requireSession`/`withApi` | `proxy.ts` |
| OAuth/MCP | `MCP_ENABLED=false` padrão (nunca em preview; produção exige `APP_URL` https); PKCE; CIMD por URL exata sem redirect e IP privado barrado (`MCP_CIMD_ALLOWED_CLIENT_IDS` vazia = nenhum) | `modules/mcp/*` |
| OAuth/MCP (cont.) | Cookie `__Host-mcp_authz` amarra consentimento ao navegador; tela mostra nome/domínio verificado; e-mail ao criar conexão; access 60 min, código 60 s (queimado antes de validar), pedido 10 min, grant 30/90 d; tokens por hash; auditoria | `modules/mcp/*` |
| MCP escrita | Escrita `lancar_despesa` (direta) ou, com "exigir confirmação" na conexão, `propor_lancamento` (só proposta; confirmar só no app pelo membro, 404 para outro membro/família; TTL 30 min, 10 pendentes e 20/h; não confirmadas apagadas em 30 d; sem ferramenta de confirmar), limites por membro (padrão R$ 500/transação, 10/dia, 5/hora); texto de membros em envelope `untrusted_text` + `flagged` (heurística, contornável) | `modules/mcp/*` |
| MCP token pessoal (ADR-043) | `fmp_` 256 bits, só `sha256` no banco, mostrado uma vez e fora da idempotência/log/auditoria; validade máx. 90 d; só `/api/mcp`; `MCP_PAT_ENABLED` e `assistantPatEnabled` desligados por padrão; 5 por membro; escrita nasce com confirmação; 30 falhas de autenticação/min por IP; e-mail ao membro (1/dia por token) ao bater limite | `modules/mcp/*` (US-074b/074c) |
| IA | Teto por família e global mensal (falha fechada; alarme 50/80/100% via `OPS_ALERT_EMAIL`); anonimização | `modules/ia/*` |
| Health/cron | `/api/health` público só `status`/`timestamp`; detalhe e `/api/cron/purge` exigem `Bearer CRON_SECRET` (tempo constante) | `app/api/health`, `cron/purge.ts` |
| LGPD | Exportar (JSON em lotes, teto 50 MB), excluir conta (anonimiza, histórico fica), excluir família, `/privacidade` (rascunho), e-mail de aviso após exclusão | `modules/privacidade/*` |
| Logs | Erro inesperado sem corpo/stack sensível | `lib/log-error.ts` |
| Dependências | Next ^16.4.3. SEC-019: 11 avisos `--prod` sem correção (Prisma CLI, vite/vitest, zod do `@vercel/cli-config`); Auth.js é beta | `package.json` |

## Invariantes (membro sem conta, ADR-033; valem para SDD e reteste)
1. Comparação de pessoa só com `userId` não nulo (`samePerson`); nunca `userId: <expr>` nem `undefined` em `where` do Prisma; `Set` de `userId` sem `null` (SEC-058).
2. Ninguém além do Lanç se põe como pagador/responsável no lugar do sem conta, nem o Admin; ninguém o torna "Só meu" (SEC-059a). Acerto com credor sem conta: qualquer conta de destino (SEC-059b aceito).
3. `pendingEmail` nunca em `family_events`, `MemberRef`, MCP, exportação nem logs; anonimizado na remoção e na edição (SEC-061).
4. Nome escolhido no aceite em `Member.name`, único e normalizado sob o lock; só o próprio renomeia; excluir a conta o apaga (SEC-063).
5. Só o aceite grava `userId` (gatilho `IS DISTINCT FROM`, `search_path` fixo, GUC do aceite); lock da família antes do `claim` (SEC-065/066).
6. Outras: `ALLOWED_SIGNUP_EMAILS`/link/login nunca vinculam membro; `APP_HOMOLOG_MODE`, `AUTH_DEV_LOGIN`, `APP_NOW_OVERRIDE` nunca em produção.

## Riscos aceitos
| SEC | Risco | Razão |
| :-- | :-- | :-- |
| 001/015/016 | Login de teste em túnel/LAN, CSRF do login de teste, segredos locais | Local proposital, só dados de teste; trava de produção permanece |
| 008 | Modo homologação liga login de teste em build de produção | Nunca definir `APP_HOMOLOG_MODE` em produção |
| 011 | Consentimento OAuth amarrado ao navegador: risco residual | Homologar com claude.ai real |
| 035 | Cota de exportação em janela UTC | Aceito |
| 041 | Balde de falhas do `/token` fraco | Segredos de 256 bits |
| 052/053 | Admin com cartão após remoção; acerto duplo de quem voltou | Info |
| 054/055/056 | Excluir/relançar, estornar/baixar, acerto com ex-membro movem crédito | Inerente ao livro-caixa; defesa = histórico; sujeito a veto do usuário |
| 057 | Editar série de removido devolve ocorrências | Só registrado; "encerrar e criar outra" resolve |
| 059b | Acerto com credor sem conta aceita qualquer conta de destino | Decisão do usuário |
| 009 | Injeção entre membros (MCP) só mitigada por heurística | Confiança entre membros da família fora de escopo |
| 037 | Exclusões sem reautenticação (hoje: confirmação digitada + e-mail de aviso) | Decisão do usuário pendente |
| — | Erro/injeção da LLM gravando dado dentro dos limites do MCP | Aceito (limites por membro) |

## Fontes
Código: ver coluna "Onde". Testes (`tests/integration/`): `sec009`, `sec011`, `sec013`, `sec017a..d`, `sec018`, `sec024`, `sec029-032`, `sec030-033`, `sec031`, `sec036`, `sec037`, `sec038`, `sec039`, `sec040` e os do "Só meu".
Ameaças consideradas: IDOR/BOLA entre famílias e membros; sessão/login de teste em produção; consent phishing e abuso do MCP; prompt injection; vazamento por log/exportação/LLM; abuso de custo; cadeia de suprimentos; membro sem conta.

## Pendências
- Reteste de SEC-061/063 após US-094a/094b; limpar `pendingEmail` da idempotência 24 h na US-095 (SEC-069).
- SEC-018 fase 2 (remover `sessionToken`); ver spec de hospedagem. SEC-006: promover CSP completa a enforce após validar em navegador.
- Usuário: SEC-060 ("Entra na divisão?"), SEC-062 ("Desvincular conta"), SEC-037, veto a 054/055/056, validação jurídica dos textos/prazos LGPD.
- Aberto: agregados da IA incluem "Só meu" alheio? Backup/restore de produção sem ensaio.
- Reviewer: revisão de segurança curta antes de liberar história com autenticação, dado pessoal, integração ou endpoint novo; reverter `tsconfig.json`/`AGENTS.md` reescritos pelo `next dev`.
