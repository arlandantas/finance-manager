# ADR-032: Correções de segurança do Grupo B (SEC-004, 009, 010, 011, 013, 017, 018)

## Status
Proposto (Tech Lead), 2026-10-24. Aceito para especificação. Os itens marcados **[U]** dependem de decisão do usuário (§9); até lá vale a recomendação do TL descrita aqui.
Rastreabilidade: **D-GES-40** (Grupo B, desenho antes, TL) · relatório [`_historico/security/relatorios/levantamento-2026-10-24.md`](../../_historico/security/relatorios/levantamento-2026-10-24.md) · especificação: **[SDD-028](../sdd/SDD-028-correcoes-de-seguranca-grupo-b.md)**.
**Fora deste ADR:** SEC-021 (regra de negócio, pergunta ao usuário), SEC-001/015/016/008 (risco aceito, D-GES-40) e o Grupo A (correção direta pelo Dev).

## Contexto
O levantamento de segurança de 2026-10-24 mostrou que o isolamento entre famílias é sólido, mas que sete achados pedem desenho antes do código: entrada em família sem consentimento (SEC-004), confiança implícita em texto de outros membros lido pelo assistente (SEC-009), cliente OAuth identificado só pelo *host* (SEC-010), pedido de autorização que qualquer navegador pode completar (SEC-011), custo de LLM sem teto agregado (SEC-013), lacunas de retenção e de direitos do titular (SEC-017) e sessão guardada em texto e válida, na prática, para sempre (SEC-018).
Restrições: produção na Vercel com Prisma Postgres (ADR-031), migrações pelo `vercel-build` (há uma janela em que o código antigo roda sobre o banco novo), *cron* 1×/dia, ADR-019 (ex-membro nunca é apagado), gatilhos `forbid_mutation` em `transactions`, `transaction_revisions` e `family_events`.

## Decisão

### 1. SEC-004: convite só vale com aceite explícito
- O gate do app **deixa de vincular** o usuário. `acceptPendingInvitation` sai de `resolveAppEntry`, de `resolveOnboardingEntry` e do `GET /convite/[token]`.
- Quem entra sem família e tem convite válido para o **e-mail verificado** vai para a tela **"Convites"** (`/convites`): "Você foi convidado para a **Família X** por **Y** (papel Z, vence em DD/MM)" com **Entrar** e **Recusar**, um cartão por convite (sem "o mais recente vence") e a saída "Criar minha própria família".
- O aceite é **mutação** (`POST` com `Idempotency-Key` e CSRF/Origin), nunca efeito de `GET`. Exige: e-mail verificado igual ao do convite, convite `PENDING` não vencido e **usuário sem família ativa** (sem sobrescrita: quem já tem família recebe `409 ALREADY_IN_FAMILY` e o convite continua pendente).
- Novo status `DECLINED`. Recusar não cria vínculo. O Administrador vê "Recusado" e pode convidar de novo.
- A expiração de 7 dias e as regras de reenvio continuam iguais. Evento `MEMBER_JOINED` na trilha da família.

### 2. SEC-009: texto de membro é dado marcado, não instrução
- Todo texto livre digitado por pessoas (descrição, título, nomes de conta/cartão/categoria/tag/família) passa por `sanitizeUserText` (NFKC, sem controles nem caracteres invisíveis ou de direção, espaços colapsados, tamanho máximo) e sai das ferramentas MCP **num envelope** `{ untrusted_text, flagged }`.
- O TL **não reescreve** o conteúdo por heurística: apagar "frases imperativas" estraga dados legítimos ("Pagar escola") e não para um atacante. A heurística só **marca** (`flagged: true`) e a ferramenta acrescenta um aviso no texto.
- O bloco `content` (texto lido pela LLM) começa com o aviso de dados. As `instructions` do servidor MCP e a descrição de `lancar_despesa` dizem que só se lança por pedido do próprio usuário na conversa.
- Os limites de escrita do membro continuam ligados por padrão (SDD-027 R2).

### 3. SEC-010: CIMD por URL exata
- A allowlist passa de *host* para **URL exata** do `client_id` (`MCP_CIMD_ALLOWED_CLIENT_IDS`). `MCP_CIMD_ALLOWED_HOSTS` fica **obsoleta**: se só ela estiver definida, o *boot* falha em produção e avisa em dev.
- Validação completa da URL (forma canônica, sem *query*, `..` ou caracteres codificados de caminho), busca com teto de **bytes lidos em *stream*** (não só `content-length`), tempo total de 5 s, sem redirecionamento e checagem de IP resolvido contra faixas privadas.
- No documento, cada `redirect_uri` deve ser `https`, sem fragmento nem credenciais e **no mesmo *host* do `client_id`**. Loopback não vale para cliente CIMD.
- O cliente gravado é revalidado contra as regras novas a cada uso (vale também para o *cache* de 24 h).

### 4. SEC-011: consentimento amarrado ao navegador e cliente verificado
- `/oauth/authorize` grava um *cookie* `__Host-mcp_authz` (HttpOnly, Secure, SameSite=Lax, 10 min) com um *nonce*. O pedido guarda `sha256(nonce)`. A tela de consentimento e o `POST` de decisão **exigem o mesmo navegador**. Assim, uma URL `/oauth/consent?request=…` repassada a outra pessoa não funciona.
- A tela mostra o **nome verificado** (tabela do servidor por `client_id` exato, não o `client_name` do documento), o **domínio verificado** e a **URL completa de retorno**, além de um aviso fixo: "Só continue se você acabou de pedir esta conexão no seu assistente, neste aparelho." Cliente não verificado (DCR, ampliação) recebe um aviso forte e não fica pré-selecionado.
- Conexão nova gera **aviso no app** e **e-mail** ao membro **[U4]**.

### 5. SEC-013: teto global de LLM com falha fechada e alarme
- Nova linha por mês em `llm_global_budget_months`, reservada e liquidada **na mesma transação** da linha da família, com bloqueio sempre na ordem família ➜ global (sem *deadlock*).
- `LLM_GLOBAL_MONTHLY_CAP_CENTS` é obrigatória em produção com IA ligada (o *boot* falha sem ela) **[U3]**. Teto global atingido ⇒ recusa para todos (`AI_UNAVAILABLE`, sem revelar o motivo agregado).
- Alarme em 50 %, 80 % e 100 %: no máximo um por limiar por mês, com log estruturado e e-mail para `OPS_ALERT_EMAIL`. Ação operacional do usuário: definir também o limite de gasto no Console da Anthropic.

### 6. SEC-017: LGPD em cinco fatias
| Fatia | Conteúdo | Pts | Prazo sugerido |
| :-- | :-- | :-: | :-- |
| 017a | Expurgo técnico no *cron* (sessões vencidas, `verification_tokens`, convites encerrados > 90 dias, idempotência > 24 h) + **parar de guardar tokens Google** (`accounts`) e apagar os existentes | 3 | Próxima *sprint* (≤ 30 dias) |
| 017b | **Exportar meus dados** (JSON, portabilidade e acesso) | 3 | ≤ 60 dias |
| 017c | **Excluir minha conta** = sair da família + **anonimizar** a identidade (o histórico financeiro da família fica, ADR-019) | 5 | ≤ 60 dias, antes de abrir o cadastro além do alpha |
| 017d | **Excluir a família inteira** (único membro ativo): apagamento definitivo com *bypass* controlado dos gatilhos `forbid_mutation` | 5 | ≤ 90 dias |
| 017e | Política de retenção e aviso de privacidade (texto: PO + usuário; TL fornece a tabela de retenção) | 1 | Junto com a 017c |
- Ex-membro: os dados financeiros **ficam** com a família (são registros compartilhados do caixa familiar, ADR-019). A **identidade** só é anonimizada quando o próprio ex-membro exclui a conta **[U5]**.
- Isto não é parecer jurídico. A base legal e os textos finais pedem revisão de quem responde pelo tratamento.

### 7. SEC-018: sessão só por *hash*, ociosidade e prazo absoluto
- O banco guarda **só `sha256(token)`** em hex (mesmo padrão do MCP). O *cookie* continua com o token aleatório. Um adaptador próprio substitui os métodos de sessão do `PrismaAdapter`. `findSessionUser`, `endSession` e o login de teste passam a usar o *hash*.
- Validade: **ociosidade 30 dias** (renovação deslizante, `updateAge` 1 dia) e **prazo absoluto de 90 dias desde o login** **[U2]**. Isso respeita a RN-012.3 (uso diário não pede login de novo; um novo login a cada 90 dias).
- "**Encerrar as outras sessões**" em Perfil. Todas as sessões do usuário são apagadas ao excluir a conta. As sessões vencidas vão para o expurgo.
- **Migração sem derrubar ninguém**, em duas fases:
  - (1) coluna `tokenHash` + *backfill* em SQL (`sha256()` nativo do Postgres) + `createdAt = now()` nas sessões existentes (todas ganham 90 dias absolutos a partir da migração). O código novo lê e grava só o *hash*.
  - (2) no *deploy* seguinte (≥ 1 dia depois), apaga a coluna `sessionToken`.
  - Durante a janela do `vercel-build`, o código antigo ainda acha a sessão pelo texto, porque a coluna só some na fase 2.

## Consequências
- Positivas: fecha a captura de pessoas por convite (SEC-004), estreita a superfície do OAuth do assistente (SEC-010/011), limita o prejuízo financeiro de abuso da IA (SEC-013), deixa um vazamento do banco sem sessões utilizáveis (SEC-018) e dá base para atender pedidos de titulares (SEC-017).
- Negativas e custos:
  - Um clique a mais para o convidado (SEC-004). Os E2E e *helpers* que contam com o vínculo automático precisam mudar.
  - O nome verificado do Claude passa a ser mantido no código (SEC-011).
  - A exclusão de família exige um caminho de apagamento que contorna gatilhos de imutabilidade, com risco alto e testes pesados (017d).
  - O SDD-026 muda o formato da saída de três ferramentas, um rompimento aceitável porque o único cliente é a LLM.
- Risco residual aceito: a injeção de instruções (SEC-009) não tem solução completa do lado do servidor. A mitigação real continua sendo escopo, limites e auditoria. Se o claude.ai não amarrar o `state` ao navegador, a variante "URL de `/oauth/authorize` repassada" ainda depende de a vítima consentir; ela é mitigada pelo aviso e pela notificação (SEC-011).

## Alternativas rejeitadas
- **SEC-004 aceite só pelo link com token**: quebra o caminho "entrei direto pelo app" (US-003) e não acrescenta segurança além do e-mail verificado. O token entra como contexto, e a regra continua sendo o e-mail.
- **SEC-009 filtrar ou reescrever descrições**: falsos positivos em dado financeiro legítimo e nenhuma garantia contra variações.
- **SEC-018 JWT sem estado**: perde a revogação imediata (sair, remoção, encerrar outras sessões) que o app já usa.
- **SEC-018 invalidar todas as sessões na migração**: simples, mas derruba todos sem aviso (contraria o pedido do Gestor).
- **SEC-013 somar `llm_budget_months` a cada reserva**: varredura crescente e corrida entre famílias; uma linha global com `FOR UPDATE` é O(1).

## Fontes
LGPD (Lei 13.709/2018) arts. 15-16 (término e eliminação), 18 (direitos do titular) e 19 (prazo de 15 dias para o acesso completo). OAuth Client ID Metadata Document (draft IETF `oauth-client-id-metadata-document`), §§ sobre SSRF e redirect URIs. RFC 9700 (OAuth 2.0 Security BCP) §4.1 e §4.2. Cookie prefix `__Host-` (RFC 6265bis). Postgres 11+ `sha256(bytea)` nativo.
