# Respostas do Tech Lead — R4-D (acesso por assistente de IA via MCP)

> **Atualizado por [`respostas-r4d-v2.md`](respostas-r4d-v2.md) (D-GES-36):** hospedagem Vercel (ADR-031), lançamento direto (sem confirmação no app), POC com Claude, estimativas e pendências novas. Este arquivo fica como histórico.

*Atualizado: 2026-10-24 · De: Agente Tech Lead · Para: Gestor e Product Owner · Cópia: Stakeholder, Dev & QA*
*Responde a [`pedidos-ao-tech-lead-ia.md`](../product-owner/backlog/pedidos-ao-tech-lead-ia.md) §3 (EN-006, US-074..077), com as decisões do usuário em **D-GES-35** (por membro; ignora "ocultar valores"; leitura **e** lançamento em duas etapas; Claude, Gemini e ChatGPT com OAuth; preferência por Next na Vercel; LLM do usuário).*

## 1. Resumo (uma tela)
| Item | Resposta |
| :-- | :-- |
| **Entregue** | [ADR-030](adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md) (arquitetura, OAuth, segurança, hospedagem, ameaças) · [SDD-024](sdd/SDD-024-mcp-base-oauth-escopo-auditoria-en-006.md) (EN-006) · [SDD-025](sdd/SDD-025-mcp-conexoes-e-revogacao-us-074.md) (US-074) · [SDD-026](sdd/SDD-026-mcp-ferramentas-de-leitura-us-075.md) (US-075) · [SDD-027](sdd/SDD-027-mcp-proposta-confirmacao-e-auditoria-us-076-077.md) (US-076, US-077). Todos **Aprovados para Desenvolvimento**, condicionados à aprovação do Gestor (TL-34); hospedagem é decisão do usuário (TL-35) e **não bloqueia** o desenvolvimento. |
| **Arquitetura** | Rota `POST /api/mcp` **dentro do app Next**, *stateless* (nada em memória), mesmos serviços das telas; **o app é o próprio Authorization Server OAuth 2.1** (PKCE S256, CIMD + DCR, `resource`/audiência, `iss`, *tokens* opacos com *hash*, acesso 60 min, *refresh* rotativo com detecção de reuso, conexão de 30/90 dias); consentimento reaproveita a sessão Google do app. |
| **Clientes** | **Claude** (web/Desktop/mobile/Code): ✔ confirmado, inclusive no plano Free (1 conector). **ChatGPT** (web, modo desenvolvedor): ✔ tecnicamente confirmado; **planos não confirmados** na fonte oficial. **Gemini app**: ✘ **no Brasil** (só EUA, 18+, inglês, conta pessoal). **Gemini CLI**: substituído pelo **Antigravity CLI** em 2026-06-18 (contas pessoais); o Antigravity aceita MCP remoto com OAuth/DCR — melhor esforço, não confirmado em detalhe. §2. |
| **Lançamento** | Ferramenta só **propõe**; o membro **confirma no app** (link `confirmUrl`, 30 min). Não existe ferramenta de confirmar, editar ou excluir ⇒ uma LLM enganada por injeção não grava nada sozinha. Idempotência por chave da LLM + conteúdo; confirmação 1:1. |
| **Hospedagem** | **Recomendo manter o ADR-026 (Railway)** com o MCP dentro do mesmo app (0 pt extra, sem *cold start*, *deploy* barrado por *healthcheck*). Vercel para o app inteiro é viável (+3 pts, substitui o ADR-026). "Vercel só para o MCP" desaconselhado. **Decisão do usuário (TL-35).** |
| **Pontos** | **31** (PO: 26): EN-006 **13** (a 8 + b 5) · US-074 5 · US-075 5 · US-076 5 · US-077 3. +3 se a hospedagem mudar para a Vercel. |
| **Custo** | Zero de LLM para o app (a LLM é do usuário). Hospedagem igual (Railway ~US$ 5/mês) ou Vercel Hobby gratuito + banco. O custo de plano do cliente de IA é do usuário (Claude Free basta para 1 conector; ChatGPT exige plano com modo desenvolvedor). |
| **Achados** | (1) O `proxy.ts` redirecionaria `/.well-known/*` para `/login` — corrigir o *matcher*. (2) Não existe conta privada no produto: "mesmas permissões do membro" = toda a família (cenário "Poupança visível só para Mariana" não se aplica). (3) A "credencial mostrada uma vez" do PO não existe com OAuth: o membro cola só a URL. (4) A especificação MCP corrente (2026-07-28) é *stateless*, mas os clientes ainda falam a 2025-11-25 ⇒ servidor nas duas eras (*spike* na tarefa 0). |

## 2. Verificação de fatos por cliente (2026-10-24)
| Cliente | Suporta MCP remoto + OAuth? | Exigências que o servidor cumpre | Limitações | Fonte |
| :-- | :-- | :-- | :-- | :-- |
| Claude (claude.ai, Desktop, mobile, Cowork) | **Sim** | Streamable HTTP; `401` + `WWW-Authenticate resource_metadata`; PRM; RFC 8414; PKCE S256; CIMD (com `none` anunciado) ou DCR; *redirect* `https://claude.ai/api/mcp/auth_callback`; `invalid_grant`; rotação de *refresh*; `/token` em `x-www-form-urlencoded`; resposta < 10 s | Free: 1 conector personalizado; Team/Enterprise: Owner adiciona; ferramenta ≤ 240 s, resultado ≤ ~150 mil caracteres; sem *sampling*/assinaturas; autorização até a spec 2025-11-25 | claude.com/docs/connectors/building/authentication · claude.com/docs/connectors/building · claude.com/docs/connectors/custom/remote-mcp |
| Claude Code | **Sim** | *Loopback* `localhost`/`127.0.0.1` com porta ignorada; CIMD próprio | Saída 25 mil *tokens* | idem (seção *Callback URLs*) |
| ChatGPT | **Sim** (custom MCP server / plugin) | SSE e Streamable HTTP; PRM; S256 obrigatório; `resource` com audiência; CIMD `https://chatgpt.com/oauth/client.json` ou DCR; *redirects* `https://chatgpt.com/connector_platform_oauth_redirect` (com `iss`) ou `…/connector/oauth/{callback_id}`; escopos por ferramenta (`securitySchemes`); escrita sem `readOnlyHint` pede confirmação | **Planos não confirmados** (página oficial de ajuda inacessível; fontes secundárias: escrita completa em beta para Business/Enterprise/Edu, Plus/Pro com restrições); só web documentado | developers.openai.com/apps-sdk/build/auth · developers.openai.com/api/docs/guides/custom-mcp-server · help.openai.com/en/articles/12584461 (via busca) |
| Gemini app | **Só nos EUA** | "Padrão MCP"; DCR ou credenciais manuais | 18+, EUA, inglês, conta pessoal, "Keep Activity" ligado; escrita com confirmação manual; plano não confirmado (fonte secundária: AI Pro/Ultra) | support.google.com/gemini/answer/17209137 |
| Gemini CLI | Sim, mas **descontinuado** para contas pessoais desde 2026-06-18 | `httpUrl` (Streamable HTTP); OAuth com descoberta pelo `401`, DCR, `iss`; *loopback* `localhost:<porta>/oauth/callback` | Só com chave paga da API Gemini/Enterprise | geminicli.com/docs/tools/mcp-server · developers.googleblog.com (transição para Antigravity CLI) |
| Antigravity CLI/IDE | Sim (`serverUrl`) | OAuth com DCR; *callback* `https://antigravity.google/oauth-callback` com client ID fixo | Detalhes de OAuth só em fontes comunitárias — **não confirmado** | antigravity.google/docs/mcp · wikidocs.net/312519 |

**Menor caminho para o Gemini:** nada a construir agora — o servidor já atende DCR e *loopback* (o que o Gemini CLI/Antigravity usam). Quando o Google liberar "Custom apps" fora dos EUA, testar; se o *callback* do Gemini app não for coberto pela regra de *redirect* (§4.9 do SDD-024), é só uma configuração. Não vale construir conector próprio para o Gemini.

## 3. Respostas às perguntas do PO (`pedidos-ao-tech-lead-ia.md` §3)
| # | Pergunta | Resposta |
| :-: | :-- | :-- |
| 1 | Transporte; dentro do Next ou separado; o que os clientes exigem | **Streamable HTTP**, rota `POST /api/mcp` no próprio Next, respostas JSON, sem sessão (`GET`/`DELETE` 405). stdio não serve a clientes hospedados. Exigências por cliente na §2. |
| 2 | Credencial: *token* opaco mostrado uma vez × OAuth 2.1 | **OAuth 2.1 com o app como AS** (D-GES-35; Claude.ai, ChatGPT e Gemini app não aceitam *token* colado por usuário). *Tokens* continuam **opacos com *hash* SHA-256**, curtos (60 min), *refresh* rotativo, teto 30/90 dias, revogação imediata. Vínculo `membro + família + usuário`; remover o membro e bloquear a família revogam na mesma transação (ADR-030 §2–§4). |
| 3 | Mesma camada de autorização da UI | `resolveMcpContext` monta o **mesmo** `RequestContext` do `withApi` a partir do *grant* + `findActiveMembership`; todas as ferramentas usam os serviços das telas; testes de isolamento em todas as ferramentas (SDD-024 §5, SDD-026 §4). |
| 4 | Ferramentas e paginação | Lista fechada de 7 leituras (`listar_cadastros`, `consultar_saldos`, `resumo_do_mes`, `gastos_por_categoria`, `cartoes_e_faturas`, `listar_lancamentos`, `previstas_do_mes`) + 2 de escrita (`propor_lancamento`, `consultar_proposta`). Centavos + texto em R$, período e moeda explícitos, cursor do Extrato com `limit ≤ 50` (SDD-026, SDD-027). |
| 5 | Proposta + confirmação, idempotência, expiração, "via assistente", injeção | Confirmação **no app** (link + lista + selo na Home), proposta expira em **30 min**, `idempotencyKey` + hash do conteúdo, `transactions.origin = ASSISTANT` + `assistantProposalId` único; injeção: nada destrutivo, proposta inerte, texto como dado, `note` nunca exposta (ADR-030 §6–§7, SDD-027). |
| 6 | Auditoria e limite de taxa | `mcp_audit_events` *append-only* sem conteúdo devolvido (só parâmetros permitidos), 12 meses; limites no Postgres por *grant*/cliente/IP com `429` + `Retry-After` (SDD-024 §6–§7). Tela de atividade na US-077 (SDD-027 §5). |
| 7 | Confirmar 8+5+5+3+5 e reagrupar | EN-006 sobe para **13** e se divide em **EN-006a** (AS OAuth, 8) e **EN-006b** (transporte, contexto, taxa, auditoria, 5); demais confirmadas. Total **31**. |

## 4. Estimativas e ordem técnica
| Ordem | Item | PO | **TL** | SDD | Depende de | Observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- |
| 0 | *Spike* do SDK (2 eras do protocolo) | — | (incl. em EN-006b) | SDD-024 §10 | — | 0,5 dia; decide `@modelcontextprotocol/server` 2.x × `sdk` 1.32 |
| 1 | EN-006a — AS OAuth | 8 (EN-006) | **8** | SDD-024 §2–§4 | — | Opus para AS e revisão de segurança |
| 2 | EN-006b — `/api/mcp`, contexto, taxa, auditoria, cliente de teste | — | **5** | SDD-024 §5–§8 | 006a | |
| 3 | US-074 | 5 | **5** | SDD-025 | EN-006 | Não pode ser cortada sozinha |
| 4 | US-075 | 5 | **5** | SDD-026 | EN-006, US-074 | **Primeira entrega de valor**; homologar com Claude/ChatGPT reais (SDD-025 §6) |
| 5 | US-077 | 3 | **3** | SDD-027 §5 | US-075 | Antes da 076 |
| 6 | US-076 | 5 | **5** | SDD-027 §1–§4 | US-075, US-077 | Só sai junto/depois da 077 |
| | **Total** | **26** | **31** | | | +3 se TL-35 = Vercel (ADR novo de produção) |

Corte possível: entregar 1–5 (**26 pts**, leitura + atividade) como "R4-D1" e a US-076 em seguida.

## 5. Rastreabilidade
| NEED | História | Fluxo | SDD | ADR | Situação |
| :-- | :-- | :-- | :-- | :-- | :-- |
| NEED-025 (RN-025.1, 025.2, 025.5, 025.6, 025.7) | EN-006 (a/b) | FLUXO-016 §3 | SDD-024 | ADR-030 | Aprovado p/ Dev (TL-34) |
| NEED-025 (RN-025.1, 025.2; Q-U04) | US-074 | FLUXO-016 §3–§4 | SDD-025 | ADR-030 §2–§4 | Aprovado p/ Dev; BDD a ajustar (TL-39) |
| NEED-025 (RN-025.2, 025.3, 025.7; Q-U05) | US-075 | — | SDD-026 | ADR-030 §5, §7 | Aprovado p/ Dev |
| NEED-025 (RN-025.3..6) · NEED-001 | US-076 | FLUXO-008 | SDD-027 §1–§4 | ADR-030 §6–§7 | Aprovado p/ Dev; confirmação no app (TL-37) |
| NEED-025 (RN-025.6) | US-077 | FLUXO-016 §3 | SDD-027 §5 | ADR-030 §8 | Aprovado p/ Dev |
| — (produção) | — | — | — | ADR-026 × ADR-030 §9 | Decisão do usuário (TL-35) |

## 6. Pendências — ⚠ = **EXIGE decisão do usuário**
| ID | Para | Tema | Recomendação do TL (hipótese adotada) | Bloqueia |
| :-- | :-- | :-- | :-- | :-- |
| TL-34 | Gestor | Aprovar ADR-030 e SDD-024..027 | Aprovar | Início do desenvolvimento |
| **TL-35** ⚠ | Usuário | **Hospedagem**: Railway (ADR-026) × Vercel (app inteiro) × Vercel só para o MCP | **Railway, MCP dentro do mesmo app** (0 pt, sem *cold start*, *deploy* com *healthcheck*). Vercel inteira é viável (+3 pts; Hobby gratuito para uso pessoal; banco por URL pública ou Neon; migrar no *build*; proteger *previews*). Vercel só para o MCP: não | Só a produção do MCP |
| **TL-36** ⚠ | Usuário | **Clientes que ficam de fora**: Gemini app (indisponível no Brasil); Gemini CLI (descontinuado para contas pessoais); ChatGPT depende do plano | Garantir **Claude** e **ChatGPT**; Gemini via Antigravity CLI como melhor esforço; reavaliar o Gemini app quando o Google liberar fora dos EUA (nada a construir) | Não |
| **TL-37** ⚠ | Usuário | **Onde confirmar o lançamento**: no app (1 toque no link) × no chat (a LLM chama uma ferramenta "confirmar", protegida só pela aprovação do cliente) | **No app.** No chat, uma LLM enganada ou um "Sempre permitir" do cliente gravaria sem o membro ver os dados do banco | US-076 (adotado: no app) |
| **TL-38** ⚠ | Usuário | Prazos: conexão 30/90 dias; acesso 60 min; proposta 30 min; auditoria 12 meses; família nasce com o recurso **permitido** (membros ainda precisam conectar) | Como está | Não |
| TL-39 | PO | Ajustar BDD: US-074 "credencial mostrada uma vez" ⇒ "conectar não exibe segredo; conexão aparece na lista" e escolha de nome/validade/escopo **no consentimento**; EN-006 "Poupança visível só para Mariana" ⇒ outra família e ex-membro (não há conta privada); US-074 bloqueio **revoga** (religar não restaura); US-076 "Lucas vê a proposta" = no app via link/Home, à vista "Só meu"; US-077 proposta + confirmação = 1 registro; texto das instruções por cliente (SDD-025 §4.2) | Como nos SDDs | Não |
| TL-40 | Gestor (externo) | Homologar com clientes reais exige **URL pública HTTPS** (produção ou túnel com conta — o túnel gratuito atual não serve, EXT-11) e contas nos clientes (Claude qualquer plano; ChatGPT com modo desenvolvedor) | Registrar em `pendencias-externas.md` | Homologação (SDD-025 §6) |
| TL-41 | Gestor | Revisão de segurança (`/security-review`) e checklist do SDD-024 §9 antes de `MCP_ENABLED=true` em produção | Obrigatório | Produção do MCP |

## 7. Riscos técnicos
| Risco | Mitigação |
| :-- | :-- |
| AS próprio com falha de segurança | Escopo mínimo de OAuth (só `authorization_code` + PKCE + *refresh*; sem segredo de cliente); vetores e testes de *replay*/PKCE/audiência/*redirect*/SSRF (SDD-024 §8); revisão com Opus + `/security-review` |
| SDK v2 não servir clientes da era `initialize` | *Spike* na tarefa 0; *fallback* para o SDK 1.32 *stateless* ou *framing* à mão (+1 pt) |
| Cliente mudar exigências (ritmo alto em 2026) | Seguir a spec (PRM, RFC 8414, CIMD+DCR, `iss`, `resource`); *smoke* `pnpm mcp:smoke` e Inspector; roteiro manual por cliente |
| Vazamento entre famílias | Contexto único + serviços das telas + varredura de ids da outra família em todas as ferramentas |
| Injeção levando a gravação indevida | Sem ferramenta de confirmar/editar/excluir; confirmação humana no app com dados do banco |
| Explosão de clientes DCR | Limite por IP e expurgo de clientes sem uso em 30 dias |

## 8. Escolha de modelo (regra 6 do AGENTS.md)
Este ciclo usou o modelo avançado (decisão de arquitetura e segurança). Implementação: **Opus** para EN-006a e a revisão de segurança (AS OAuth é domínio crítico); **Sonnet** para EN-006b, US-074..077; **Haiku** para ajustes de documentação.
