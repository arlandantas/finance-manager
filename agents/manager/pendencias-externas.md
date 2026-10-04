# Pendências Externas (para o usuário resolver depois)

*Tudo que o time não pôde fazer localmente por depender de contas, tokens ou serviços de terceiros. Cada item indica o que está mockado hoje e como ligar o real.*

| ID | Pendência | Estado local (mock) | O que o usuário precisa fazer | Origem |
| :-- | :-- | :-- | :-- | :-- |
| EXT-01 | Login com Google (OAuth) | Provedor de login de teste (`AUTH_DEV_LOGIN`) | Criar OAuth client "Web" no Google Cloud, redirect `http://localhost:3100/api/auth/callback/google`; preencher `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` em `.env.local` | ADR-002 |
| EXT-02 | Envio de e-mail de convite | Mailpit local (SMTP 1025, UI 8025) | Escolher provedor SMTP/transacional e configurar `SMTP_*` | US-003 |
| EXT-03 | Hospedagem de produção, domínio e Postgres gerenciado | Não existe | Decidir provedor (ADR-005) | ADR-005 |
| EXT-04 | Sentry / observabilidade | Apenas logs locais (pino) | Criar projeto e informar `SENTRY_DSN` | ADR-001 |

*Os agentes acrescentam linhas à tabela conforme surgirem novas dependências.*
