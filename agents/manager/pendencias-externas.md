# Pendências Externas (para o usuário resolver depois)

*Tudo que o time não pôde fazer localmente por depender de contas, tokens ou serviços de terceiros. Cada item indica o que está mockado hoje e como ligar o real.*

| ID | Pendência | Estado local (mock) | O que o usuário precisa fazer | Origem |
| :-- | :-- | :-- | :-- | :-- |
| EXT-01 | Login com Google (OAuth) | Provedor de login de teste (`AUTH_DEV_LOGIN`) | Criar OAuth client "Web" no Google Cloud, redirect `http://localhost:3100/api/auth/callback/google`; preencher `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` em `.env.local` | ADR-002 |
| EXT-02 | Envio de e-mail de convite | Mailpit local (SMTP 1025, UI 8025) | Escolher provedor SMTP/transacional e configurar `SMTP_*` | US-003 |
| EXT-03 | Hospedagem de produção, domínio e Postgres gerenciado | Não existe | Decidir provedor (ADR-005) | ADR-005 |
| EXT-04 | Sentry / observabilidade | Apenas logs locais (pino) | Criar projeto e informar `SENTRY_DSN` | ADR-001 |
| EXT-05 | Imagens Docker e pacotes (postgres:17, axllent/mailpit, npm/pnpm, binário do Chromium do Playwright) baixados de registries públicos | Baixados na primeira subida; nenhum segredo envolvido | Em máquina nova, garantir acesso à internet/registries para `docker compose up`, `pnpm i` e `pnpm exec playwright install chromium` | EN-001 |
| EXT-06 | CI remoto (GitHub Actions) para lint, typecheck, testes e e2e | Não existe; qualidade garantida só por hooks locais (Husky) | Criar repositório remoto e habilitar Actions quando decidir (ADR-005) | EN-001 |
| EXT-07 | `AUTH_SECRET` forte para qualquer ambiente fora da máquina local | `.env.example` traz placeholder; `.env.local` usa valor de dev | Gerar com `openssl rand -base64 32` e guardar no gerenciador de segredos do provedor | EN-001 / ADR-002 |
| EXT-08 | Domínio e DNS do remetente de e-mail (SPF/DKIM/DMARC) | `MAIL_FROM` local (`no-reply@finance-manager.local`) via Mailpit | Definir domínio de envio e publicar os registros DNS junto com a escolha do provedor (EXT-02) e da hospedagem (EXT-03) | ADR-012 |
| EXT-09 | Biblioteca de autenticação em versão beta e provedor de e-mail real | `next-auth@5.0.0-beta.32` (fixada no lockfile) usado apenas para `signOut` e OAuth Google; e-mails de convite só no Mailpit via `nodemailer` | Acompanhar a versão estável do Auth.js v5 antes de ir a produção; ao contratar o SMTP (EXT-02), configurar `SMTP_*`/`MAIL_FROM` (EXT-08) e, no Google (EXT-01), o redirect `/api/auth/callback/google` e `AUTH_TRUST_HOST` conforme a hospedagem (EXT-03) | US-001 / US-003 |

*Os agentes acrescentam linhas à tabela conforme surgirem novas dependências.*
