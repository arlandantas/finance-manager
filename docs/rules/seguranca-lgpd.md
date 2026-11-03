# Regras: segurança e LGPD

- Usuário, família e papel vêm SÓ da sessão; corpos Zod `.strict()` (campo extra = 400); IDs de destino validados com `familyId` (sem IDOR/BOLA).
- "Só meu": só o responsável atual torna/mantém item pessoal; nunca vazar em listas, totais, exportação, MCP ou LLM de terceiros.
- Nada vai à LLM sem consentimento efetivo checado na transação e payload anonimizado que passou por schema `.strict()` (ADR-029); custo sob teto (ADR-028).
- Segredos (`ANTHROPIC_API_KEY`, tokens, chaves) nunca no cliente, em log, commit ou resposta; teste `bundle-secrets`.
- Sem e-mail de terceiros, `pendingEmail` ou conteúdo de usuário em logs, auditoria, exportação ou MCP.
- OAuth/MCP: um membro de uma família por conexão; token com audiência canônica; `client_id` em allowlist; falha fechada (ADR-030).
- Ações destrutivas (excluir conta/família) exigem reautenticação e confirmação igual à própria conta; conta excluída nunca autentica.
- Reviewer, checklist: (1) sessão e `familyId` em toda query? (2) Zod strict? (3) "Só meu" respeitado? (4) PII fora de log/LLM? (5) segredo exposto?
