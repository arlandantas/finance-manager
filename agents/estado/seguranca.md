# Estado vigente: Segurança (transversal)

Atualizado: 2026-10-30 (revisão do ADR-033). Fonte de verdade: código + testes (§f). Mudou proteção, achado ou regra de deploy? Atualize ESTE arquivo no mesmo commit. A regra do "Só meu" está em [so-meu.md](so-meu.md) (não repetida aqui).

## a) Resumo para o usuário
- 68 achados SEC (levantamento + 8 retestes/revisões). 0 Crítica aberta. SEC-058..068 são de PROJETO (ADR-033, membro sem conta, nada implementado): 2 Média, 7 Baixa, 2 Info; o resto está corrigido, aceito ou aguarda o usuário.
- ADR-033 pode ser Aceito com condições: o TL emenda §2.3/§2.5/§2.8/§3/§5/§9 (SEC-058, 059, 061, 063, 065). Q-TL-U2, U3, U5 e U4: Segurança concorda com condições ([relatório](../security/relatorios/revisao-adr033-2026-10-30.md)).
- Ciclo do "Só meu" encerrado (D-GES-61). Novos achados só de mudanças futuras.
- Decisões que dependem do usuário: Q-TL-U1/SEC-060 ("Entra na divisão?" no cadastro); SEC-062 (criar "Desvincular conta"); veto a SEC-054/055/056 (aceites do Gestor); SEC-037 (reautenticação nas exclusões; hoje: confirmação digitada + e-mail de aviso); validação jurídica dos prazos/texto LGPD (U5).
- Ações do usuário para produção ([hospedagem-producao.md](hospedagem-producao.md)): variáveis de ambiente, `ALLOWED_SIGNUP_EMAILS`, `MCP_CIMD_ALLOWED_CLIENT_IDS`, teto de IA, aprovar texto de privacidade, avisar o deploy da fase 1 da SEC-018 (para o Gestor agendar a fase 2).
- Nunca verificado: produção (Vercel), claude.ai real, Google real, UI no navegador (§d).

## b) Achados (status final)
Severidade entre parênteses. "Reteste" = confirmado pelo Agente de Segurança.

| SEC | Assunto | Status final |
| :-- | :-- | :-- |
| 001, 015, 016 | Login de teste em túnel/LAN; CSRF de login de teste; segredos/placeholders locais | Risco aceito (D-GES-40): acesso local proposital, banco local só com dados de teste. Trava de produção do login de teste permanece |
| 008 | Modo homologação liga login de teste em build de produção (Média) | Risco aceito (ADR-024); nunca definir `APP_HOMOLOG_MODE` em produção |
| 002 (Alta) | Next com avisos críticos | Corrigido: Next ^16.4.3 |
| 003 | Redirect aberto `/login?callbackUrl` | Corrigido (reteste) |
| 004 | Convite entrava sem aceite | Corrigido: aceite explícito, `DECLINED`, `/convites` (reteste) |
| 005 | DoS anônimo do OAuth (limite por `client_id`) | Corrigido, dependente de a Vercel sobrescrever `x-real-ip` (não verificado) |
| 006 | Cabeçalhos/CSP | Parcial: CSP de scripts só Report-Only; `frame-ancestors 'none'` e demais cabeçalhos aplicados |
| 007 | zod/corpo sem teto | Corrigido (413) |
| 009 | Injeção de instruções entre membros (MCP) | Corrigido como mitigação: heurística só marca; contornável por paráfrase |
| 010 | CIMD só por host | Corrigido: URL exata, sem redirect, IP privado barrado |
| 011 | Consentimento OAuth amarrado ao navegador | Risco residual aceito, condicionado a homologar com o claude.ai real (D-GES-45) |
| 012, 013, 014, 017a, 020, 022, 023, 024 | Log de erro; teto global LLM; spam de convites; expurgo técnico; limite de taxa `/api/v1`; health público; código OAuth queimado antes de validar; FK composta da regra de divisão | Corrigido (reteste) |
| 017b..e | Exportar, excluir conta, excluir família, privacidade | Corrigido; derivados SEC-029..037 |
| 018 | Token de sessão em texto | Parcial: fase 1 (hash) no código; fase 2 pendente (§e) |
| 019 | Dependências transitivas | Parcial: 11 avisos `--prod` sem versão corrigida (Prisma CLI, vite/vitest, zod do `@vercel/cli-config`); Auth.js é beta (EXT-09) |
| 021 | Edição de "Só meu" alheio | Corrigido; regra evoluiu, ver [so-meu.md](so-meu.md) |
| 025, 026, 038 | Captura de dividida/prevista/série como "Só meu" | Corrigido (SEC-038 na rodada 5, D-GES-49, sem reteste formal próprio) |
| 027, 028 | Corrida no limite de convites; limite por segredo no `/token` | Corrigido (reteste) |
| 029..034 | Exportação do ex-membro, conta excluída autenticável, idempotência de excluídos, exportação grande, texto por nome, `?deleted=` | Corrigido (reteste final) |
| 035 | Cota de exportação em janela UTC | Risco aceito (D-GES-46) |
| 036 | GUCs/`search_path` das funções | Corrigido; role dona das tabelas em produção não verificada |
| 037 | Exclusões sem reautenticação | Aviso por e-mail corrigido; reautenticação: pergunta ao usuário (recomendação: manter confirmação digitada + e-mail) |
| 039 | Limpeza de idempotência por trecho de nome | Corrigido (rodada 5, por identificadores/escopo) |
| 040 | Convites contornáveis recriando família | Corrigido (limite por pessoa, reenvio conta) |
| 041 | Balde de falhas do `/token` fraco | Risco aceito (desprezível: segredos de 256 bits; D-GES-49) |
| 042..051 | "Só meu" (cartão, limites, ex-membro, exportação, baixa) | Corrigido; detalhes em [so-meu.md](so-meu.md) |
| 052, 053 | Admin com cartão após remoção; acerto duplo de quem voltou | Risco aceito (info, D-GES-59) |
| 058..068 | ADR-033 (membro sem conta): `userId` nulo nas comparações de pessoa; pagador/acerto do sem conta; EQUAL; e-mail em `INVITATION_RESENT`; captura irreversível; nome escolhido (U4); prévia; gatilho; corridas; exceção SEC-026c; LGPD do `pendingEmail` | Abertos (projeto); detalhe e local na [revisão](../security/relatorios/revisao-adr033-2026-10-30.md) |
| 054, 055, 056 | Excluir/relançar, estornar/baixar, acerto com ex-membro movem crédito | Risco aceito pelo Gestor (D-GES-61): inerente ao livro-caixa; defesa = histórico. Sujeito a veto do usuário |
| 057 | Editar série de removido devolve ocorrências | Só registrado; "encerrar e criar outra" resolve |

## c) Proteções vigentes (verificadas no código)
| Área | Proteção | Onde |
| :-- | :-- | :-- |
| Isolamento | Por `familyId` na aplicação (ADR-013). NÃO há RLS do Postgres. Gatilhos `forbid_mutation` em ledger/revisões/eventos; exceção `app.purge_family` (só exclusão de família) e `app.anonymize_user` com escopo; `search_path` fixo (`pg_catalog, public`) em todas as funções (SEC-036) | `prisma/migrations/*sec017_forbid*`, `*sec036*` |
| Sessão | Só `sha256(token)` no banco; ociosidade 30 dias, absoluto 90; "Encerrar as outras sessões"; conta excluída nunca autentica; sessões encerradas apagadas após 7 dias (D-GES-44) | `lib/auth/session-adapter.ts`, `config.ts` |
| Cadastro | `ALLOWED_SIGNUP_EMAILS` (vazia = aberto); só restringe criar conta | `lib/auth/config.ts` |
| CSRF | Toda mutação `/api/v1`: `Content-Type: application/json` + `Origin` igual a `AUTH_URL` (fora de produção, origens de dev) | `lib/api/with-api.ts` |
| Idempotência | `Idempotency-Key` UUID obrigatória em mutações; reuso com outro corpo = erro; registros apagados em 24 h e na exclusão de conta/família, por identificadores | `lib/api/idempotency.ts`, `privacidade/delete-account.ts` |
| Limites de taxa (Postgres `mcp_rate_buckets`) | `/api/v1` 300/min/usuário; aceite/recusa de convite 20/h; convites 5/h e 10/dia por pessoa, reenvio máx. 3; exportação 3/dia; MCP: `/token` 30/min por IP+client e 10 falhas/min por segredo, authorize 20/min, register 10/h, grant 60/min e 1000/dia | `lib/api/rate-limit.ts`, `mcp/config.ts`, `familia/invitations/service.ts` |
| Entrada | Zod `.strict()`; corpo com teto (413); texto de usuário saneado (NFKC, sem invisíveis) | `lib/api/read-body.ts`, `lib/text` |
| Cabeçalhos | `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, `frame-ancestors 'none'` aplicado, HSTS em produção, CSP completa em Report-Only | `lib/security-headers.ts` |
| Proxy | Checagem otimista do cookie; autoridade é `requireSession`/`withApi` | `proxy.ts` |
| OAuth/MCP | `MCP_ENABLED=false` por padrão (nunca em preview; produção exige `APP_URL` https); PKCE; CIMD por URL exata (`MCP_CIMD_ALLOWED_CLIENT_IDS` vazia = nenhum cliente); cookie `__Host-mcp_authz` amarra consentimento ao navegador; tela mostra nome/domínio verificado; e-mail e aviso ao criar conexão; access 60 min, código 60 s, pedido 10 min, validade do grant 30/90 dias; tokens por hash; revogação; auditoria no banco; texto de membros em envelope `untrusted_text` + `flagged`; única escrita `lancar_despesa` com limites por membro (padrão R$ 500/transação, 10/dia, 5/hora) | `modules/mcp/*` |
| IA | Teto por família e global mensal (falha fechada; alarme 50/80/100% por `OPS_ALERT_EMAIL`); anonimização (ADR-029) | `modules/ia/*` |
| Health/cron | `/api/health` público só `status`/`timestamp`; detalhe e `/api/cron/purge` exigem `Bearer CRON_SECRET` (tempo constante) | `app/api/health`, `cron/purge.ts` |
| LGPD | Exportar (JSON, em lotes, teto 50 MB), excluir conta (anonimiza, histórico fica, ADR-019), excluir família, `/privacidade` (rascunho), e-mail de aviso após exclusão | `modules/privacidade/*` |
| Logs | Erro inesperado sem corpo/stack sensível (SEC-012) | `lib/log-error.ts` |

## d) Modelo de ameaças e o que NÃO foi verificado
Ameaças consideradas: (1) IDOR/BOLA entre famílias e entre membros; (2) captura de sessão/login de teste em produção; (3) consentimento OAuth forjado (consent phishing) e abuso do MCP; (4) prompt injection via texto de outro membro acionando escrita; (5) vazamento de dado pessoal por log, exportação, payload à LLM; (6) abuso/custo (taxa, LLM, convites); (7) cadeia de suprimentos. (8) ADR-033, membro sem conta: pessoa sem `userId` comparada como `NULL`; crédito/dívida em nome de quem não contesta; captura do cadastro por convite ao e-mail errado; e-mail de terceiro (`pendingEmail`); impersonação pelo nome escolhido no aceite. Fora de escopo/aceito: confiança entre membros da mesma família (defesa = histórico), injeção/erro da LLM gravando dado dentro dos limites (ADR-030 R2).

Invariantes exigidas para o membro sem conta (ADR-033; valem para o SDD e o reteste):
1. Comparação de pessoa só com `userId` não nulo (`samePerson`); nunca `userId: <expr>` nem `undefined` em `where` do Prisma; `Set` de `userId` sem `null` (SEC-058).
2. Ninguém além do Lanç se põe como pagador/responsável no lugar do sem conta, nem o Admin (D-GES-47 mantido); ninguém o torna "Só meu" (U2); acerto com credor sem conta não vai para conta do devedor (SEC-059).
3. `pendingEmail` nunca em `family_events`, `MemberRef`, MCP, exportação nem logs; anonimizado na remoção e na edição (U5, SEC-061).
4. Nome escolhido no aceite em `Member.name`, único e normalizado sob o lock; só o próprio renomeia; a exclusão de conta o apaga (U4, SEC-063).
5. Só o aceite grava `userId` (gatilho com `IS DISTINCT FROM`, `search_path` fixo, GUC do aceite); lock da família antes do `claim` (SEC-065/066).

Nunca verificado (a Segurança só testa em local, regra do README):
1. Produção Vercel: `x-real-ip` sobrescrito (SEC-005), HSTS efetivo, variáveis e escopos, role dona das tabelas (SEC-036), health real.
2. claude.ai real: `state`, URL do `client_id` do Claude (SEC-010/011), conexão ponta a ponta.
3. Google OAuth real (EXT-01: `redirect_uri_mismatch` em localhost até cadastrar o URI); Claude real sofrendo injeção.
4. UI das rodadas 6 a 8 no navegador; CSP completa em navegador real.
5. Agregados à IA incluem "Só meu" alheio? (D-GES-29, aberto).
6. Backup/restore de produção (risco 3 do ADR-031, ainda sem ensaio).

## e) Regras de deploy e pendências
Hospedagem, variáveis, build, migrações, backup, cron, smoke e fase 2 da SEC-018: [hospedagem-producao.md](hospedagem-producao.md).

Pendências abertas: veto a D-GES-57/61; SEC-037 reauth; validação jurídica LGPD; reteste formal curto de SEC-038/039/040 (opcional); SEC-019 sem correção disponível; CSP completa para enforce (validar em navegador); EXT-01..12 em [pendencias-externas.md](../manager/pendencias-externas.md).

## f) Processo de reteste e mapa de fontes
Processo ([security/README.md](../security/README.md)): Gestor aciona a Segurança; ela só lê e prova em ambiente local (`127.0.0.1`, banco descartável no `db-test`, apagado ao final), nunca produção nem terceiros, sem credenciais reais; registra em `security/relatorios/` e atualiza `security/status.md`; achado ➔ Gestor ➔ usuário ➔ tarefa (TL ➔ Dev) ➔ reteste. Reverter `tsconfig.json`/`AGENTS.md` reescritos pelo `next dev`. Revisão curta antes de liberar história sensível (autenticação, dado pessoal, integração, endpoint novo).

Relatórios ([pasta](../_historico/security/relatorios/)): `levantamento-2026-10-24` (SEC-001..024), `reteste-2026-10-25` (025..028), `revisao-lgpd-2026-10-25` (029..037), `reteste-final-2026-10-25` (038..041), `reteste-so-meu-2026-10-25` (042..046), `reteste-rodada6/7/8-2026-10-26` (047..057). Aberto (em `security/relatorios/`): [`revisao-adr033-2026-10-30`](../security/relatorios/revisao-adr033-2026-10-30.md) (058..068).
Decisões: [D-GES-40..61](../manager/decisoes-do-gestor.md) (40 escopo; 41 Grupo A; 42 Grupo B e U1..U6; 44 fase 2/7 dias; 45..49 LGPD e rodadas; 50..61 "Só meu"). Design: [SDD-028](../tech-lead/sdd/SDD-028-correcoes-de-seguranca-grupo-b.md), [ADR-032](../tech-lead/adrs/ADR-032-correcoes-de-seguranca-grupo-b.md), ADR-008 (login de teste), ADR-013, ADR-019, ADR-029, ADR-030, ADR-031; SDD-024..027 (MCP). D-PO-91..98 em [decisoes-po-seguranca-sec.md](../_historico/product-owner/backlog/decisoes-po-seguranca-sec.md). Pedidos DEV-88..135 em [pedidos-ao-gestor.md](../manager/pedidos-ao-gestor.md).
Testes (`tests/integration/`): `sec009`, `sec011`, `sec013`, `sec017a..d`, `sec018`, `sec024`, `sec029-032`, `sec030-033`, `sec031`, `sec036`, `sec037`, `sec038`, `sec039`, `sec040`, mais os do "Só meu" (ver so-meu.md).

Divergências docs x código (código vence):
1. [security/status.md](../security/status.md) lista SEC-038..041 como "Aberto"; o código/decisões (D-GES-48/49) os têm corrigidos (038..040) e aceito (041).
2. Pedido original citava RLS: não existe RLS; isolamento é aplicacional por `familyId` + gatilhos + funções fixadas.
3. Checklist Vercel Bloco 9.2 diz "confirmar nome no SDD-028": a variável é `LLM_GLOBAL_MONTHLY_CAP_CENTS` (`modules/ia/config.ts`).
4. `status.md` mantém "Perguntas ao usuário" antigas (SEC-025/026, SEC-038, dono da conta, SEC-040) já respondidas por D-GES-45/48/50.
