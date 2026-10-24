# SDD-025: Conectar, ver e revogar o assistente; bloqueio pela família (US-074)

- **História**: [US-074](../../product-owner/backlog/stories/US-074-conceder-e-revogar-acesso-do-assistente.md) · **Fluxo**: [FLUXO-016](../../product-owner/flows/FLUXO-016-privacidade-e-consentimento-ia.md) §3, §4
- **Rastreabilidade**: NEED-025 (RN-025.1, 025.2; Q-U04) · RF43 · D-PO-66 · D-GES-35 · [ADR-030](../adrs/ADR-030-servidor-mcp-oauth-proprio-e-hospedagem.md) §2–§4 · ADR-019
- **Depende de**: SDD-024 (modelos, `/oauth/authorize`, decisão, revogação), SDD-012 (remoção de membro), SDD-022 (padrão de tela de IA e privacidade)
- **Status**: **Aprovado para Desenvolvimento** (R4-D) · **Executor**: Dev & QA (Sonnet)
- **Estimativa**: **5** (confirma o PO) — §7.

---

## 1. O que muda em relação à história do PO (pedido TL-39)
| PO | Com OAuth (ADR-030) |
| :-- | :-- |
| "Conectar um assistente" gera uma credencial **mostrada uma vez** | O botão abre **instruções**: copiar a URL `https://<host>/api/mcp` e colá-la no Claude/ChatGPT; o cliente abre o **consentimento no app**. Nenhum segredo é exibido, nada a "mostrar uma vez". |
| Escolher nome, validade e escopo no app antes de conectar | Escolhidos **na tela de consentimento** (mesmos campos: nome, 30/90 dias, "Consultar" fixo + "Lançar com confirmação" opcional). |
| "Meu Claude · Leitura · expira em 23/11/2026" | Igual, na lista de conexões. |
| Cenário "Credencial é mostrada uma única vez" | Reescrever: "Conectar não exibe nenhuma senha ou chave" + "Depois de permitir, a conexão aparece na lista". |
| Bloqueio: "credenciais existentes deixam de funcionar" | Bloquear **revoga** todas as conexões da família; religar não as restaura (cada membro reconecta). |

## 2. Contratos
```typescript
// src/modules/mcp/connections-schemas.ts
export type ConnectionStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type ConnectionDTO = {
  id: string;
  label: string;                            // "Meu Claude"
  clientName: string;                       // do CIMD/DCR (informado pelo cliente)
  redirectHost: string;                     // "claude.ai", "chatgpt.com", "localhost"
  scopes: Array<"read" | "write">;
  scopeLabel: "Leitura" | "Leitura e lançamento";
  status: ConnectionStatus;
  createdAt: string; expiresAt: string; lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: "MEMBER" | "FAMILY_BLOCKED" | "MEMBER_REMOVED" | "REFRESH_REUSE" | "CODE_REUSE" | "CLIENT" | null;
};
export type AssistantSettingsDTO = {
  mcpUrl: string;                           // canonicalResource()
  enabled: boolean;                         // MCP_ENABLED do servidor
  familyAllows: boolean;                    // families.assistantAccessEnabled
  canEditFamilySwitch: boolean;             // role === ADMIN
  familyVersion: number;
  blockedNotice: string | null;             // "O Administrador bloqueou o acesso por assistente"
  items: ConnectionDTO[];                   // só do membro da sessão; ativas primeiro, depois as 20 últimas encerradas
};
export const SetAssistantAccessSchema = z.object({ enabled: z.boolean(), familyVersion: versionSchema }).strict();
export const RevokeConnectionSchema = z.object({}).strict();
```
## 3. API (`withApi`, `auth: "family"`)
| Rota | Quem | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/assistant/settings` | todos | `200 AssistantSettingsDTO` | — |
| `POST /api/v1/assistant/connections/:id/revoke` | dono da conexão | `200 { connection: ConnectionDTO }` (idempotente: já revogada ⇒ `200` igual) | `404 NOT_FOUND` (de outro membro **ou** outra família — mesma resposta) |
| `PATCH /api/v1/family/assistant-access` | ADMIN | `200 AssistantSettingsDTO` | `403 FORBIDDEN` "Só o Administrador pode alterar" · `409 VERSION_CONFLICT` |

Regras:
- Revogar: `mcp_grants` `FOR UPDATE` filtrando `familyId` **e** `memberId` da sessão ⇒ `status = REVOKED`, `revokedReason = MEMBER`, `revokedByMemberId` ⇒ apaga os *tokens* do *grant* (`DELETE mcp_tokens WHERE grantId`) ⇒ auditoria `REVOKED`. Efeito imediato porque o `/api/mcp` consulta o *grant* a cada chamada.
- Bloquear (`enabled: false`): `families FOR UPDATE` + versão ⇒ `assistantAccessEnabled = false` ⇒ revoga **todos** os *grants* ativos da família (`FAMILY_BLOCKED`, `revokedByMemberId` = ADMIN) ⇒ apaga *tokens* ⇒ auditoria `BLOCKED` para cada membro afetado ⇒ `FamilyEvent(ASSISTANT_ACCESS_CHANGED)`. Religar só muda a *flag*.
- Remoção/saída do membro: `familia/removal.ts` chama `revokeMemberGrants(tx, familyId, memberId, "MEMBER_REMOVED")` **na mesma transação** da remoção.
- `blockedNotice` aparece quando `familyAllows = false` (para todos) e, para o membro, quando sua última conexão foi revogada por `FAMILY_BLOCKED`.

## 4. Interface
### 4.1 Consentimento `/oauth/authorize?request=<id>` (layout mínimo, sem navegação do app)
- Cabeçalho: "**{clientName}** quer acessar seus dados financeiros" + selo "Nome informado pelo aplicativo" + linha "Vai voltar para **{redirectHost}**". Se `redirectHost` for *loopback*: aviso âmbar "Este aplicativo roda no seu computador. Continue só se foi você que iniciou a conexão agora." Se o *host* não estiver na lista conhecida (`claude.ai`, `chatgpt.com`, `gemini.google.com`, `antigravity.google`, *loopback*): aviso "Aplicativo não reconhecido".
- Aviso de privacidade (texto do PO, versão 1): "Os dados que o assistente consultar serão enviados ao provedor da IA que você usa, fora do controle do app." + caixa **"Entendi"** obrigatória (botão "Permitir" desabilitado até marcar).
- Campos: **Nome** (padrão `clientName` truncado em 40; ex.: "Meu Claude"), **Validade** (`30 dias` padrão / `90 dias`), **Permissões**: "Consultar saldos, gastos e extrato" (marcado, fixo) e "Propor lançamentos (você confirma cada um no app)" — desmarcado; só aparece se o cliente pediu `write`.
- Botões "Permitir" (primário) e "Cancelar". Estados: `submitting` (botões desabilitados, *spinner*), erro `409 ASSISTANT_BLOCKED` ⇒ painel "O Administrador bloqueou o acesso por assistente" + "Voltar"; pedido expirado/consumido ⇒ "Este pedido de conexão expirou. Volte ao seu assistente e tente de novo."; usuário sem família ⇒ "Você ainda não faz parte de uma família".
- Acessível: foco inicial no título; "Entendi" é `checkbox` com `label`; alvos ≥ 44 px.

### 4.2 Configurações ▸ **Assistente de IA** (`/configuracoes/assistente`)
- Topo: interruptor da família **"Permitir acesso por assistente"** — ADMIN: `role="switch"`; desligar abre confirmação "Desligar desconecta os assistentes de todos os membros. Continuar?"; membro: texto "Permitido pela família" / "Bloqueado pelo Administrador" (sem controle).
- Vazio: "**Nenhum assistente conectado**" + botão "Conectar um assistente".
- "Conectar um assistente" ⇒ `Dialog` com a URL (`mcpUrl`) + "Copiar" e três abas curtas:
  - **Claude** (web/Desktop): "Configurações ▸ Conectores ▸ Adicionar conector personalizado ▸ cole a URL ▸ Conectar". Nota: "No plano gratuito do Claude cabe 1 conector personalizado."
  - **ChatGPT** (web): "Configurações ▸ Apps/Plugins ▸ modo desenvolvedor ▸ Adicionar servidor MCP ▸ cole a URL ▸ OAuth". Nota: "Disponível só em alguns planos do ChatGPT."
  - **Gemini**: "O Gemini só permite apps personalizados para contas nos EUA, em inglês. No Brasil, por enquanto, não funciona." (texto revisável; TL-36)
- Lista: cartão por conexão — "**Meu Claude** · Leitura · expira em 23/11/2026", "Conectado a claude.ai", "Último uso: hoje 14:32" / "Nunca usado"; ações "Atividade" (US-077) e "Revogar" (confirmação "Revogar Meu Claude? O assistente deixa de acessar seus dados na hora."). Encerradas: selo "Revogado em …" / "Expirado em …" / "Revogado pelo bloqueio da família" / "Revogado por segurança" (`REFRESH_REUSE`/`CODE_REUSE`).
- `enabled = false` (servidor): "O acesso por assistente ainda não está disponível." e nada mais.
- Cache `["assistant-settings"]`; invalidado por revogar, bloquear e `FamilyEvent`. Sem atualização otimista (segurança: só muda com `200`).

## 5. Testes obrigatórios
| Cenário BDD | Testes |
| :-- | :-- |
| Nasce desligado | **I**: membro novo ⇒ `items = []`. **E**: "Nenhum assistente conectado". |
| Conceder exige ciência do risco | **C/E**: "Permitir" desabilitado sem "Entendi"; **I**: `decision: allow` sem `privacyAcknowledged` ⇒ `400`. |
| (reescrito) Conectar não exibe segredo; conexão aparece | **E**: fluxo do cliente de teste (SDD-024 §8) ⇒ lista mostra "Meu Claude · Leitura · expira em 23/11/2026" (relógio fixo em 24/10/2026, 30 dias); página não contém `fma_`/`fmr_`. |
| Revogar na hora | **I**: revogar ⇒ `/api/mcp` seguinte `401`; selo "Revogado". **E**. |
| Cada membro vê só as suas | **I**: Mariana `GET` ⇒ não vê o *grant* de Lucas; Mariana `revoke` no id de Lucas ⇒ `404`. |
| Administrador bloqueia | **I**: `PATCH enabled:false` ⇒ todos `REVOKED/FAMILY_BLOCKED`, `/api/mcp` `401`, novo consentimento `409 ASSISTANT_BLOCKED`. **E**: Lucas vê "O Administrador bloqueou o acesso por assistente". |
| Membro comum não altera a chave | **I**: MEMBER `PATCH` ⇒ `403`. **E**: sem `switch`. |
| Membro removido perde as credenciais | **I**: remover Lucas ⇒ *grants* `MEMBER_REMOVED` na mesma transação (falha simulada após a revogação ⇒ *rollback* de ambos). |
| (infra) Outra família | **I**: ADMIN da Souza não revoga/lista nada da Silva (`404`). |
| (infra) Reconectar o mesmo cliente | **I**: 2º consentimento Lucas+Claude ⇒ o 1º vira `REVOKED/CLIENT`. |
| (infra) Consentimento | **E**: avisos de *loopback* e de *host* desconhecido; "Cancelar" ⇒ `access_denied`; pedido expirado ⇒ mensagem. |

## 6. Roteiro de homologação com clientes reais (Gestor + usuário; após o deploy com `MCP_ENABLED`)
1. **Claude (web)**: adicionar conector com a URL ⇒ login Google do app (se preciso) ⇒ consentimento só Leitura ⇒ perguntar "qual o saldo das minhas contas?" ⇒ conferir com a tela Contas ⇒ revogar no app ⇒ nova pergunta falha e o Claude pede reconexão.
2. **Claude Code**: `claude mcp add --transport http financas https://<host>/api/mcp` ⇒ `/mcp` ⇒ autenticar (redirect *loopback*) ⇒ mesma pergunta.
3. **ChatGPT (web, modo desenvolvedor)**: adicionar servidor MCP com OAuth ⇒ consentimento com Leitura e lançamento ⇒ "lance R$ 80 de farmácia no Nubank" ⇒ o ChatGPT pede confirmação da ferramenta ⇒ proposta aparece no app ⇒ confirmar no app ⇒ Extrato com selo "via assistente".
4. Registrar plano usado em cada cliente e qualquer divergência (insumo para TL-36).

## 7. Estimativa e *commits*
**5**: API de conexões + revogação + bloqueio + gancho de remoção (2); tela de consentimento (do SDD-024, aqui só o polimento visual e estados) e tela de Configurações com instruções (2); testes E2E (1).
*Commits*: (1) serviço + rotas + gancho na remoção; (2) telas; (3) E2E.
