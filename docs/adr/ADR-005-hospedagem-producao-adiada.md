# ADR-005 — Hospedagem e stack de produção (adiada)

**Status:** substituído por ADR-031 (escolha do provedor); requisitos abaixo seguem vigentes · **Data:** 2026-10 · **Autor:** gestor

## Contexto
O Gestor focou primeiro no ambiente local e adiou a produção.

## Decisão
Independente do provedor:
- Empacotamento portátil: `Dockerfile` multi-stage (Next `standalone`), usuário não-root.
- Banco: PostgreSQL gerenciado com backup e PITR, região Brasil (LGPD/latência).
- CI/CD: GitHub Actions (lint, typecheck, unit, integração, E2E), migrações expand/contract com `prisma migrate deploy` como etapa de release.
- Segurança: segredos no gerenciador do provedor, CSP/HSTS, rate limit nas rotas de escrita, teste de restore periódico.
- **Trava de deploy:** a pipeline de produção **deve falhar** se `APP_HOMOLOG_MODE` ou `AUTH_DEV_LOGIN` existirem na configuração (variáveis, secrets, `.env`), ver ADR-024.

## Consequências
- Opções avaliadas (containers+Postgres gerenciado, Vercel+Neon/Supabase, VPS única — esta desaconselhada para dado financeiro) foram resolvidas no ADR-031.
- CI ainda não criado: a trava acima é etapa obrigatória quando existir.
