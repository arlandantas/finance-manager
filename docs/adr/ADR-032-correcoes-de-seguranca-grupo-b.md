# ADR-032 — Correções de segurança do Grupo B (SEC-004, 009, 010, 011, 013, 017, 018)

**Status:** aceito para especificação (itens [U] com recomendação do arquiteto até decisão do usuário) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
O levantamento de segurança mostrou isolamento entre famílias sólido, mas sete achados pedem desenho antes do código (D-GES-40): entrada em família sem consentimento, texto de outros membros lido pelo assistente, cliente OAuth identificado só pelo host, consentimento OAuth completável por qualquer navegador, custo de LLM sem teto agregado, lacunas de LGPD e sessão guardada em texto.

## Decisão
1. **SEC-004 — convite só vale com aceite explícito.** O gate **não vincula** mais (`acceptPendingInvitation` sai de `resolveAppEntry`, do onboarding e do `GET /convite/[token]`). Quem entra sem família com convite para o e-mail verificado vai a `/convites` (Entrar/Recusar por convite; "Criar minha família"). O aceite é `POST` com `Idempotency-Key` e CSRF, exige e-mail verificado igual, convite `PENDING` não vencido e usuário **sem família ativa** (`409 ALREADY_IN_FAMILY`). Novo status `DECLINED`; evento `MEMBER_JOINED`.
2. **SEC-009 — texto de membro é dado marcado.** Todo texto livre passa por `sanitizeUserText` (NFKC, sem controles/invisíveis/bidi, tamanho máximo) e sai das ferramentas MCP em envelope `{ untrusted_text, flagged }`. A heurística só **marca**, não reescreve. O `content` começa com aviso de dados; `instructions` e a descrição de `lancar_despesa` dizem que só se lança a pedido do próprio usuário.
3. **SEC-010 — CIMD por URL exata:** allowlist `MCP_CIMD_ALLOWED_CLIENT_IDS` (a `MCP_CIMD_ALLOWED_HOSTS` fica obsoleta; só ela em produção ⇒ boot falha). Busca com teto de bytes em stream, 5 s, sem redirect, IP resolvido não privado; `redirect_uri` https, sem fragmento, mesmo host do `client_id`; loopback não vale para CIMD; cliente revalidado a cada uso.
4. **SEC-011 — consentimento amarrado ao navegador:** `/oauth/authorize` grava cookie `__Host-mcp_authz` (HttpOnly, Secure, SameSite=Lax, 10 min) com nonce; o pedido guarda `sha256(nonce)` e consentimento/decisão exigem o mesmo navegador. A tela mostra nome e domínio **verificados** (tabela do servidor por `client_id` exato) e a URL de retorno completa; cliente não verificado recebe aviso forte. Conexão nova gera aviso no app e e-mail.
5. **SEC-013 — teto global de LLM com falha fechada:** `llm_global_budget_months`, reservado na mesma transação da família, travando sempre na ordem família ➜ global. `LLM_GLOBAL_MONTHLY_CAP_CENTS` obrigatória em produção com IA ligada (valor decidido: R$ 50/mês, D-GES-42). Alarmes em 50/80/100% (um por limiar por mês).
6. **SEC-017 — LGPD em fatias:** (a) expurgo técnico no cron (sessões vencidas, `verification_tokens`, convites encerrados > 90 dias, idempotência > 24 h) e **parar de guardar tokens Google**; (b) exportar meus dados (JSON); (c) excluir minha conta = sair da família + **anonimizar** a identidade (histórico financeiro fica, ADR-019); (d) excluir a família inteira com bypass controlado dos gatilhos `forbid_mutation`; (e) política de retenção.
7. **SEC-018 — sessão só por hash:** o banco guarda `sha256(token)` em hex; adaptador próprio substitui os métodos de sessão do `PrismaAdapter`. Ociosidade **30 dias** (deslizante, `updateAge` 1 dia) e prazo absoluto **90 dias** desde o login. "Encerrar as outras sessões" no Perfil. Migração em duas fases sem derrubar ninguém: (1) coluna `tokenHash` + backfill SQL; (2) no deploy seguinte, remover `sessionToken`.

## Consequências
- Um clique a mais para o convidado (E2E e helpers mudam); nome verificado do Claude mantido em código; exclusão de família exige caminho de risco alto e testes pesados.
- Risco residual aceito: injeção de instruções não tem solução completa no servidor (mitigação: escopo, limites, auditoria).
- Descartados: aceite só por token do link, filtrar descrições, JWT de sessão, invalidar todas as sessões na migração.
