# ADR-043 — Token pessoal (PAT) para clientes MCP sem OAuth

**Status:** aceito (estende ADR-030; não altera o §2) · **Data:** 2026-11-08 · **Autor:** arquiteto (padrões seguros autorizados pelo usuário, sem escalar)

## Contexto
IDEs, CLIs e agentes locais (Claude Code, Cursor, MCP Inspector, scripts) mandam `Authorization: Bearer` fixo e não fazem OAuth. A US-074b (bloqueada, D-GES-37) pedia o desenho: formato, escopo, validade, revogação, limites, auditoria e convivência com o modo "exigir confirmação" (US-076c). O PAT não passa pela allowlist de clientes (não há cliente), por isso nasce mais fechado que o OAuth.

## Decisão
1. **Modelo (reuso).** Um PAT = um `McpGrant` com `kind = PAT` (enum já existe), `clientId = null`, `resource` canônico, `label` do membro (1..40, saneado); e um `McpToken` com novo `McpTokenKind.PAT`, `expiresAt` = o do grant. Sem tabela nova.
2. **Formato.** `fmp_` + 32 bytes aleatórios em base64url (256 bits; 47 caracteres; regex `^fmp_[A-Za-z0-9_-]{43}$` para varredura de segredo). Valor mal formado é recusado antes de ir ao banco. Banco guarda só `sha256` hex (`tokenHash`); com 256 bits, hash lento é dispensável. Sem dica/últimos dígitos.
3. **Exibido uma vez.** Só a resposta do `POST` de criação traz o valor (`Cache-Control: no-store`). A idempotência (ADR-009) guarda a resposta SEM o token: `withApi` ganha `redactStoredBody`; o replay devolve a conexão com `tokenRedacted: true` ("revogue e gere outro"). A UI mantém o valor só no estado do diálogo (nunca URL, storage ou cache) e o apaga ao fechar.
4. **Escopos iguais ao OAuth.** `read` padrão; `write` exige `allowWrite` + `writeAcknowledged: true` (mesma segunda ciência do consentimento). Escopo não muda depois: gera-se outro token. PAT só vale em `POST /api/mcp`; nunca em `/api/oauth/*`, `/api/v1` nem como sessão; não troca por refresh.
5. **Validade obrigatória.** 7, 30 ou 90 dias; padrão 30; máximo 90 (igual ao teto do grant OAuth). Sem renovação nem rotação automática: vence e o membro gera outro.
6. **Revogação imediata.** Cada chamada relê grant e token (sem cache). Revogar usa a rota das conexões (`/connections/:id/revoke`, apaga o token). Remoção/saída do membro, exclusão de conta e bloqueio da família já revogam todos os grants, PAT incluído.
7. **Três chaves, falha fechada.** `MCP_PAT_ENABLED` (env, padrão `false`; exige também `MCP_ENABLED`) e `families.assistantPatEnabled` (padrão `false`, só ADMIN; desligar revoga os PAT da família com `FAMILY_BLOCKED`), além de `assistantAccessEnabled`. Qualquer uma desligada: criar = 404/403 e usar = 401 `blocked`.
8. **Limites.** Até 5 PAT ativos por membro (contagem sob `FOR UPDATE` do membro; 409 `PAT_LIMIT_REACHED`); criação 10/dia por membro (429). Transporte igual ao OAuth (60/min e 1000/dia por grant). Novo: 30 falhas de autenticação/min por IP em `/api/mcp` (429), para qualquer bearer. Escrita usa os mesmos limites do membro (US-076b), contados junto com as conexões OAuth.
9. **Confirmação (US-076c).** PAT com `write` nasce com `requireConfirmation = true`: `lancar_despesa` responde `CONFIRMATION_REQUIRED` e o cliente usa `propor_lancamento`; o membro confirma no app. Desligar é a mesma rota `PATCH .../confirmation`, auditada, com aviso de risco na tela.
10. **Auditoria sem o token.** `CONNECTED` com `params {type: "PAT", validityDays, scopes, writeAcknowledged}`; `clientName` fixo "Token pessoal" (o `label` não vai à auditoria); chamadas e revogação como no OAuth. Token fora de log (`*.token` no redact), auditoria, idempotência e respostas GET: teste de varredura.
11. **Uso suspeito.** Sem IP nem geolocalização guardados (LGPD). Sinais: e-mail e aviso na Home ao criar (reusa `new-connection`), último uso na lista, revisão semanal, e e-mail ao membro (máx. 1/dia por token) quando o PAT bate limite de transporte ou de escrita (`RATE_LIMITED`/`LIMIT_EXCEEDED`).
12. **OAuth continua obrigatório** para Claude.ai, ChatGPT e qualquer cliente hospedado (ADR-030 §2): eles não aceitam bearer colado e o PAT não é anunciado no metadata OAuth. O PAT só soma clientes locais.

## Consequências
- Risco aceito: o token fica em texto claro no arquivo de configuração da máquina do membro por até 90 dias; mitigado por escopo `read` padrão, confirmação na escrita, limites, chaves desligadas por padrão e revogação imediata.
- Descartados: token sem validade, por família, rotação automática, revogação pública via RFC 7009, programa de secret scanning de terceiros, ponte stdio.
- Expurgo: tokens PAT vencidos saem pelo `purgeMcp` existente (7 dias); o grant fica como histórico.
