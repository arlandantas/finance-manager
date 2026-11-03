# 💰 Gestão Financeira Familiar

Aplicação web moderna e colaborativa voltada para o controle financeiro de famílias e casais. O sistema permite planejar despesas compartilhadas e individuais, monitorar orçamentos mensais, acompanhar investimentos e metas patrimoniais, e obter relatórios claros para tomadas de decisão financeiras saudáveis.

---

## 🧭 Visão do Projeto

A gestão financeira familiar possui particularidades cruciais:
- **Contas individuais vs. conjuntas**: Divisão proporcional de custos fixos, gastos pessoais e reservas em comum.
- **Orçamentos por categoria**: Tetos de gastos com alertas em tempo real para alimentação, moradia, lazer, educação, etc.
- **Metas e Sonhos**: Acompanhamento de objetivos familiares (reserva de emergência, férias, reforma, aposentadoria).
- **Usabilidade acessível**: Interface amigável para todos os membros da família, com dashboards visuais e intuitivos.
- **Segurança e Rigor Contábil**: Proteção rigorosa de dados sensíveis, autenticação com isolamento por núcleo familiar e cálculo em centavos para evitar erros de arredondamento.

---

## 🤖 Fluxo de Trabalho com Agentes

Fluxo enxuto: a sessão principal (gestor) lê [`AGENTS.md`](AGENTS.md) e [`docs/STATE.md`](docs/STATE.md), delega cada história a um `builder` (Sonnet), pede revisão ao `reviewer` (Sonnet) e usa `architect` (Opus, raro) e `researcher` (Haiku) quando preciso. Papéis em [`docs/agents/`](docs/agents/README.md), wrappers em `.claude/agents/`. O histórico do modelo anterior (Stakeholder, PO, Tech Lead, Dev/QA, Segurança) está no git: `git log -- agents/`.

## 📁 Estrutura de Diretórios

```text
finance-manager/
├── AGENTS.md          # Ponto de entrada dos agentes (≤80 linhas)
├── docs/              # STATE, backlog, spec, adr, rules, agents, templates, roadmap
├── .claude/agents/    # Subagentes finos com modelo fixado
├── src/  prisma/  tests/  scripts/
```

---

## 🛠️ Ambiente Local (EN-001)

Pré-requisitos: Node 22 (`.nvmrc`), pnpm 11 (versão travada em `packageManager`; use `corepack enable`), Docker + Docker Compose.

```bash
cp .env.example .env.local        # valores de DEV já funcionam; Google fica para depois (EXT-01)
pnpm db:up                        # docker compose -p finance-manager up -d --wait (db, db-test, mailpit)
pnpm i
pnpm db:migrate                   # aplica migrações no Postgres dev
pnpm db:seed
pnpm dev                          # http://localhost:3100  (health: /api/health)
```

**Portas** (deslocadas para não colidir com serviços comuns da máquina, D-GES-10):

| Serviço | Porta |
| :-- | :-- |
| App Next | 3100 |
| Postgres dev (`db`) | 5442 |
| Postgres teste (`db-test`, tmpfs) | 5443 |
| Mailpit SMTP / UI | 1025 / 8025 |

**Scripts**

| Script | Função |
| :-- | :-- |
| `pnpm dev` / `build` / `start` | App (HMR) / build de produção / servir build |
| `pnpm lint` / `lint:fix` / `typecheck` | Biome / `tsc --noEmit` |
| `pnpm test` | `check:imports` (ADR-013) + `check:docs` + unidade e componentes (Vitest + Testing Library) |
| `pnpm check:imports` | Verifica restrições de import (`@/lib/db` só em repositórios; regras puras sem Next/Prisma/relógio) |
| `pnpm check:docs` | Links relativos de `docs/**`, README e AGENTS; limites de tamanho (AGENTS ≤80, spec ≤120, história ≤60, ADR ≤40, STATE ≤40); índice ↔ histórias |
| `pnpm test:int` | Integração contra o Postgres `db-test` (porta 5443) |
| `pnpm test:e2e` | Playwright + playwright-bdd (features em `tests/e2e/features`). Sobe o app em **3101** contra o `db-test` (5443), com relógio fixo em 2026-10-04 e e-mails no Mailpit. Primeira vez: `pnpm exec playwright install chromium` |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Migrações (dev) / aplicar existentes / seed / recriar banco |

Hooks (Husky): `pre-commit` roda `lint` + `typecheck` + `check:imports` + `check:docs`; `commit-msg` exige Conventional Commits e o trailer `Co-authored-by:`.

Estrutura de código: `src/app` (rotas Next), `src/modules/<dominio>` (regras puras), `src/lib` (env, db), `prisma/` (schema, migrações, seed), `tests/{unit,integration,e2e}`.

**Acesso por localhost, IP da rede e túnel (dev):** `pnpm dev` escuta em `0.0.0.0:3100`.
- `http://localhost:3100`: sempre.
- IP da LAN (ex.: `http://192.168.1.81:3100`, descubra com `hostname -I`): funciona sem configurar, pois em dev IPs privados RFC1918 e `*.local` são aceitos automaticamente (o IP pode mudar). Para fixar/limitar, use `APP_DEV_ORIGINS` (lista por vírgula) e `APP_DEV_LAN_AUTO=false`. Como é `http` sem TLS, o navegador não expõe `crypto.randomUUID`; o app usa um fallback.
- Túnel (só quando você iniciar, ex.: `npx localtunnel --port 3100`): ponha a URL em `APP_PUBLIC_ORIGIN`; o Service Worker de repetição (`public/tunnel-retry-sw.js`) só é registrado quando a página abre nesse host.
- Mudou `.env.local` ou `next.config.ts`? Reinicie o `pnpm dev`. Nada disso vale em produção (`NODE_ENV=production` ignora as listas; o login de teste é bloqueado) e `/api/dev/clock` segue só em localhost direto.
- Os links de convite usam a origem de onde o admin está logado (se for origem de dev permitida), senão `APP_PUBLIC_ORIGIN`, senão `APP_URL`.
- **Google OAuth**: o redirect é sempre `AUTH_URL` + `/api/auth/callback/google`; cadastre `http://localhost:3100/api/auth/callback/google` no Google Cloud e use localhost para entrar com Google (o Google não aceita IP privado como redirect). Detalhes em EXT-01.

**Login em dev:** com `AUTH_DEV_LOGIN=true` a tela `/login` oferece "Entrar como (teste)" (atalhos Mariana e Lucas, criados por `pnpm db:seed`); o endpoint é bloqueado em produção e a aplicação recusa subir com a flag ligada. Convites chegam ao Mailpit (http://localhost:8025). Depois de mudar o schema Prisma, reinicie o `pnpm dev` (o cliente fica em cache).

Observações: dependências externas pendentes ficam em [`docs/STATE.md`](docs/STATE.md).
