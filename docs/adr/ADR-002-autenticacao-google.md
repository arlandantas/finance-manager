# ADR-002 — Autenticação com Google via Auth.js

**Status:** aceito · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Login e cadastro exclusivamente por Conta Google, e-mail verificado como chave de associação familiar, nome/avatar importados, sessão persistente. Expansão futura (Apple, magic link, senha) prevista.

## Decisão
- **Auth.js v5** com provider Google e adaptador Prisma; escopos apenas `openid email profile`.
- **Sessão em banco**, cookie `httpOnly`, `Secure` em produção, `SameSite=Lax`, validade longa deslizante.
- Novos provedores entram como providers adicionais (`User` 1:N `Account`).
- Associação à família por convite por e-mail: o e-mail Google verificado casa com o convite pendente. E-mail não é editável pelo usuário.
- Dev local: OAuth client "Development" próprio, redirect `http://localhost:3000/api/auth/callback/google`. Segredos só em `.env.local`; `.env.example` com placeholders. E-mails de convite em dev vão para o Mailpit.

## Consequências
- Sem senhas armazenadas no MVP; dependência do Google (consent screen).
- E2E não passa pelo Google real: usa o login de teste (ADR-008).
