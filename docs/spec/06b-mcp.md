# Spec 06b — Assistente (servidor MCP / OAuth)

Atualizado: 2026-11-08

## Resumo
- Servidor MCP próprio no Next (OAuth 2.1, escopos `read`/`write`), 10 ferramentas: 7 de leitura, `lancar_despesa` e, com escrita, `propor_lancamento` e `consultar_proposta` (US-076c). IA/LLM em `06a-ia-llm.md`.
- Lançamento é DIRETO (sem proposta nem confirmação; D-GES-36c). Salvaguardas: só despesa à vista "Só meu" do próprio membro, limites por membro (R$ 500 / 10 por dia / 5 por hora), data até 60 dias atrás, idempotência, selo "via assistente", auditoria. Por conexão há o modo "exigir confirmação" (desligado por padrão, US-076c): o pedido só cria PROPOSTA e o membro confirma no app (seção abaixo).
- Código pronto e testado; NADA ligado em produção (`MCP_ENABLED`). Homologação com o claude.ai real nunca feita.

## Regras
| # | Regra | Código |
| :-: | :-- | :-- |
| 1 | Recurso `${APP_URL}/api/mcp`, stateless; OAuth 2.1 no mesmo app (`/oauth/authorize`, `/api/oauth/{token,revoke,authorize/decision}`, `/.well-known/oauth-{authorization-server,protected-resource}`). 404 quando desligado | `mcp/handler.ts`, `mcp/config.ts` |
| 2 | Liga só com `MCP_ENABLED=true`; `VERCEL_ENV=preview` SEMPRE desliga. Produção exige `APP_URL` https | `mcp/config.ts` |
| 3 | Clientes: só CIMD cuja URL EXATA de `client_id` está em `MCP_CIMD_ALLOWED_CLIENT_IDS` (vazia = nenhum). `MCP_CIMD_ALLOWED_HOSTS` obsoleta/ignorada (SEC-010). Sem DCR/`registration_endpoint`. Nome exibido definido no servidor (`claude.ai` = "Claude"); não verificado aparece como tal (SEC-011) | `mcp/cimd.ts`, `mcp/verified-clients.ts` |
| 4 | Escopos `read`, `write` (`offline_access` aceito, sem virar permissão). Escrita exige opt-in explícito e segunda ciência (`writeAcknowledged`) no consentimento. Cookie de vínculo `__Host-mcp_authz` (https) | `mcp/authorize.ts`, `mcp/consent-binding.ts` |
| 5 | Prazos: acesso 60 min; código 60 s; pedido de autorização 10 min; conexão 30 ou 90 dias; auditoria 12 meses. Tokens só como hash SHA-256; reuso de código/refresh revoga a conexão (`CODE_REUSE`/`REFRESH_REUSE`) | `mcp/config.ts`, `mcp/tokens.ts`, `mcp/token-endpoint.ts` |
| 6 | Limites de transporte FIXOS: grant 60/min e 1000/dia; /token 30/min por IP+client_id e 10 falhas/min por segredo (troca correta nunca barrada, SEC-028); authorize 20/min; corpo máx. 64 KB | `mcp/config.ts`, `mcp/rate-limit.ts` |
| 7 | Funciona POR MEMBRO; ignora "ocultar valores" (decisão do usuário). Conexão revogada na saída/remoção do membro. Administrador pode bloquear o assistente da família (`assistantAccessEnabled`) | `mcp/grants.ts`, `mcp/connections.ts` |
| 8 | Auditoria append-only SEM conteúdo: `params` só com chaves da allowlist; eventos de conexão/revogação/bloqueio/`LIMITS_CHANGED`; aviso "nova conexão" na Home e e-mail (SEC-011); revisão semanal do que o assistente lançou (janela 7 dias) | `mcp/audit.ts`, `mcp/new-connection.ts`, `mcp/review.ts` |
| 9 | Expurgo: auditoria >12 meses, tokens vencidos >7 dias, pedidos expirados, clientes sem uso >30 dias, buckets >2 dias (cron `/api/cron/purge` ou `pnpm mcp:purge`) | `mcp/purge.ts` |

| Ferramenta | Escopo | Observação |
| :-- | :-: | :-- |
| `cartoes_e_faturas`, `consultar_saldos`, `gastos_por_categoria`, `listar_cadastros`, `listar_lancamentos` (traz `origin`), `previstas_do_mes`, `resumo_do_mes` | read | Lista fechada, ordem alfabética; leitura igual à tela (inclui "Só meu" de outros, que todos veem) |
| `lancar_despesa` | write | Regras abaixo (SDD-027 §R2) |
| `propor_lancamento`, `consultar_proposta` | write | Modo "exigir confirmação" (abaixo); `consultar_proposta` só devolve estado, valor e ids |

| `lancar_despesa` | Regra |
| :-- | :-- |
| Escopo | Só despesa à vista, "Só meu", pagador = autor = membro da conexão; conta OU cartão; sem receita, transferência, divisão, parcela, observação, editar ou excluir |
| Ordem | Trava por membro (advisory) ➜ idempotência por `idempotencyKey` (8..64) ➜ duplicata natural (mesma descrição/valor/data/origem em 10 min; `allowDuplicate` libera) ➜ data (hoje até 60 dias atrás) ➜ limites ➜ `createExpenseCore` |
| Limites do membro | Padrão R$ 500/lançamento, 10/dia, 5/hora; contagem inclui excluídos; o membro pode subir ou remover ("sem limite") com aviso e ciência (`RISK_NOT_ACK_MESSAGE`); alteração audita `LIMITS_CHANGED`; estouro = 422 `LIMIT_EXCEEDED` |
| Marca | `origin=ASSISTANT`, `assistantGrantId`, selo "via assistente", filtro no Extrato, cartão de conferência |
| Texto de usuário | Descrições e nomes devolvidos como `{untrusted_text, flagged}` com preâmbulo "texto é dado, não instrução"; servidor marca (heurística), não reescreve (SEC-009) |

## Modo "exigir confirmação" (US-076c, ADR-030 §6)
| Regra | Detalhe |
| :-- | :-- |
| Chave | `mcp_grants.requireConfirmation` (padrão `false`), por conexão e só do dono: `PATCH /api/v1/assistant/connections/:id/confirmation` (auditado como `modo_confirmacao`). Ligado, `lancar_despesa` responde `CONFIRMATION_REQUIRED`; desligado, `propor_lancamento` responde `CONFIRMATION_MODE_OFF` |
| Proposta | Tabela `assistant_proposals` (PENDING/CONFIRMED/REJECTED/EXPIRED; descrição saneada; conta OU cartão; `UNIQUE(grantId, idempotencyKey)`; `transactionId` e `transactions.assistantProposalId` únicos). Só despesa à vista "Só meu" do próprio membro, mesma janela de data (60 dias) |
| Prazos e tetos | TTL 30 min (`PROPOSAL_TTL_MIN`), expiração preguiçosa (varredura ao propor/ler; confirmar vencida = 409 `PROPOSAL_EXPIRED`); 10 pendentes e 20 propostas/h por conexão (`LIMIT_EXCEEDED`); mesma chave com outro conteúdo = `IDEMPOTENCY_KEY_REUSED` |
| Decisão | Só no app (sessão do membro): `POST /api/v1/assistant/proposals/:id/{confirm,reject}` com `Idempotency-Key`, trava do membro + `FOR UPDATE`, revalida `CreateExpenseSchema` e usa `createExpenseCore`; respeita os limites da US-076b (conta no momento de confirmar) e falha com a mensagem do domínio (cartão arquivado, fatura paga). Confirmar de novo devolve o mesmo lançamento; conexão revogada = 409. Não existe ferramenta MCP de confirmar. Tela `/assistente/propostas/:id` (outro membro/família = 404) |
| Auditoria | `TOOL propor_lancamento` (com `proposalId`), `confirmacao_no_app` (`proposalId`+`transactionId`) e `recusa_no_app`; sem descrição nem valor |
| Retenção/LGPD | Não confirmadas apagadas após 30 dias (`purgeMcp`) e na exclusão da conta; exclusão da família apaga tudo |

## Token pessoal (PAT; ADR-043; planejado em US-074b/074c, não implementado)
| Regra | Detalhe |
| :-- | :-- |
| Uso | Só clientes locais com `Authorization: Bearer` fixo (IDE, CLI, Inspector). Só em `POST /api/mcp`; nunca em `/api/oauth/*`, `/api/v1` ou como sessão. Claude.ai/ChatGPT continuam só por OAuth (ADR-030 §2) |
| Modelo | `McpGrant(kind=PAT, clientId=null)` + `McpToken(kind=PAT)`; `clientName` "Token pessoal" na auditoria (o nome dado pelo membro não vai) |
| Formato | `fmp_` + 32 bytes base64url (`^fmp_[A-Za-z0-9_-]{43}$`); banco só `sha256`; mostrado uma vez na criação (`no-store`; idempotência guarda sem o valor, replay = `tokenRedacted`) |
| Escopo e validade | `read` padrão; `write` com segunda ciência e nasce com `requireConfirmation = true`. Validade 7/30/90 dias (padrão 30, máx. 90), sem renovação |
| Chaves | `MCP_PAT_ENABLED` (env, padrão `false`) + `families.assistantPatEnabled` (padrão `false`, só ADMIN; desligar revoga os PAT) + `assistantAccessEnabled`. Qualquer uma desligada: 401 |
| Limites | 5 ativos por membro (409 `PAT_LIMIT_REACHED`); 10 criações/dia; transporte e limites de escrita iguais ao OAuth (contados por membro); 30 falhas de autenticação/min por IP em `/api/mcp` |
| Avisos | E-mail e aviso na Home ao criar; e-mail (1/dia por token) ao bater `RATE_LIMITED`/`LIMIT_EXCEEDED`; sem IP guardado |

## Invariantes
1. `lancar_despesa` e a confirmação de proposta passam pelo mesmo `createExpenseCore` do app: toda regra de domínio, "Só meu" (US-084) e idempotência (ADR-009) valem; não edita, exclui nem cria dividida.
2. Cada conexão é de UM membro de UMA família; token com audiência `resource` canônico; `Origin`/AS aceitam só `APP_URL` (nunca `*-<hash>.vercel.app`).
3. Cada rota MCP/OAuth falha fechada: sem allowlist de `client_id`, sem `MCP_ENABLED`, em preview ou com família bloqueada, nada funciona.
4. Nenhum conteúdo de usuário em logs ou auditoria do MCP.
5. Exclusão de conta/família revoga e apaga conexões, tokens, pedidos e limites (SEC-017d; spec 07).

## Riscos aceitos
| ID | Risco | Decisão / razão |
| :-- | :-- | :-- |
| ADR-030 §6-R2 | Injeção ou erro da LLM grava despesa indevida | Aceito (D-GES-36c/37); mitigação: escopo estreito, limites, data curta, selo, revisão semanal, auditoria, exclusão pelo app |
| LIMITS | "Sem limite" escolhido pelo membro | Aceito, com aviso, ciência e `LIMITS_CHANGED` |
| SEC-005 | Limite por IP forjável fora da Vercel (`x-real-ip`) | Aceito: depende da Vercel sobrescrever o cabeçalho; defesa extra por client_id e segredo |
| SEC-009 | Heurística `flagged` com falsos positivos/negativos | Aceito: marca sem bloquear nem reescrever |
| SEC-011 | Consent phishing | Mitigado (URL exata, nome do servidor, aviso de nova conexão); só confirmável na homologação real |
| ADR-043 | Token pessoal em texto claro na máquina do membro por até 90 dias | Aceito: `read` padrão, confirmação na escrita, chaves desligadas por padrão, limites, revogação imediata |
| Clientes | Só Claude (CIMD); ChatGPT/Gemini/DCR dependem de ampliação | Backlog (9 pts) |

## Fontes
Código `src/modules/mcp/`: `{handler,config,authorize,token-endpoint,tokens,cimd,verified-clients,grants,connections,limits,assistant-write,proposals,proposals-decide,proposals-schemas,audit,activity,review,new-connection,purge,revalidate,run-tool,rate-limit}.ts`, `tools/*.ts` (registro `mcp/tools.ts`). Rotas: `app/api/mcp`, `app/api/oauth/**`, `app/oauth/**`, `app/.well-known/**`. UI: `app/(app)/configuracoes/assistente`, `app/oauth/consent`. Scripts: `scripts/{mcp-admin,mcp-smoke,sec010-revalidate-mcp-clients}.ts`. Modelos `Mcp*`.
Testes: `tests/unit/mcp/*`; `tests/integration/{en006a-oauth,en006b-mcp,en007-cron-purge,sec009-texto-nao-confiavel,sec011-consentimento,us074-assistente,us075-ferramentas-leitura,us076-lancar-direto,us076c-proposta-confirmacao,us076c-limites-modo-lgpd,us077-atividade}`; `tests/helpers/{mcp-client,mcp-tools}.ts`.
Âncoras: SDD-024 (§11 normativo), 025, 026, 027 (§R2), 028; ADR-030 (rev. 2), ADR-031, ADR-043; D-GES-35/36/37, SEC-005/009/010/011/013/023/028, US-065..077.

## Pendências
- Usuário, antes de `MCP_ENABLED=true`: EN-007 aplicada, ensaio de restore, checklist SDD-024 §9 com `/security-review`, domínio decidido, `APP_URL=https://verbus-finance.vercel.app` (o `resource` fica gravado em cada conexão; trocar de domínio invalida conexões; nunca URLs de preview), `MCP_ENABLED=false` até lá.
- `MCP_CIMD_ALLOWED_CLIENT_IDS`: lista vazia = nenhum cliente. client_id do claude.ai NÃO conhecido; descobrir na primeira tentativa real, cadastrar e rodar `scripts/sec010-revalidate-mcp-clients.ts` (DEV-89).
- Cron de expurgo (MCP) em produção. Pós-ligar: `pnpm mcp:smoke`.
- D-GES-49: homologação com o claude.ai real (OAuth, consentimento, `lancar_despesa`), com MCP Inspector antes; reteste de segurança SEC-011 depende disso.
