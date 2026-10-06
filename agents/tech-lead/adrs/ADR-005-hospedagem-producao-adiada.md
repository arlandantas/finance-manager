# ADR-005: Hospedagem e Stack de Produção (Adiada)

## Status
Adiado. O Gestor decidiu focar primeiro no **ambiente local**; a produção será decidida em um segundo momento.

## O que já está decidido (independe do provedor)
- Empacotamento: um `Dockerfile` multi-stage (Next em modo `standalone`) servindo web e worker, usuário não-root. Mantém a escolha portátil.
- Banco: PostgreSQL gerenciado com backup e PITR, em região do Brasil (LGPD/latência).
- CI/CD: GitHub Actions (lint, typecheck, unit, integração, E2E → imagem no GHCR → staging → promoção manual a produção). Migrações expand/contract com `prisma migrate deploy` como etapa de release.
- Segurança: segredos no gerenciador do provedor, CSP/HSTS, rate limit nas rotas de escrita, teste de restore periódico.

## Opções registradas para a decisão futura
| Opção | Prós | Contras |
| :--- | :--- | :--- |
| A. Containers (Fly/Railway/VPS+Coolify) + Postgres gerenciado (preferência do Tech Lead) | Worker contínuo funciona, custo previsível, sem lock-in | Pequena carga de operação |
| B. Vercel + Neon/Supabase | Zero ops, preview por PR | Worker não roda em serverless (cron externo); custo por uso |
| C. VPS única com banco incluso | Mais barata | Backup/restore por nossa conta; risco alto para dado financeiro (desaconselhada) |

## Pendências para decidir
Orçamento mensal, região, necessidade de ambiente de staging dedicado.

## Requisito de segurança para o deploy de produção (ADR-024 rev. 2)
A pipeline/deploy de produção **deve falhar** se `APP_HOMOLOG_MODE` ou `AUTH_DEV_LOGIN` existirem na configuração (variáveis, secrets, `.env`). A homologação local só tem travas mínimas por decisão do usuário; em produção essas flags nunca podem existir. CI ainda não criado; registrar como etapa obrigatória quando a hospedagem for decidida.
