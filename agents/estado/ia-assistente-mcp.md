# Estado vigente: IA e assistente (MCP)

Atualizado: 2026-10-26. Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit.

## a) Resumo para o usuário
- Duas frentes: (1) análise de gastos evitáveis por LLM (Anthropic), com opt-in do Administrador por família, só agregados, pré-visualização do payload e teto de custo; (2) servidor MCP próprio no Next (OAuth 2.1, escopos `read`/`write`), 8 ferramentas: 7 de leitura e `lancar_despesa`.
- Lançamento pelo assistente é DIRETO (sem proposta nem confirmação): D-GES-36c substituiu a confirmação em duas etapas. Salvaguardas: só despesa à vista "Só meu" do próprio membro, limites por membro (padrão R$ 500 / 10 por dia / 5 por hora), data até 60 dias atrás, idempotência, selo "via assistente", auditoria. Proposta + confirmação ficou só como backlog (US-076c, SDD-027 rev. 1); não existe no código.
- Código pronto e testado; NADA ligado em produção: `AI_FEATURES_ENABLED` e `MCP_ENABLED` dependem de ações do usuário (§e). Homologação com o claude.ai real nunca feita.
- Teto: R$ 5,00/família/mês (padrão, TL-27) + teto global obrigatório em produção (sugestão R$ 50) com alarme 50/80/100 %.
- Decisões que dependem do usuário: conta e chave Anthropic + limite na console (EXT-12); ligar MCP em produção após checklist; domínio definitivo (mantido `verbus-finance.vercel.app`); token pessoal (US-074b) e modo "exigir confirmação" (US-076c) seguem em backlog; importação de fatura por IA (R5) adiada.

## b) Regras vigentes

### IA (infra, SDD-021 / ADR-028)
| # | Regra | Código |
| :-: | :-- | :-- |
| 1 | Única porta de chamada ao LLM: `runLlm` (consentimento, reserva de teto, chamada fora de transação, validação Zod, acerto). Histórias não chamam o provedor direto | `ia/run.ts` |
| 2 | Provedor: `LLM_PROVIDER=fake` (padrão) ou `anthropic`. `anthropic` é PROIBIDO em teste (`NODE_ENV=test`) e homologação (`APP_HOMOLOG_MODE`) | `ia/config.ts`, `ia/provider.ts` |
| 3 | Disponível só com `AI_FEATURES_ENABLED=true`. Em produção com IA ligada: exige provedor `anthropic`, `LLM_GLOBAL_MONTHLY_CAP_CENTS` e `OPS_ALERT_EMAIL`, senão o boot falha | `ia/config.ts` |
| 4 | Modelo padrão `claude-haiku-5-5`, esforço `low`, saída máx. 3000 tokens, timeout 30 s, prazo total 60 s, 1 retry, câmbio 6,00; modelo sem preço conhecido derruba o boot (`LLM_PRICES_JSON`) | `ia/config.ts`, `ia/pricing.ts` |
| 5 | Teto por família/mês: `families.aiMonthlyCapCents` ou `LLM_MONTHLY_CAP_CENTS` (padrão 500 centavos). Teto global: `LLM_GLOBAL_MONTHLY_CAP_CENTS` (padrão 100000 só em dev/teste) | `ia/repo.ts`, `ia/config.ts` |
| 6 | Decisão: gasto ≥ teto = `exceeded`; gasto + reservado + estimativa > teto = `estimate_exceeds`; global estourado = `global_exceeded` (IA indisponível para todos). Reserva e acerto atômicos sob `FOR UPDATE` (ordem de trava: família, depois global) | `ia/budget.ts`, `ia/repo.ts` |
| 7 | Reserva órfã vence em 10 min e conta como gasta (conservador). Cancelamento sem `usage` cobra a estimativa inteira | `ia/budget.ts`, `ia/run.ts` |
| 8 | Alarme do teto global a 50/80/100 % (log + e-mail a `OPS_ALERT_EMAIL`, melhor esforço, depois do commit) | `ia/global-alert.ts` |
| 9 | Log único por chamada, sem conteúdo (modelo, tokens, custo, latência, outcome). Tabelas de consumo guardam só números/enum | `ia/run.ts`, `ia/repo.ts` |
| 10 | Retenção 24 meses para `llm_usage_events` e análises; expurgo por cron e `pnpm ai:purge-usage` / `ai:purge-analyses`; `pnpm ai:set-cap` ajusta o teto da família | `ia/purge.ts`, `scripts/ai-admin.ts` |

### Opt-in de privacidade (SDD-022 / ADR-029 / EN-005)
| # | Regra |
| :-: | :-- |
| 1 | Consentimento por família e FINALIDADE (`SPENDING_ANALYSIS`; `INVOICE_IMPORT` indisponível, R5). Só o Administrador liga/desliga (403 caso contrário); todos veem o estado (`GET /ai/settings`) |
| 2 | Estado efetivo é CALCULADO do último evento (`ai_consent_events`): `ON` só se último = ENABLED com a versão vigente do texto; senão `OFF` ou `NEEDS_RECONSENT`. Nenhum evento é apagado |
| 3 | Texto versionado no código (versão 1 hoje); ligar exige `textVersion` vigente (`CONSENT_TEXT_OUTDATED`) e `familyVersion` (conflito otimista). Mudar o texto exige subir a versão (teste de snapshot com hash) |
| 4 | Guarda de envio na MESMA transação da reserva, com `families FOR SHARE`: desligar concorrente vence; nada sai depois de desligar. Ligar/desligar é idempotente e grava `FamilyEvent AI_CONSENT_CHANGED` |
| 5 | O texto NÃO promete retenção zero nem "sem treino" (TL-26) e declara transferência internacional (EUA) |

### Análise de gastos evitáveis (SDD-023 / US-070..073)
| # | Regra |
| :-: | :-- |
| 1 | Payload CONSTRUÍDO (nunca filtrado), `.strict()` em todos os níveis: meses relativos (`rel` -5..0), totais e contagem por categoria (ref `C1..`), recorrentes (ref `R1..`, máx. 15). Único texto livre: rótulo da categoria, saneado (sem dígitos, `@`, `:`; sem nomes/e-mails de membros) |
| 2 | Nunca enviados: nomes/e-mails, descrições, notas, contas, cartões, datas, ids. Acrescentar campo exige mudar teste de chaves e ADR-029 |
| 3 | Elegível: janela de até 6 períodos; períodos iniciais sem despesa descartados; ≥ 2 períodos com despesa. Senão `NOT_ENOUGH_MONTHS` |
| 4 | Pré-visualização (`GET /ai/spending-analysis/preview`) NÃO chama o LLM; devolve payload, versão legível e `previewHash`. O pedido exige o mesmo hash; dado mudou = 409 `PREVIEW_STALE`. Estimativa de custo só para Administrador |
| 5 | Pedido (`POST /ai/spending-analyses`): qualquer membro. Máx. 3 análises por família e período (`ANALYSIS_LIMIT`, advisory lock, rechecado antes de gravar). Mês corrente é permitido (`partial`); futuro = `PERIOD_OUT_OF_RANGE` |
| 6 | Recorrentes: séries previstas pagas + detectadas por descrição normalizada (mín. 2 períodos se janela ≤ 3, senão 3; dispersão máx. 1,5). Saída do LLM validada e reconciliada com o payload (`reconcileOutput`); inválida = 502 `LLM_INVALID_RESPONSE` sem gravar |
| 7 | Descarte "Importante para nós" (US-071): DA FAMÍLIA, por categoria+descrição normalizada ou série; descartado não entra mais no payload; o motivo opcional (≤ 140) nunca sai do banco |
| 8 | Histórico (US-073): análises ficam gravadas (payload, resultado, refMap); qualquer membro vê "dados enviados"; apagar uma ou todas é físico; consumo (`llm_usage_events`) fica com `analysisId` nulo; descartes permanecem |
| 9 | Nenhuma escrita em dados de domínio. Aviso fixo "Análise educativa..." |
| 10 | Sugestão de categoria (US-072): REGRA LOCAL, sem IA e sem consentimento (mín. 3 lançamentos iguais, ≥ 70 % na categoria-alvo, máx. 20). Lista só o que o ator pode escrever; aceitar chama `assertCanWriteTransaction`; vale em fatura paga e conta arquivada (D-PO-46) |

### Servidor MCP / OAuth (SDD-024..027 / ADR-030)
| # | Regra | Código |
| :-: | :-- | :-- |
| 1 | Recurso `${APP_URL}/api/mcp`, stateless; OAuth 2.1 próprio no mesmo app (`/oauth/authorize`, `/api/oauth/{token,revoke,authorize/decision}`, `/.well-known/oauth-{authorization-server,protected-resource}`). Resposta 404 quando desligado | `mcp/handler.ts`, `mcp/config.ts` |
| 2 | Liga só com `MCP_ENABLED=true`; `VERCEL_ENV=preview` SEMPRE desliga. Em produção exige `APP_URL` https | `mcp/config.ts` |
| 3 | Clientes: só CIMD cuja URL EXATA de `client_id` está em `MCP_CIMD_ALLOWED_CLIENT_IDS` (vazia = nenhum cliente aceito). `MCP_CIMD_ALLOWED_HOSTS` obsoleta e ignorada (SEC-010). Sem DCR/`registration_endpoint` no POC. Nome exibido definido no servidor por domínio (`claude.ai` = "Claude"); cliente não verificado aparece como tal (SEC-011) | `mcp/cimd.ts`, `mcp/verified-clients.ts` |
| 4 | Escopos `read`, `write` (`offline_access` aceito, sem virar permissão). Escrita exige opt-in explícito e segunda ciência (`writeAcknowledged`) na tela de consentimento. Cookie de vínculo do consentimento (`__Host-mcp_authz` em https) | `mcp/authorize.ts`, `mcp/consent-binding.ts` |
| 5 | Prazos: acesso 60 min; código 60 s; pedido de autorização 10 min; conexão 30 ou 90 dias; auditoria 12 meses. Tokens guardados só como hash SHA-256; reuso de código/refresh revoga a conexão (`CODE_REUSE`/`REFRESH_REUSE`) | `mcp/config.ts`, `mcp/tokens.ts`, `mcp/token-endpoint.ts` |
| 6 | Limites de transporte FIXOS: grant 60/min e 1000/dia; /token 30/min por IP+client_id e 10 falhas/min por segredo (troca correta nunca é barrada, SEC-028); authorize 20/min; corpo máx. 64 KB | `mcp/config.ts`, `mcp/rate-limit.ts` |
| 7 | Funciona POR MEMBRO; ignora "ocultar valores" (decisão do usuário). Conexão revogada na saída/remoção do membro. Administrador pode bloquear o acesso do assistente para a família (`assistantAccessEnabled`) | `mcp/grants.ts`, `mcp/connections.ts` |
| 8 | Auditoria append-only SEM conteúdo: `params` só com chaves da allowlist; eventos de conexão/revogação/bloqueio/`LIMITS_CHANGED`; aviso "nova conexão" na Home e e-mail (SEC-011); revisão semanal do que o assistente lançou (`review.ts`, janela 7 dias) | `mcp/audit.ts`, `mcp/new-connection.ts`, `mcp/review.ts` |
| 9 | Expurgo: auditoria > 12 meses, tokens vencidos > 7 dias, pedidos expirados, clientes sem uso > 30 dias, buckets > 2 dias (cron `/api/cron/purge` ou `pnpm mcp:purge`) | `mcp/purge.ts` |

| Ferramenta | Escopo | Observação |
| :-- | :-: | :-- |
| `cartoes_e_faturas`, `consultar_saldos`, `gastos_por_categoria`, `listar_cadastros`, `listar_lancamentos` (traz `origin`), `previstas_do_mes`, `resumo_do_mes` | read | Lista fechada, ordem alfabética; leitura igual à tela (inclui "Só meu" de outros, que todos veem) |
| `lancar_despesa` | write | Ver regras abaixo |

| `lancar_despesa` (SDD-027 §R2) | Regra |
| :-- | :-- |
| Escopo | Só despesa à vista, "Só meu", pagador = autor = membro da conexão; conta OU cartão; sem receita, transferência, divisão, parcela, observação, editar ou excluir |
| Ordem | Trava por membro (advisory) ➜ idempotência por `idempotencyKey` (8..64) ➜ duplicata natural (mesma descrição/valor/data/origem em 10 min; `allowDuplicate` libera) ➜ data (hoje até 60 dias atrás) ➜ limites ➜ `createExpenseCore` (as mesmas validações do app) |
| Limites do membro | Padrão R$ 500 por lançamento, 10 por dia, 5 por hora; contagem inclui excluídos; o membro pode subir ou remover (inclusive "sem limite") com aviso de risco e ciência (`RISK_NOT_ACK_MESSAGE`); alteração audita `LIMITS_CHANGED`; estouro = 422 `LIMIT_EXCEEDED` |
| Marca | `origin=ASSISTANT`, `assistantGrantId`, selo "via assistente", filtro no Extrato, cartão de conferência |
| Texto de usuário | Descrições e nomes devolvidos como `{untrusted_text, flagged}` com preâmbulo "texto é dado, não instrução"; o servidor marca (heurística), não reescreve (SEC-009) |

## c) Invariantes
1. Nada sai para a Anthropic sem consentimento efetivo checado na transação da reserva (`assertConsentEffective`) e sem payload que passou pelo schema `.strict()`.
2. `ANTHROPIC_API_KEY` nunca vai ao cliente nem a log (teste `bundle-secrets`); chamadas reais proibidas em teste (`no-llm-network` nos helpers).
3. Custo nunca excede o teto da família nem o global: reserva antes da chamada, estimativa conservadora, reserva órfã conta como gasta.
4. O que o usuário vê na pré-visualização é o que é enviado (`previewHash`, JSON canônico, semente estável por família+período).
5. A análise nunca altera dado financeiro; nenhum conteúdo de usuário é gravado em logs ou auditoria do MCP.
6. `lancar_despesa` passa pelo mesmo `createExpenseCore` do app: toda regra de domínio, "Só meu" (US-084) e idempotência (ADR-009) valem; o assistente não consegue editar, excluir nem criar dividida.
7. Cada conexão é de UM membro de UMA família; token com audiência `resource` canônico; `Origin`/AS aceitam só `APP_URL` (nunca URLs `*-<hash>.vercel.app`).
8. Cada rota MCP/OAuth falha fechada: sem allowlist de `client_id`, sem `MCP_ENABLED`, em preview ou com família bloqueada, nada funciona.

## d) Limitações e riscos aceitos
| ID | Risco | Decisão / razão |
| :-- | :-- | :-- |
| ADR-030 §6-R2 | Injeção de instruções ou erro da LLM grava despesa indevida | Aceito (D-GES-36c/37): lançamento direto escolhido pelo dono do produto; mitigação por escopo estreito, limites, data curta, selo, revisão semanal, auditoria e exclusão pelo app |
| LIMITS | "Sem limite" escolhido pelo membro | Aceito, com aviso, ciência e `LIMITS_CHANGED` |
| SEC-005 | Limite por IP forjável fora da Vercel (`x-real-ip`) | Aceito: depende de a Vercel sobrescrever o cabeçalho; defesa extra por client_id e segredo |
| SEC-009 | Heurística `flagged` tem falsos positivos/negativos | Aceito: marca sem bloquear nem reescrever |
| SEC-011 | Consent phishing | Mitigado (cliente verificado por URL exata, nome do servidor, aviso de nova conexão); só confirmável na homologação real com o claude.ai |
| TL-26 | Retenção da Anthropic fora do nosso controle | Texto do opt-in não promete retenção zero |
| CSP | CSP de scripts só em Report-Only (D-GES-41) | Pendente de validação em navegador real |
| Agregados | Totais e recorrentes da análise incluem despesas "Só meu" de outros membros (`expenseByCategory` e a query de descrição não filtram `isSharedExpense`), sem identificar quem lançou | Respondida aqui a dúvida do estado "Só meu" §e: agregados vão à IA com "Só meu" incluso. Risco baixo (rótulo + total), mas é decisão implícita; confirmar com o usuário se o opt-in deve cobrir isso |
| US-076c / US-074b | Sem modo "exigir confirmação" nem token pessoal | Fora do POC por decisão do usuário (backlog) |
| Clientes | Só Claude (CIMD) no POC; ChatGPT/Gemini/DCR dependem de ampliação | Backlog (9 pts) |
| R5 | Importação de fatura por IA adiada (D-GES-28/33) | `INVOICE_IMPORT` sem texto de consentimento |

## e) Em andamento / pendências
Nada em implementação. Falta ligar/homologar. Ações do USUÁRIO (de `manager/pendencias-externas.md` e `checklist-vercel-producao.md`):
| ID | Pendência | Estado |
| :-- | :-- | :-- |
| EXT-12 | Criar conta e chave Anthropic; guardar `ANTHROPIC_API_KEY` (só Production); definir limite de gasto na console; definir teto mensal por família | Aberto; sem isso a IA fica indisponível em produção |
| CHK 9.2/9.5 | `LLM_GLOBAL_MONTHLY_CAP_CENTS` (sugestão 5000) e `OPS_ALERT_EMAIL`, antes de `AI_FEATURES_ENABLED=true` | Aberto |
| CHK 1.3 | `ANTHROPIC_API_KEY` e demais segredos só em Production, não em Preview/"All Environments" | Aberto |
| CHK mapa | Variáveis a conferir na Vercel: `LLM_PROVIDER=anthropic`, `AI_FEATURES_ENABLED`, `LLM_MODEL_ANALYSIS`, `LLM_PRICES_JSON`; `MCP_ENABLED` fica `false` até o Bloco 7 | Aberto |
| CHK 9.4 | `MCP_CIMD_ALLOWED_CLIENT_IDS`: lista vazia = nenhum cliente. Descobrir a URL do `client_id` do claude.ai na primeira tentativa real (tela de consentimento/log), cadastrar e rodar uma vez `scripts/sec010-revalidate-mcp-clients.ts` (DEV-89) | Aberto; client_id NÃO conhecido |
| CHK 7.x | Antes de `MCP_ENABLED=true`: EN-007 aplicada (blocos 5 e 6), ensaio de restore, checklist SDD-024 §9 com `/security-review`, domínio decidido (4.2), opções do MCP (7.5) | Aberto |
| CHK 8.3 | Pós-ligar: `pnpm mcp:smoke` | Aberto |
| CHK 4.2/4.3 | `APP_URL` = `https://verbus-finance.vercel.app` (o `resource` fica gravado em cada conexão; trocar de domínio invalida conexões); nunca URLs de preview | Aberto |
| CHK risco 7 / 5.4 | Cron de expurgo (IA 24 meses, MCP) precisa rodar em produção | Aberto |
| D-GES-34 | `pnpm ai:golden` (SDD-023 §8.4) como tarefa ANTES de ligar a IA em produção; o script NÃO existe em `package.json` | Aberto (Dev) |
| D-GES-34 | Entrada da análise em Família até existir o menu de Análise (US-048/049) | Não confirmado |
| D-GES-49 | Homologação com o claude.ai real (fluxo OAuth, consentimento, `lancar_despesa`): ação do usuário; MCP Inspector antes | Aberto |
| SEC-011 | Reteste de segurança condicionado a essa homologação | Aberto |
Ver também: o `MCP_CIMD_ALLOWED_HOSTS` citado na linha do bloco de variáveis do checklist está obsoleto (use `MCP_CIMD_ALLOWED_CLIENT_IDS`).

## f) Mapa de fontes
Código (`src/modules/`): `ia/{run,config,budget,repo,consent,consent-texts,pricing,provider,anthropic-adapter,fake-adapter,global-alert,purge,errors}.ts`; `analise-ia/{service,payload,aggregates,recurring,output,dismissals,suggestions,rules-category-suggestion,build-dto,prompt,hooks}.ts`; `mcp/{handler,config,authorize,token-endpoint,tokens,cimd,verified-clients,grants,connections,limits,assistant-write,audit,activity,review,new-connection,purge,revalidate,run-tool,rate-limit}.ts` e `mcp/tools/*.ts` (registro em `mcp/tools.ts`). Rotas: `app/api/v1/ai/**`, `app/api/mcp`, `app/api/oauth/**`, `app/oauth/**`, `app/.well-known/**`. UI: `app/(app)/configuracoes/assistente`, `app/oauth/consent`. Scripts: `scripts/{ai-admin,mcp-admin,mcp-smoke,sec010-revalidate-mcp-clients}.ts`. Modelos: `LlmBudgetMonth`, `LlmGlobalBudgetMonth`, `LlmUsageEvent`, `AiConsentEvent`, `SpendingAnalysis`, `AvoidableDismissal`, `Mcp*` (`prisma/schema.prisma`).
Testes: `tests/unit/ia/*`, `tests/unit/analise-ia/*`, `tests/unit/mcp/*`; `tests/integration/` `en004-{run-llm,orcamento,uso-api,scripts}`, `en005-{consentimento,payload-envio}`, `en006a-oauth`, `en006b-mcp`, `en007-cron-purge`, `sec009-texto-nao-confiavel`, `sec011-consentimento`, `sec013-teto-global`, `us-070a/070b/071/072/073`, `us074-assistente`, `us075-ferramentas-leitura`, `us076-lancar-direto`, `us077-atividade`; helpers `tests/helpers/{mcp-client,mcp-tools,no-llm-network}.ts`.
Docs: SDD [021](../tech-lead/sdd/SDD-021-infra-llm-en-004.md), [022](../tech-lead/sdd/SDD-022-opt-in-privacidade-en-005.md), [023](../tech-lead/sdd/SDD-023-analise-de-gastos-evitaveis.md), [024](../tech-lead/sdd/SDD-024-mcp-base-oauth-escopo-auditoria-en-006.md) (§11 normativo), [025](../tech-lead/sdd/SDD-025-mcp-conexoes-e-revogacao-us-074.md) (§8), [026](../tech-lead/sdd/SDD-026-mcp-ferramentas-de-leitura-us-075.md), [027](../tech-lead/sdd/SDD-027-mcp-proposta-confirmacao-e-auditoria-us-076-077.md) (§R2 normativo), SDD-028 (§3..5 SEC-009/010/011/013); ADR [028](../tech-lead/adrs/ADR-028-integracao-llm-cliente-unico-e-teto-de-custo.md), [029](../tech-lead/adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md), [030](../tech-lead/adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md) (rev. 2), ADR-031 (Vercel). US 065..077 em `product-owner/backlog/stories/`. Deploy: [pendencias-externas](../manager/pendencias-externas.md) (EXT-12), [checklist-vercel-producao](../manager/checklist-vercel-producao.md) (blocos 1, 4, 7, 8, 9).

| Regra | Origem |
| :-- | :-- |
| Opt-in por família, anonimização máxima, chave única do app | D-GES-27, Q-U01/U08 |
| Só agregados; ordem da R4; US-072 por regra local; retenção 24 meses; teto R$ 5 | D-GES-29, D-GES-32 (TL-23..27) |
| MCP por membro, ignora "ocultar valores", OAuth | D-GES-35 |
| Lançamento direto; prazos 30/90 dias, 60 min, 12 meses; Vercel | D-GES-36, D-GES-37, D-PO-77 |
| Limites padrão R$ 500 / 10 / 5; PAT em backlog | D-GES-37, TL-47 |
| Teto global, CIMD exato, consent phishing, injeção | SEC-013, SEC-010, SEC-011, SEC-009 (D-GES-43, DEV-88..96) |
| Rate limit /token | SEC-005, SEC-023, SEC-028 (D-GES-47) |
| Exclusão de conta/família purga IA e MCP | SEC-017d (DEV-101..105) |

Divergências docs x código (código vence):
1. Título/nome de SDD-027, US-076 e ADR-030 ("proposta/confirmação", "duas etapas") descrevem a revisão 1; vigente = lançamento direto (D-GES-36c; SDD-027 §R2). Não há proposta, confirmação nem tabela de propostas no fluxo ativo (`proposalId` sobra só na allowlist de auditoria). D-GES-35 ("sempre em duas etapas") está superada por D-GES-36c.
2. `checklist-vercel-producao.md` (variáveis) cita `MCP_CIMD_ALLOWED_HOSTS` ("POC: claude.ai"): obsoleta e ignorada; vale `MCP_CIMD_ALLOWED_CLIENT_IDS` (URL exata). Itens "confirmar no SDD-021/028" já resolvidos: nomes em §b.
3. SDD-024 original prevê DCR e `registration_endpoint`; o POC (§11.2) não os tem. Metadados e código não anunciam DCR.
4. `pnpm ai:golden` exigido em D-GES-34 e SDD-023 §8.4 não existe.
5. Brief da área cita "ferramentas de escrita com proposta/confirmação" no plural: há UMA ferramenta de escrita e ela é direta.
6. US-076 (rev. 1) e US-076c ainda descrevem a proposta de 30 min; só US-076c é backlog válido.
