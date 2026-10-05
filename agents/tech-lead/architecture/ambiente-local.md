# Ambiente Local / Dev (Especificação)

*Responsável: Agente Tech Lead. **Revisão 2 (2026-10-04)**: portas da D-GES-10 e login de teste da D-GES-11. Referências: [ADR-001](../adrs/ADR-001-stack-tecnologica.md), [ADR-002](../adrs/ADR-002-autenticacao-google.md), [ADR-003](../adrs/ADR-003-jobs-e-agendamento.md), [ADR-008](../adrs/ADR-008-login-de-teste.md), [SDD-006](../sdd/SDD-006-esqueleto-e-ambiente.md).*

## Objetivo
Qualquer pessoa clona o repositório e tem o sistema rodando com poucos comandos, sem depender de produção, de conta Google ou de qualquer serviço externo (diretriz 1 do Gestor).

## Topologia

```text
 host                                 docker compose (-p finance-manager)
 ┌────────────────────────┐          ┌──────────────────────────────────┐
 │ pnpm dev  (Next :3100) │ ───────▶ │ db       postgres:17   :5442     │
 │ pnpm worker (pg-boss)  │          │ db-test  postgres:17   :5443 tmpfs│
 └────────────────────────┘          │ mailpit  SMTP :1025  UI :8025    │
                                     └──────────────────────────────────┘
```

O Next e o worker rodam no **host** (HMR rápido); só as dependências rodam em container. Todas as portas publicadas em `127.0.0.1`.

## Pré-requisitos
- Node 22 LTS (`.nvmrc`), pnpm (`packageManager` travado), Docker + Docker Compose.

## Subida (alvo)
```bash
cp .env.example .env.local     # login de teste já vem habilitado; Google real é opcional (EXT-01)
pnpm db:up                     # docker compose -p finance-manager up -d --wait
pnpm i
pnpm db:migrate
pnpm db:seed
pnpm dev                       # http://localhost:3100
```

## Serviços e portas (D-GES-10, vinculante)
| Serviço | Uso | Porta no host |
| :--- | :--- | :--- |
| `db` | Postgres de desenvolvimento (volume persistente) | **5442** |
| `db-test` | Postgres efêmero (tmpfs) para testes de integração e E2E | **5443** |
| `mailpit` | Captura e-mails de convite | SMTP **1025**, UI **8025** |
| app (Next) | `pnpm dev` / `pnpm start` | **3100** |

Os testes de integração usam o `db-test` (5443) com `TEST_DATABASE_URL`; **Testcontainers deixa de ser o caminho padrão** (emenda ao ADR-001: o `db-test` do compose cumpre o mesmo papel, com Postgres real, e evita depender do socket Docker nos testes). Detalhes de isolamento entre testes em [SDD-006](../sdd/SDD-006-esqueleto-e-ambiente.md).

## Variáveis de ambiente (`.env.example`, somente placeholders)
| Variável | Valor em dev | Observação |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://finance:…@localhost:5442/finance_dev?schema=public` | |
| `TEST_DATABASE_URL` | `postgresql://finance:…@localhost:5443/finance_test?schema=public` | testes |
| `APP_URL` / `AUTH_URL` | `http://localhost:3100` | **sempre 3100** |
| `AUTH_SECRET` | `openssl rand -base64 32` | |
| `AUTH_TRUST_HOST` | `true` | só dev/teste |
| `AUTH_DEV_LOGIN` | `true` | login de teste (ADR-008). **Bloqueado em `NODE_ENV=production`** |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | vazios | pendência EXT-01; Google só é registrado como provider quando ambos estão preenchidos |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Mailpit |
| `MAIL_FROM` | `Finance Manager <no-reply@finance-manager.local>` | |
| `APP_TIMEZONE` | `America/Sao_Paulo` | |
| `APP_NOW_OVERRIDE` | (comentada) | ISO-8601; fixa o relógio da aplicação; **ignorada em produção** (ver SDD-000 §8) |

Segredos reais ficam em `.env.local` (no `.gitignore`).

## Login em dev: provedor de teste (D-GES-11)
- Com `AUTH_DEV_LOGIN=true` (e `NODE_ENV != production`) a tela `/login` exibe, **além** do botão do Google, o bloco "Entrar como (teste)": campo e-mail, campo nome e botão *Entrar (teste)*, mais atalhos para os usuários do seed.
- Sem credenciais Google, o botão "Entrar com o Google" aparece desabilitado com a dica "Google não configurado neste ambiente" (somente quando o dev-login está ativo).
- Especificação completa e proteções em [ADR-008](../adrs/ADR-008-login-de-teste.md) e [SDD-003 §3](../sdd/SDD-003-auth-familia-convite.md).
- **Login Google real** (opcional, EXT-01): OAuth client "Web" com redirect `http://localhost:3100/api/auth/callback/google`; escopos `openid email profile`.

## Seed
Família fictícia determinística (definida em [SDD-006 §5](../sdd/SDD-006-esqueleto-e-ambiente.md)): 2 membros, contas, transações comuns e pessoais, regra 50/50. Nunca dados reais. O mesmo seed (ou helpers equivalentes de `tests/support`) alimenta os cenários E2E.

## Scripts
| Script | Função |
| :--- | :--- |
| `dev` / `start` / `worker` | App com HMR / app compilado (porta 3100) / worker pg-boss |
| `db:up` | `docker compose -p finance-manager up -d --wait` |
| `db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Migrações (dev / deploy), seed, recriar banco |
| `lint` / `typecheck` | Biome / `tsc --noEmit` |
| `test` | Unidade (Vitest) |
| `test:int` | Integração (Vitest contra `db-test`:5443) |
| `test:e2e` | Playwright + playwright-bdd (usa `db-test`; ver SDD-006 §4) |
| `migrate:split` | Migração do acerto para o rateio gravado por lançamento (EN-002b; ver "Migração do acerto" abaixo) |

## Migração do acerto (EN-002b, SDD-015 §4.6 e ADR-021)
Script operacional (nunca rota HTTP; usa `DATABASE_URL`). Uma transação por família, em ordem de `id`; continua depois da falha de uma família e **sai com código 1 se houver qualquer falha** (etapa obrigatória do deploy).

| Comando | Efeito |
| :--- | :--- |
| `pnpm migrate:split --dry-run` | Ensaio: fotografa o acerto LEGACY, preenche o rateio, confere o *gate* de 1 centavo e **desfaz** (relatório com contagens) |
| `pnpm migrate:split` | Migra as famílias `LEGACY` (idempotente: família `DONE` é `SKIPPED`) |
| `pnpm migrate:split --family <uuid> --today YYYY-MM-DD` | Uma família; "hoje" fixo (rótulo do *snapshot*) |
| `pnpm migrate:split --verify` | Integridade (não compara números); código 1 se falhar |
| `pnpm migrate:split --engine LEGACY --family <uuid>` | Reversão nível 1: volta o motor sem tocar nos dados |
| `pnpm migrate:split --rollback --purge [--family <uuid>]` | Reversão nível 2: apaga o rateio; **recusa** (código 2, nada alterado) com `CUSTOM`, parcela dividida ou migração de contrato |

Ordem de *deploy*: (1) cópia do banco (`pg_dump`); (2) `pnpm db:deploy`; (3) subir o código novo; (4) `pnpm migrate:split --dry-run`; (5) `pnpm migrate:split`; (6) `pnpm migrate:split --verify`; (7) monitorar; (8) só depois da janela de reversão, a migração de contrato `us043_modo_custom`. Famílias novas já nascem `STORED`. Regressão: `TEST_SPLIT_ENGINE=STORED pnpm test:int` roda a suíte com famílias `STORED`.

## Qualidade local (hooks)
Husky: `lint` + `typecheck` no pre-commit; commitlint no commit-msg (Conventional Commits e presença do trailer `Co-authored-by`).

## Definição de pronto do ambiente local
- [ ] `pnpm db:up` sobe `db`, `db-test` e `mailpit` saudáveis nas portas 5442, 5443, 1025/8025.
- [ ] `pnpm dev` abre em `http://localhost:3100` e `/api/health` retorna 200 com o banco ok.
- [ ] Login de teste funciona e a sessão persiste (após US-001); com `NODE_ENV=production` o endpoint de dev-login responde 404 e a aplicação **recusa subir** se `AUTH_DEV_LOGIN=true`.
- [ ] `pnpm test`, `test:int` e `test:e2e` passam em máquina limpa.
- [ ] README raiz documenta os passos acima.
