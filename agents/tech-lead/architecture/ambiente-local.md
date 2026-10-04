# Ambiente Local / Dev (Especificação)

*Responsável: Agente Tech Lead. Referência: [ADR-001](../adrs/ADR-001-stack-tecnologica.md), [ADR-002](../adrs/ADR-002-autenticacao-google.md), [ADR-003](../adrs/ADR-003-jobs-e-agendamento.md).*

## Objetivo
Qualquer pessoa clona o repositório e tem o sistema rodando com poucos comandos, sem depender de produção.

## Topologia

```text
 host                               docker compose
 ┌──────────────────────┐          ┌──────────────────────────┐
 │ pnpm dev (Next, HMR) │ ───────▶ │ postgres:17        :5432 │
 │ pnpm worker (pg-boss)│          │ postgres:17 (teste, tmpfs)│
 └──────────────────────┘          │ mailpit  SMTP:1025 UI:8025│
                                   └──────────────────────────┘
```

O Next e o worker rodam no **host** (HMR rápido); só as dependências rodam em container.

## Pré-requisitos
- Node 22 LTS (`.nvmrc`), pnpm (`packageManager` travado no `package.json`), Docker + Docker Compose.

## Subida (alvo)
```bash
cp .env.example .env.local     # preencher credenciais Google de DEV
docker compose up -d
pnpm i
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Serviços
| Serviço | Uso | Porta |
| :--- | :--- | :--- |
| `db` | Postgres de desenvolvimento (volume persistente) | 5432 |
| `db-test` | Postgres efêmero (tmpfs) para testes de integração | 5433 |
| `mailpit` | Captura e-mails de convite | SMTP 1025, UI 8025 |

Testes de integração usam **Testcontainers**, então o `db-test` é opcional (atalho local).

## Variáveis de ambiente (`.env.example`, somente placeholders)
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL=http://localhost:3000`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `APP_TIMEZONE=America/Sao_Paulo`. Segredos reais ficam em `.env.local` (no `.gitignore`).

## Login Google em dev
Criar um OAuth client "Web" no Google Cloud (projeto de desenvolvimento) com redirect `http://localhost:3000/api/auth/callback/google`. Escopos: `openid email profile`.

## Seed
Família de exemplo com dados fictícios (2 membros, contas, cartão, transações compartilhadas para exercitar o split). Nunca dados reais.

## Scripts previstos
| Script | Função |
| :--- | :--- |
| `dev` / `worker` | App com HMR / worker pg-boss |
| `db:migrate` / `db:seed` / `db:reset` | Migrações, seed, recriar banco |
| `lint` / `typecheck` | Biome / `tsc --noEmit` |
| `test` | Unidade (Vitest) |
| `test:int` | Integração (Testcontainers) |
| `test:e2e` | Playwright + playwright-bdd |

## Qualidade local (hooks)
Husky: `lint` + `typecheck` no pre-commit; commitlint no commit-msg (Conventional Commits e presença do trailer `Co-authored-by`).

## Definição de pronto do ambiente local
- [ ] `docker compose up -d` sobe `db` e `mailpit` saudáveis.
- [ ] `pnpm dev` abre em `http://localhost:3000` e `/api/health` retorna 200 com o banco ok.
- [ ] Login Google funciona em dev e a sessão persiste.
- [ ] `pnpm test`, `test:int` e `test:e2e` passam em máquina limpa.
- [ ] README raiz documenta os passos acima.
