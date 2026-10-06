# Produção do alpha: arquitetura, backup e restore (ADR-026)

## Visão
Railway: serviço web (Dockerfile) + Postgres gerenciado na rede privada. TLS e domínio `*.up.railway.app` pelo provedor.

- Imagem: `Dockerfile` (standalone, usuário não root, `APP_DEPLOY_ENV=production` gravado). Ferramentas de migração em `/opt/migrate`.
- Release: `railway.json` -> `preDeployCommand` roda `prisma migrate deploy`; falhou, o deploy não sobe e a versão anterior segue no ar. Healthcheck `/api/health`.
- Travas (ADR-026 §5): com `APP_DEPLOY_ENV=production`, a presença de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE` impede o boot (`instrumentation.ts`), desliga o login/ferramentas de teste e faz `/api/health` responder 503 `unsafe_config`.
- Smoke pós-deploy: `scripts/smoke-prod.sh <url>`.

## Variáveis do serviço web
`DATABASE_URL` (referência ao Postgres do Railway), `AUTH_SECRET`, `AUTH_URL` e `APP_URL` (URL pública https), `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `APP_TIMEZONE=America/Sao_Paulo`. Opcional: `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` (o app ainda não envia usuário/senha SMTP: só serve a relays sem autenticação; convites por link funcionam sem e-mail).
**Nunca definir** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE`.

## Backup
1. Snapshots do Postgres ligados na UI do Railway.
2. `pg_dump -Fc` semanal (domingo 03:00 BRT) por `.github/workflows/backup.yml`, criptografado com gpg (AES256) e guardado como artefato por 35 dias. Segredos do repositório: `DATABASE_PUBLIC_URL`, `BACKUP_PASSPHRASE`. Manual: `scripts/backup.sh`.

## Restore (ensaiar antes do go-live)
```bash
# 1. baixar o artefato do GitHub Actions (aba Actions > execução > Artifacts) e descompactar
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d finance-backup.dump.gpg > finance.dump
# 2. ensaio local (Postgres 17 vazio, ex.: docker run -e POSTGRES_PASSWORD=x -p 5499:5432 postgres:17)
pg_restore --clean --if-exists --no-owner -d "postgresql://postgres:x@localhost:5499/postgres" finance.dump
# 3. restore real (o app fica parado/em manutenção): mesmo comando com -d "$DATABASE_PUBLIC_URL"
```
Depois do restore: abrir `/api/health` e conferir contas/lançamentos recentes.
