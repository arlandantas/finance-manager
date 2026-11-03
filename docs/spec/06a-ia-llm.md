# Spec 06a — IA (LLM), opt-in e análise de gastos

Atualizado: 2026-10-26

## Resumo
- Análise de gastos evitáveis por LLM (Anthropic): opt-in do Administrador por família, só agregados, pré-visualização do payload e teto de custo. Servidor MCP em `06b-mcp.md`.
- Código pronto e testado; NADA ligado em produção (`AI_FEATURES_ENABLED` depende de ações do usuário).
- Teto: R$ 5,00/família/mês (padrão, TL-27) + teto global obrigatório em produção (sugestão R$ 50) com alarme 50/80/100 %.

## Regras
### Infra (SDD-021 / ADR-028)
| # | Regra | Código |
| :-: | :-- | :-- |
| 1 | Única porta ao LLM: `runLlm` (consentimento, reserva de teto, chamada fora de transação, validação Zod, acerto). Histórias não chamam o provedor direto | `ia/run.ts` |
| 2 | `LLM_PROVIDER=fake` (padrão) ou `anthropic`; `anthropic` PROIBIDO em teste (`NODE_ENV=test`) e homologação (`APP_HOMOLOG_MODE`) | `ia/config.ts`, `ia/provider.ts` |
| 3 | Só com `AI_FEATURES_ENABLED=true`. Produção com IA: exige provedor `anthropic`, `LLM_GLOBAL_MONTHLY_CAP_CENTS` e `OPS_ALERT_EMAIL`, senão o boot falha | `ia/config.ts` |
| 4 | Modelo padrão `claude-haiku-5-5`, esforço `low`, saída máx. 3000 tokens, timeout 30 s, prazo total 60 s, 1 retry, câmbio 6,00; modelo sem preço conhecido derruba o boot (`LLM_PRICES_JSON`) | `ia/config.ts`, `ia/pricing.ts` |
| 5 | Teto por família/mês: `families.aiMonthlyCapCents` ou `LLM_MONTHLY_CAP_CENTS` (padrão 500). Global: `LLM_GLOBAL_MONTHLY_CAP_CENTS` (padrão 100000 só em dev/teste) | `ia/repo.ts`, `ia/config.ts` |
| 6 | Gasto ≥ teto = `exceeded`; gasto+reservado+estimativa > teto = `estimate_exceeds`; global estourado = `global_exceeded` (IA indisponível a todos). Reserva e acerto atômicos sob `FOR UPDATE` (trava: família, depois global) | `ia/budget.ts`, `ia/repo.ts` |
| 7 | Reserva órfã vence em 10 min e conta como gasta. Cancelamento sem `usage` cobra a estimativa inteira | `ia/budget.ts`, `ia/run.ts` |
| 8 | Alarme do teto global a 50/80/100 % (log + e-mail a `OPS_ALERT_EMAIL`, melhor esforço, pós-commit) | `ia/global-alert.ts` |
| 9 | Log único por chamada, sem conteúdo (modelo, tokens, custo, latência, outcome); tabelas de consumo só números/enum | `ia/run.ts`, `ia/repo.ts` |
| 10 | Retenção 24 meses (`llm_usage_events`, análises); expurgo por cron e `pnpm ai:purge-usage`/`ai:purge-analyses`; `pnpm ai:set-cap` ajusta o teto | `ia/purge.ts`, `scripts/ai-admin.ts` |

### Opt-in (SDD-022 / ADR-029 / EN-005)
| # | Regra |
| :-: | :-- |
| 1 | Consentimento por família e FINALIDADE (`SPENDING_ANALYSIS`; `INVOICE_IMPORT` indisponível, R5). Só Administrador liga/desliga (403); todos veem o estado (`GET /ai/settings`) |
| 2 | Estado efetivo CALCULADO do último evento (`ai_consent_events`): `ON` só se último = ENABLED com versão vigente do texto; senão `OFF` ou `NEEDS_RECONSENT`. Evento nunca apagado |
| 3 | Texto versionado no código (versão 1); ligar exige `textVersion` vigente (`CONSENT_TEXT_OUTDATED`) e `familyVersion` (conflito otimista). Mudar texto exige subir versão (snapshot com hash) |
| 4 | Guarda de envio na MESMA transação da reserva, com `families FOR SHARE`: desligar concorrente vence. Ligar/desligar idempotente; grava `FamilyEvent AI_CONSENT_CHANGED` |
| 5 | O texto NÃO promete retenção zero nem "sem treino" (TL-26) e declara transferência internacional (EUA) |

### Análise de gastos evitáveis (SDD-023 / US-070..073)
| # | Regra |
| :-: | :-- |
| 1 | Payload CONSTRUÍDO (nunca filtrado), `.strict()` em todos os níveis: meses relativos (`rel` -5..0), totais e contagem por categoria (ref `C1..`), recorrentes (ref `R1..`, máx. 15). Único texto livre: rótulo da categoria saneado (sem dígitos, `@`, `:`; sem nomes/e-mails) |
| 2 | Nunca enviados: nomes/e-mails, descrições, notas, contas, cartões, datas, ids. Novo campo exige mudar teste de chaves e ADR-029 |
| 3 | Elegível: até 6 períodos; iniciais sem despesa descartados; ≥2 períodos com despesa, senão `NOT_ENOUGH_MONTHS` |
| 4 | Pré-visualização (`GET /ai/spending-analysis/preview`) NÃO chama o LLM; devolve payload, versão legível e `previewHash`. Pedido exige o mesmo hash; mudou = 409 `PREVIEW_STALE`. Estimativa de custo só ao Administrador |
| 5 | Pedido (`POST /ai/spending-analyses`): qualquer membro. Máx. 3 análises por família e período (`ANALYSIS_LIMIT`, advisory lock, rechecado antes de gravar). Mês corrente permitido (`partial`); futuro = `PERIOD_OUT_OF_RANGE` |
| 6 | Recorrentes: séries previstas pagas + detectadas por descrição normalizada (mín. 2 períodos se janela ≤3, senão 3; dispersão máx. 1,5). Saída validada e reconciliada (`reconcileOutput`); inválida = 502 `LLM_INVALID_RESPONSE` sem gravar |
| 7 | Descarte "Importante para nós" (US-071): DA FAMÍLIA, por categoria+descrição normalizada ou série; descartado sai do payload; motivo opcional (≤140) nunca sai do banco |
| 8 | Histórico (US-073): análises gravadas (payload, resultado, refMap); qualquer membro vê "dados enviados"; apagar uma ou todas é físico; `llm_usage_events` fica com `analysisId` nulo; descartes permanecem |
| 9 | Nenhuma escrita em dados de domínio. Aviso fixo "Análise educativa..." |
| 10 | Sugestão de categoria (US-072): REGRA LOCAL, sem IA e sem consentimento (mín. 3 lançamentos iguais, ≥70 % na categoria-alvo, máx. 20). Lista só o que o ator pode escrever; aceitar chama `assertCanWriteTransaction`; vale em fatura paga e conta arquivada (D-PO-46) |

## Invariantes
1. Nada sai para a Anthropic sem consentimento efetivo checado na transação da reserva (`assertConsentEffective`) e sem payload que passou pelo schema `.strict()`.
2. `ANTHROPIC_API_KEY` nunca vai ao cliente nem a log (teste `bundle-secrets`); chamadas reais proibidas em teste (`no-llm-network`).
3. Custo nunca excede o teto da família nem o global: reserva antes da chamada, estimativa conservadora, órfã conta como gasta.
4. O que o usuário vê na pré-visualização é o que é enviado (`previewHash`, JSON canônico, semente estável por família+período).
5. A análise nunca altera dado financeiro; nenhum conteúdo de usuário em logs.
6. Exclusão de conta/família purga dados de IA (SEC-017d; ver spec 07).

## Riscos aceitos
| ID | Risco | Decisão |
| :-- | :-- | :-- |
| TL-26 | Retenção da Anthropic fora do nosso controle | Texto do opt-in não promete retenção zero |
| Agregados | Totais e recorrentes incluem despesas "Só meu" de outros membros (`expenseByCategory` e query de descrição não filtram `isSharedExpense`), sem identificar o autor | Risco baixo; decisão implícita. PERGUNTA PENDENTE ao usuário; recomendação: excluir "Só meu" alheio dos agregados |
| R5 | Importação de fatura por IA adiada (D-GES-28/33) | `INVOICE_IMPORT` sem texto de consentimento |
| CSP | CSP de scripts só Report-Only (D-GES-41) | Pendente de navegador real |

## Fontes
Código `src/modules/`: `ia/{run,config,budget,repo,consent,consent-texts,pricing,provider,anthropic-adapter,fake-adapter,global-alert,purge,errors}.ts`; `analise-ia/{service,payload,aggregates,recurring,output,dismissals,suggestions,rules-category-suggestion,build-dto,prompt,hooks}.ts`; rotas `app/api/v1/ai/**`; UI `app/(app)/configuracoes/assistente`; `scripts/ai-admin.ts`. Modelos: `LlmBudgetMonth`, `LlmGlobalBudgetMonth`, `LlmUsageEvent`, `AiConsentEvent`, `SpendingAnalysis`, `AvoidableDismissal`.
Testes: `tests/unit/ia/*`, `tests/unit/analise-ia/*`; `tests/integration/{en004-run-llm,en004-orcamento,en004-uso-api,en004-scripts,en005-consentimento,en005-payload-envio,sec013-teto-global,us-070a,us-070b,us-071,us-072,us-073}`; `tests/helpers/no-llm-network.ts`.
Âncoras: SDD-021/022/023, ADR-028/029; D-GES-27/29/32 (opt-in, só agregados, retenção 24 meses, teto R$ 5), SEC-013 (D-GES-43).

## Pendências
- EXT-12 (usuário): conta e chave Anthropic, `ANTHROPIC_API_KEY` só em Production, limite de gasto na console, teto por família. Sem isso a IA fica indisponível em produção.
- Antes de `AI_FEATURES_ENABLED=true`: `LLM_GLOBAL_MONTHLY_CAP_CENTS` (sugestão 5000), `OPS_ALERT_EMAIL`; conferir `LLM_PROVIDER=anthropic`, `LLM_MODEL_ANALYSIS`, `LLM_PRICES_JSON`; cron de expurgo rodando em produção.
- D-GES-34: `pnpm ai:golden` (SDD-023 §8.4) deve existir antes de ligar a IA; NÃO existe em `package.json` (tarefa Dev). Entrada da análise em Família até existir o menu de Análise (US-048/049): não confirmado.
