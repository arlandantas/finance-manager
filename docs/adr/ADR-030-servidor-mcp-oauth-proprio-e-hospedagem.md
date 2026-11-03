# ADR-030 — Servidor MCP no app Next: OAuth 2.1 próprio, escopos e lançamento direto

**Status:** aceito (revisão 2; hospedagem resolvida no ADR-031) · **Data:** 2026-10-24 · **Autor:** arquiteto

## Contexto
O membro quer consultar e lançar despesas pelo assistente (Claude, ChatGPT, Gemini), por membro (D-GES-35), ignorando "ocultar valores". Claude.ai e ChatGPT hospedados não aceitam *bearer* colado por usuário, então é preciso OAuth. O app é livro-caixa: nenhuma ferramenta movimenta dinheiro real. POC com um cliente (Claude); registro por CIMD (DCR adiado). D-GES-36.

## Decisão
1. **Servidor no app**, `POST /api/mcp` (`runtime = "nodejs"`), stateless (tokens, limites, auditoria no Postgres); `GET`/`DELETE` ⇒ 405; `Origin` inválido ⇒ 403; lista fechada de ferramentas, sem resources/prompts/sampling.
2. **O app é o Authorization Server:** só `authorization_code` + **PKCE S256** + `refresh_token`; `resource` (RFC 8707) obrigatório; `iss` (RFC 9207); clientes só públicos; CIMD com proteção SSRF (https, ≤ 5 KB, 5 s, allowlist `MCP_CIMD_ALLOWED_HOSTS`); redirect URI exata (exceto loopback). Tokens **opacos** (`fma_`/`fmr_`/`fmc_`), guardados só como SHA-256. Código 60 s uso único; acesso **60 min**; refresh com rotação (reuso ⇒ revoga o grant); teto 30 ou 90 dias. Consentimento é página do app atrás da sessão, com host do redirect em destaque.
3. **Escopos `read` e `write`** (`write` desmarcado por padrão). O grant liga `memberId + familyId + userId`; a cada chamada exige grant ativo e `findActiveMembership` igual; divergência ⇒ `401`. Mesmas permissões das telas.
4. **Bloqueio:** `families.assistantAccessEnabled` (só ADMIN); desligar revoga todos os grants na mesma transação; remover membro revoga os dele.
5. **Leitura** pelos mesmos serviços das telas, DTO por allowlist, centavos inteiros, `limit ≤ 50`.
6. **Escrita direta (D-GES-36):** `lancar_despesa` grava na hora, só despesa à vista "Só meu" do próprio membro, `origin = ASSISTANT` com selo "via assistente". Limites configuráveis pelo membro (padrão R$ 500 por lançamento, 10/dia, 5/hora; remover exige aviso e é auditado, `LIMITS_CHANGED`); validações de `createExpenseCore`; data entre hoje − 60 dias e hoje; idempotência por `idempotencyKey` e duplicata natural em 10 min (`allowDuplicate`); filtro "Origem: assistente" e cartão de conferência na Home; reversão pelo Excluir/Desfazer comum. Não existem ferramentas de editar, excluir, transferir, pagar fatura, dividir, parcelar ou receita. Modo opcional "exigir confirmação" no backlog (US-076c).
7. **Injeção de instruções:** capacidade mínima, texto livre tratado como dado, `note` não devolvida, anotações corretas de ferramenta. Risco residual aceito: lançamentos incorretos até os limites, detectados depois.
8. **Taxa e auditoria:** 60 chamadas/min e 1.000/dia por grant (fixos), `/token` 30/min, `/register` 10/h por IP; `mcp_audit_events` append-only com parâmetros permitidos e sem conteúdo devolvido, retenção 12 meses; tokens e códigos no `redact` do pino.

## Consequências
- O app mantém um AS OAuth (superfície de segurança nova): revisão de segurança antes de produção. Token pessoal fica como complemento futuro (US-074b).
- Teste com clientes reais exige URL pública HTTPS. Gemini app fora do Brasil por ora.
