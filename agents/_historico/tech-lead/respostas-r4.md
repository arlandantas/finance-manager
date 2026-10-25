# Respostas do Tech Lead — R4 (parcelas já pagas, infra de LLM, privacidade e análise de gastos)

*Atualizado: 2026-10-24 · De: Agente Tech Lead · Para: Gestor e Product Owner · Cópia: Stakeholder, Dev & QA*
*Responde a [`pedidos-ao-tech-lead-ia.md`](../product-owner/backlog/pedidos-ao-tech-lead-ia.md) e [`decisoes-po-ia-e-parcelas.md`](../product-owner/backlog/decisoes-po-ia-e-parcelas.md), já filtrados pelas decisões do Gestor **D-GES-27..30** (chave única; opt-in por família; só agregados; teto configurável com valor pendente; importação na R5; MCP depois).*

## 1. Resumo (uma tela)
| Item | Resposta |
| :-- | :-- |
| **Entregue** | [ADR-027](../../tech-lead/adrs/ADR-027-parcelas-anteriores-ao-app.md) + [SDD-020](../../tech-lead/sdd/SDD-020-parcelas-ja-pagas-na-entrada.md) (US-065) · [ADR-028](../../tech-lead/adrs/ADR-028-integracao-llm-cliente-unico-e-teto-de-custo.md) + [SDD-021](../../tech-lead/sdd/SDD-021-infra-llm-en-004.md) (EN-004) · [ADR-029](../../tech-lead/adrs/ADR-029-privacidade-e-anonimizacao-para-llm.md) + [SDD-022](../../tech-lead/sdd/SDD-022-opt-in-privacidade-en-005.md) (EN-005) · [SDD-023](../../tech-lead/sdd/SDD-023-analise-de-gastos-evitaveis.md) (US-070..073) · [parecer R5](../../tech-lead/parecer-r5-importacao-local.md) (importação). Todos **Aprovados para Desenvolvimento**, exceto o parecer (só parecer). |
| **Pontos (R4 revista)** | **34** = US-065 5 · EN-004 8 · EN-005 5 · US-070 8 (070a 5 + 070b 3) · US-071 3 · US-072 3 · US-073 2. **Igual ao PO** nessas histórias. Importação (21) e MCP (26) fora desta rodada. |
| **Maior risco** | Vazamento de dado pessoal para a LLM ⇒ *allowlist* construída + schema `.strict()` + teste de propriedade com nomes/CPF/instruções maliciosas + "enviado = exibido" byte a byte (ADR-029 §5). |
| **Achado 1 (conflito com D-GES-29)** | A US-070 pressupunha enviar o **nome do recorrente** ("Streaming X") e a US-072 a **descrição** ("Droga Raia"). Resolvido: recorrente vai como **referência opaca** `R1` (o nome só aparece na tela, resolvido localmente) e a US-072 vira **regra local sem IA** (consistência do histórico). |
| **Achado 2** | O único texto livre que sai é o **rótulo da categoria**, saneado (sem dígitos, e-mails e nomes de membros). Sem ele a IA não distingue "Mercado" de "Lazer". **Exige confirmação do usuário (TL-23).** |
| **Achado 3** | A saída da IA **não tem campos numéricos**: todos os valores são do app; texto da IA com número ou nome é substituído. O cenário "número inconsistente" passa por construção. |
| **Custo** | Modelo padrão **Claude Haiku 5.5** (menor capaz; `effort: low`): ≈ **R$ 0,01 por análise**. Um teto de **R$ 5,00/mês por família** já cobre centenas de análises (sugestão; o valor é do usuário, TL-27). |
| **R5 (importação)** | Viável **sem IA** para CSV/OFX e PDF com texto de emissores conhecidos; PDF escaneado/foto não é anonimizável. Recomendação: R5 sem LLM (TL-29). |

## 2. Respostas às perguntas do PO (`pedidos-ao-tech-lead-ia.md`)
| § | Pergunta | Resposta |
| :-- | :-- | :-- |
| 0.1 / US-065 | Modelo "anterior ao app" e resto de centavos | **Contador** `paidBeforeAppCount` no plano, sem linhas fantasma; valores do plano completo (sobra na 1ª, já paga ⇒ restantes iguais a `⌊total/N⌋`); âncora = fatura da próxima parcela (padrão: aberta); `INVOICE_ALREADY_PAID` e `cardUsage` existentes cobrem limite e coerência (ADR-027, SDD-020 §1). Data da compra **deixa de ser exigida** com P ≥ 1. |
| 1.1 | Provedor, SDK, modelo por finalidade, PDF nativo × texto, CSV sem LLM | SDK oficial `@anthropic-ai/sdk` atrás de `LlmPort`; modelo por env por finalidade (análise: `claude-haiku-5-5`, escalável a `claude-sonnet-5-5` por teste de ouro). PDF/CSV: ver parecer — **CSV e PDF com texto sem LLM**. |
| 1.2 | Saída estruturada, injeção de prompt, sem ferramentas | `output_config.format` (JSON Schema do Zod) + validação Zod no servidor + validação de domínio (refs, duplicatas, textos); chamadas **sem `tools`**; prompt manda tratar o JSON como dado; entrada só de agregados (superfície de injeção = rótulo saneado). |
| 1.3 | Falhas, timeout, retentativa, cancelamento, 429 | 30 s por tentativa, 1 retentativa, prazo total 60 s, `AbortSignal` da rota; tradução fixa para mensagens neutras (ADR-028 §4). |
| 1.4 | Valores sempre do app | Sim, por construção (saída sem números). |
| 1.5 | Chave, rotação, chave por família | Só env do servidor; rotação = trocar variável e reiniciar; `CredentialResolver` deixa a chave por família possível sem reescrever histórias (+3 a 5 pts, não construir). |
| 2.1–2.3 | Arquivo, sessão de revisão, minimização de PDF | **Adiado (R5)**; ver parecer §3–§5. |
| 2.4 | Termos do provedor / texto do opt-in | O texto **não** promete retenção zero nem "sem treino" até o Gestor confirmar os termos da conta (TL-26). Texto seguro proposto em ADR-029 §7. |
| 2.5 | Payload mínimo da análise; "recorrente" sem texto livre; normalização para o descarte | Contrato exato `AnalysisPayloadSchema` (SDD-023 §2.1); recorrência detectada **localmente** (`descriptionKey` normalizada, ≥ 3 meses, variação ≤ 1,5×) + séries `RecurringExpense`; descarte por `(categoria, descriptionKey)` ou `recurringExpenseId`. |
| 2.6 | LGPD | Consentimento registrado e revogável, apagar análises (`DELETE` físico), registro sem conteúdo, menção de transferência internacional no texto (ADR-029 §8). |
| 3 | ADR do MCP | Feito no ciclo R4-D: [ADR-030](../../tech-lead/adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md) e SDD-024..027; ver [`respostas-r4d.md`](respostas-r4d.md). |
| 4 | Controle de custo | Micro-reais `BigInt`; **reserva antes / acerto depois** sob `FOR UPDATE` (dois pedidos simultâneos não estouram o teto); mês civil em São Paulo; teto por env + sobrescrita por família via *script*; sem teto configurado em produção ⇒ IA indisponível (SDD-021 §4.3). |
| 5 | Testes sem API real | `FakeLlmAdapter` por cenário, fixtures, teste de contrato do *adapter* com HTTP simulado, trava que falha a suíte se o provedor real for configurado, teste de ouro manual `pnpm ai:golden` (ADR-028 §7, SDD-021 §8, SDD-023 §8). |

## 3. Estimativas e ordem técnica (R4 revista por D-GES-29)
| Ordem | História | PO | **TL** | SDD/ADR | Depende tecnicamente de | Observação |
| :-: | :-- | :-: | :-: | :-- | :-- | :-- |
| 1 | US-065 | 5 | **5** | SDD-020, ADR-027 | US-040a/b (**já implementadas**) | Sem IA; pode começar já. Cenário `@depende-us-042` fica marcado |
| 2 | EN-004 | 8 | **8** | SDD-021, ADR-028 | — | Desenvolvimento não depende do valor do teto; **produção** depende (TL-27) e da conta Anthropic |
| 3 | EN-005 | 5 | **5** | SDD-022, ADR-029 | EN-004 (tela compartilhada) | Na R4 só a finalidade "Análise de gastos" |
| 4 | US-070a | 8 (a US) | **5** | SDD-023 | EN-004, EN-005, `ledger-where.ts` | **Não** depende da US-048/049 |
| 5 | US-070b | — | **3** | SDD-023 | 070a, US-058 (já implementada) | Recorrentes e evitáveis |
| 6 | US-071 | 3 | **3** | SDD-023 | 070b | |
| 7 | US-073 | 2 | **2** | SDD-023 | 070a | Antes da 072 (transparência/privacidade) |
| 8 | US-072 | 3 | **3** | SDD-023 §4.6 | US-014, edição não financeira | **Regra local**; independente da IA — pode ser antecipada se TL-24 for aceita |
| | **Total** | **34** | **34** | | | Must = US-065, EN-004, EN-005 (18); a análise (16) é Should/Could |

**Fora desta rodada**: US-066..069 (R5; parecer), EN-006 e US-074..077 (MCP; ADR pendente).

## 4. Rastreabilidade (NEED ➔ US/EN ➔ SDD/ADR)
| NEED | História | Fluxo | SDD | ADR | Situação |
| :-- | :-- | :-- | :-- | :-- | :-- |
| NEED-024 | US-065 | FLUXO-014 | SDD-020 | ADR-027 (estende ADR-017/020) | Aprovado p/ Dev |
| NEED-026, NEED-027 | EN-004 | FLUXO-016 | SDD-021 | ADR-028 | Aprovado p/ Dev |
| NEED-023, NEED-026, NEED-027 | EN-005 | FLUXO-016 | SDD-022 | ADR-029 | Aprovado p/ Dev |
| NEED-027 (NEED-023) | US-070 (070a/070b) | FLUXO-017 | SDD-023 | ADR-028, ADR-029 | Aprovado p/ Dev |
| NEED-027 | US-071 | FLUXO-017 | SDD-023 | ADR-029 | Aprovado p/ Dev |
| NEED-027 | US-072 | FLUXO-017 | SDD-023 §4.6 | ADR-029 §4 | Aprovado p/ Dev **se TL-24 aceita** |
| NEED-027 | US-073 | FLUXO-017 | SDD-023 | ADR-029 §6 | Aprovado p/ Dev |
| NEED-026 | US-066..069 | FLUXO-015 | — | — | **R5**; [parecer](../../tech-lead/parecer-r5-importacao-local.md) |
| NEED-025 | EN-006, US-074..077 | FLUXO-016 §3 | SDD-024..027 | ADR-030 | Especificado no ciclo R4-D ([`respostas-r4d.md`](respostas-r4d.md)) |

## 5. Pendências — ⚠ = **EXIGE decisão do usuário**
| ID | Para | Tema | Hipótese adotada (nada bloqueia o desenvolvimento) | Bloqueia |
| :-- | :-- | :-- | :-- | :-- |
| **TL-23** ⚠ | Usuário | Enviar o **rótulo saneado da categoria** (ex.: "Mercado", "Escola do pessoa") — único texto livre do payload | Sim, saneado e exibido em "O que será enviado". Alternativa: taxonomia fixa sem rótulos (+3 a 5 pts, perde nuance) | Produção da US-070 |
| **TL-24** ⚠ | Usuário / PO | US-072 por **regra local** (consistência do histórico), sem IA | Sim (é a única forma compatível com D-GES-29) | US-072 |
| **TL-25** ⚠ | Usuário | Retenção das análises: até apagar, com expurgo automático em **24 meses** | 24 meses | Não |
| **TL-26** ⚠ | Gestor / usuário | Termos de retenção/treino da API Anthropic para a conta do app; contratar *Zero Data Retention*? Texto do opt-in não promete isso enquanto não confirmado | Não prometer | Texto final do opt-in |
| **TL-27** ⚠ | Usuário | **Valor do teto mensal por família** (Q-U10) | Dev/test R$ 10,00; sugestão para produção **R$ 5,00** (≈ 400 análises com Haiku 5.5); sem valor ⇒ IA indisponível em produção | Produção da EN-004 |
| TL-28 | Gestor | Modelo padrão `claude-haiku-5-5`, escalável a `claude-sonnet-5-5` por teste de ouro (SDD-023 §8.4) | Haiku 5.5 | Não |
| **TL-29** ⚠ | Usuário | R5: importação **sem IA** (recomendado) × *fallback* LLM enviando descrições; quais emissores; PDF escaneado/senha fora | Sem IA; escaneado/senha fora | Planejamento da R5 |
| TL-30 | PO | US-065: com P ≥ 1 o campo de data vira o seletor "Próxima parcela na fatura de"; cenário novo "fatura fechada ainda não paga"; textos "Resta 1 parcela…" e "A diferença de centavos ficou na 1ª parcela, já paga" | Como no SDD-020 §6 | Não |
| TL-31 | PO | EN-005: cenários usam "Análise de gastos" (importação é R5); texto v1 cita que o provedor fica fora do Brasil; remover a frase do arquivo da fatura | Como no SDD-022 §9 | Não |
| TL-32 | PO | US-070: fatiar em 070a (5) / 070b (3); reescrever "Resposta da IA com número inconsistente" como "texto da IA com número é substituído" (a saída não tem campo de valor); "O que será enviado" fala em "valores recorrentes **sem o nome**" | Como no SDD-023 | Não |
| TL-33 | Gestor | ADR de segurança/autenticação do MCP (EN-006) | **Resolvido** em 2026-10-24: ADR-030 + SDD-024..027 (respostas-r4d.md) | — |
| EXT (novo) | Gestor | `pendencias-externas.md`: conta Anthropic do app, chave de produção, **limite de gasto configurado na console da Anthropic** (defesa em profundidade), variável `LLM_MONTHLY_CAP_CENTS` no Railway | — | Produção da IA |

## 6. Riscos técnicos
| Risco | Mitigação |
| :-- | :-- |
| Dado pessoal no payload por campo novo esquecido | *Allowlist* construída (nunca filtrar objeto de domínio), `.strict()`, *snapshot* das chaves, propriedade com dados maliciosos (ADR-029 §5) |
| Teto ultrapassado por concorrência | Reserva do máximo sob `FOR UPDATE`; teste com 10 pedidos simultâneos (SDD-021 §8) |
| Chave ou conteúdo em log/bundle | `server-only`, `check:imports`, `redact` do pino, teste de *bundle* e de logger |
| Testes chamando a API real | Padrão `fake`; boot recusa `anthropic` em test/homolog; `fetch` para `api.anthropic.com` bloqueado na suíte |
| Mudança de formato do provedor | Validação Zod + teste de ouro manual |
| US-065: parcela na fatura errada | Reuso de `buildInstallments` (propriedades do ADR-020) + equivalência para P = 0 + vetores P1..P8 |

## 7. Escolha de modelo (regra 6 do AGENTS.md)
Este ciclo usou o modelo avançado por envolver ADRs de privacidade/custo e domínio crítico (centavos/parcelas). Para a implementação: **Sonnet** basta para todos os SDDs (contratos fechados); **Haiku** para ajustes de documentação/status.
