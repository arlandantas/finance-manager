# ADR-002: Autenticação com Google via Auth.js

## Status
Aceito

## Contexto
NEED-012 / RN-012: login e cadastro **exclusivamente via Conta Google** no AP0, com e-mail verificado como chave de associação familiar, importação de nome/avatar e sessão persistente. Expansão futura prevista (Apple, magic link, e-mail/senha).

## Decisão
- **Auth.js v5** com provider Google; adaptador Prisma.
- **Sessão em banco** (tabela de sessões), cookie `httpOnly`, `Secure` (em prod), `SameSite=Lax`, validade longa deslizante (atende RN-012.3).
- Novos provedores entram como providers adicionais, sem mudar o modelo (`User` 1:N `Account`).
- **Associação à família:** por convite por e-mail; ao logar, o e-mail Google verificado é casado com o convite pendente. E-mail não é editável pelo usuário (RN-012.2).
- **Dev local:** OAuth client "Development" próprio, redirect `http://localhost:3000/api/auth/callback/google`. Segredos apenas em `.env.local` (fora do git); `.env.example` com placeholders.
- E-mails de convite em dev são capturados pelo **Mailpit**.

## Consequências
- Sem armazenamento de senhas no MVP.
- Dependência do Google: exige configuração do consent screen (verificação só necessária para escopos sensíveis; usamos apenas `openid email profile`).
- Testes E2E não passam pelo Google real: usar provider de teste/sessão semeada em ambiente de teste.
