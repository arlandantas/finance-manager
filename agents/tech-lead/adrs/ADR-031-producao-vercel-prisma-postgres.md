# ADR-031: Produção na Vercel + Prisma Postgres; desenvolvimento continua em Docker

## Status
Aceito (Tech Lead), 2026-10-24. **Substitui o [ADR-026](ADR-026-producao-do-alpha.md) na parte de produção** (Railway). O que o ADR-026 decidiu e **continua valendo**: travas automáticas contra login de teste (§5, aqui adaptadas), correção do `/api/auth/session` (§6), *smoke* pós-*deploy*, `pg_dump` criptografado fora do provedor e ensaio de *restore* (§7, adaptados), segredos só no provedor (§4). O ADR-024 (homologação só local) não muda.
Rastreabilidade: **D-GES-36 (a)** + refinamento do Gestor (dev em Docker, produção na Vercel) · ADR-030 §9 (hospedagem do MCP — resolvido por este ADR) · EN-007 (nova enabler técnica, ver §9).

## Contexto
O usuário informou que o app **já roda em produção** em `https://verbus-finance.vercel.app/` com **Prisma Postgres** (integração da Vercel). O repositório ainda assume Railway: `railway.json`, `Dockerfile` com `APP_DEPLOY_ENV=production` gravado na imagem, migração no `preDeployCommand`, *healthcheck* que barra *deploy*, `backup.yml` com `DATABASE_PUBLIC_URL`. O TL **não tem acesso** ao painel da Vercel nem ao banco; os riscos da §8 são inferidos do repositório e precisam ser conferidos pelo usuário/Dev.

Fatos verificados em 2026-10-24 (fontes no fim):
- **Vercel Functions (Fluid compute)**: duração padrão e máxima **300 s no Hobby** (Pro até 800 s); **região única padrão `iad1`** (alterável); corpo de requisição/resposta ≤ **4,5 MB**; 2 GB/1 vCPU no Hobby; Node completo. Atualizado 2026-08-24.
- **Vercel Cron**: todos os planos; **Hobby = no máximo 1×/dia e precisão de ±59 min**; sempre **UTC**; `GET` para a **URL de produção**; `CRON_SECRET` chega como `Authorization: Bearer …`; **sem *retry***, entrega "melhor esforço" e **pode duplicar** ⇒ tarefas idempotentes.
- **Prisma Postgres**: dois *hosts* com o mesmo usuário/senha — **`pooled.db.prisma.io`** (PgBouncer em modo transação; sem estado de sessão; consultas cortadas em 10 min) para a aplicação e **`db.prisma.io`** (direto) para **migrações, `pg_dump`/`pg_restore`, Studio**. Migrar pelo *pooler* causa erros de *lock*/sessão. `sslmode=require` obrigatório. Limites: **Free 10 pooled/10 diretas**; Starter 100/10; Pro 500/50; 5 diretas reservadas à plataforma. Com ORM 7: `prisma.config.ts` aponta para a URL **direta**; o *runtime* usa `@prisma/adapter-pg` com a URL **pooled**, cliente único por instância. A integração da Vercel grava `DATABASE_URL`/`POSTGRES_URL` (TCP direto) e `PRISMA_DATABASE_URL` (`prisma+postgres://`) — **conferir qual o projeto usa hoje**.
- **Backup do Prisma Postgres**: *snapshots* diários automáticos **só nos planos Starter, Pro e Business** (só em dias com atividade), retenção **7 dias** (Business 30); **PITR "em novembro de 2026"** (anunciado, não disponível); *restore* pelo Console (em banco novo ou no mesmo — para banco da integração Vercel, restaurar **no mesmo** para manter as variáveis). **No plano Free não há *snapshot* automático** (inferido: a página lista só Starter+).
- **Pool na Vercel**: `attachDatabasePool(pool)` do `@vercel/functions` fecha conexões ociosas antes de a instância suspender; recomenda-se `idleTimeoutMillis` curto (≈ 5 s).
- **Next 16**: `output: "standalone"` é para *self-hosting*; a Vercel usa o próprio *adapter* (mesma API pública, `docs/01-app/02-guides/deploying-to-platforms.md`) e ignora o *standalone* — pode ficar, para o Docker.
- Código atual: todos os *locks* são `pg_advisory_xact_lock` (de transação) e não há `SET`/`LISTEN` de sessão ⇒ **compatível com o *pooler* em modo transação** (verificado por `grep` em `src/`). `@prisma/adapter-pg` aceita `pg.Pool | PoolConfig | string`.

## Decisão

### 1. Dois ambientes, duas formas de rodar
| | **Desenvolvimento / teste / homologação local** | **Produção** |
| :-- | :-- | :-- |
| Onde | Máquina do Dev (Docker Compose) | Vercel (Fluid compute, Node) |
| Banco | `db` e `db-test` (Postgres 17 do `docker-compose.yml`) | Prisma Postgres (integração da Vercel) |
| E-mail | Mailpit | SMTP opcional (como hoje) |
| Login | Google + login de teste (ADR-008) e homologação (ADR-024) | **Só Google**; travas da §4 |
| Imagem | `Dockerfile` continua para quem quiser rodar a *build* de produção localmente (ensaio de *restore*, *smoke*) | Não usa Docker |
| *Previews* | — | Ver §6 |

### 2. Execução serverless
- Toda rota com banco: `runtime = "nodejs"` (padrão). **Nada de Edge** (o `pg` não roda lá).
- **Região das funções = região do banco** (`vercel.json` → `"regions": ["<região>"]` ou configuração do projeto). O Dev confere a região do Prisma Postgres no Console e fixa a mesma família de região (ex.: banco `us-east-1` ⇒ `iad1`). Função longe do banco multiplica a latência de cada consulta (o Extrato faz várias).
- `maxDuration`: padrão do projeto (300 s) basta; rotas do MCP/OAuth declaram `maxDuration = 30` (o Claude corta `/token` em 10 s e ferramentas em 240 s; nada nosso deve passar de 2 s).
- **Nenhum estado em memória** entre requisições (instâncias são descartáveis e múltiplas). Já atendido; a regra vale para código novo (ver §7).
- *Cold start*: medir na EN-007 (p95 da 1ª requisição após 15 min ociosa). Meta: `/api/oauth/token` < 3 s mesmo frio.

### 3. Banco: conexão, *pool* e migrações (Prisma 7)
- Variáveis: **`DATABASE_URL` = URL *pooled*** (`pooled.db.prisma.io`, `sslmode=require`) — usada pelo app; **`DIRECT_URL` = URL direta** (`db.prisma.io`) — usada pelo CLI do Prisma e pelo backup. Se a integração gravou só a direta em `DATABASE_URL`, o usuário cria as duas (o painel do Prisma mostra as duas *strings*).
- `prisma.config.ts`: `datasource.url = process.env.DIRECT_URL ?? process.env.DATABASE_URL` (dev local continua só com `DATABASE_URL`).
- `src/lib/db.ts`: criar `pg.Pool({ connectionString, max: env.DB_POOL_MAX ?? 3, idleTimeoutMillis: 5000 })`, chamar `attachDatabasePool(pool)` **quando `process.env.VERCEL` existir**, e passar o *pool* ao `PrismaPg`. Singleton em `globalThis` mantido. `max: 3` × poucas instâncias cabe no limite do Free (10).
- **Migração no *build* de produção**, nunca em *preview*: *script* `vercel-build` (a Vercel o usa no lugar de `build` quando existe) = `node scripts/vercel-build.mjs`, que roda `prisma migrate deploy` **somente se `VERCEL_ENV === "production"`** e depois `next build`. Migração falhou ⇒ *build* falha ⇒ a versão anterior continua no ar (equivalente ao `preDeployCommand`). Ressalva honesta: a migração é aplicada **antes** de a nova versão receber tráfego, mas a versão antiga continua servindo com o *schema* novo por alguns segundos/minutos ⇒ **migrações têm de ser compatíveis com a versão anterior** (expandir antes de contrair — regra que o ADR-021 já impõe às migrações sensíveis). Fica explícito para todas.
- Verificar **agora** (risco §8.2): `prisma migrate status` contra a URL direta, para saber se as 24 migrações do repositório estão aplicadas em produção.

### 4. Travas de produção (adapta o ADR-026 §5)
Sem imagem Docker, `APP_DEPLOY_ENV=production` deixa de estar "gravado". Nova regra em `isProdDeploy(env)`: **verdadeiro se `APP_DEPLOY_ENV === "production"` OU `VERCEL_ENV === "production"` OU `VERCEL_ENV === "preview"`** (`VERCEL_ENV` é variável de sistema da Vercel, não depende de alguém lembrar de configurar). *Preview* entra porque roda código não revisado numa URL pública. Efeitos inalterados: presença de `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` ou `APP_NOW_OVERRIDE` ⇒ `register()` lança (todas as requisições daquela instância falham: falha fechada), login/ferramentas de teste desligados, `/api/health` ⇒ `503 unsafe_config`. Testes: matriz de *env* com `VERCEL_ENV` (unidade) + *smoke*.
- O usuário também define `APP_DEPLOY_ENV=production` nas variáveis de Produção (cinto e suspensório).
- `assertLlmConfig` (`src/modules/ia/config.ts`) passa a usar o mesmo `isProdDeploy`.

### 5. *Healthcheck* e *smoke*
- A Vercel **não barra *deploy*** por *healthcheck*. `/api/health` continua (monitor externo opcional, ex.: UptimeRobot gratuito, e o *smoke*).
- *Smoke* pós-*deploy*: `scripts/smoke-prod.sh https://verbus-finance.vercel.app` (comentário do *script* atualizado) — rodado manualmente após cada *deploy* de produção **ou** por *workflow* do GitHub disparado por `deployment_status` (opcional, EN-007). Com o MCP: acrescentar `pnpm mcp:smoke`.
- *Instant Rollback* da Vercel é o caminho de reversão de código; **não reverte migração** (por isso a regra de compatibilidade da §3).

### 6. *Previews* (risco principal da Vercel)
- **`DATABASE_URL`/`DIRECT_URL` só no escopo *Production***. *Preview* não pode enxergar o banco de produção. Opções (decisão do usuário, TL-44): (a) **desligar *previews*** de *branch* (mais simples; recomendado no alpha); (b) banco separado de *preview* (outro Prisma Postgres Free) com dados fictícios.
- *Deployment Protection* (Vercel Authentication) ligada para *previews* (padrão "Standard Protection").
- `AUTH_GOOGLE_*`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `MCP_*`: só *Production*.

### 7. Limite de taxa sem memória compartilhada
- Regra: **todo limite de taxa vive no Postgres** (`mcp_rate_buckets`, janela fixa com `INSERT … ON CONFLICT … RETURNING`, SDD-024 §6). Nada de `Map` em memória, nada de Redis/KV (fornecedor a mais, sem necessidade para 2–4 usuários). Hoje o app não tem limite em memória (verificado).
- Opcional e gratuito: regras do *Firewall* da Vercel contra *flood* grosseiro. **Não** ligar *Attack Challenge Mode*/*bot protection* em `/api/mcp`, `/api/oauth/*` e `/.well-known/*`: Claude e ChatGPT chamam servidor-a-servidor e não resolvem desafio.

### 8. *Jobs*: expurgos e backup
| Tarefa | Hoje | Produção na Vercel |
| :-- | :-- | :-- |
| `ai:purge-usage`, `ai:purge-analyses` (24 meses) | *Script* manual | **Vercel Cron diário** → `GET /api/cron/purge` (uma rota, várias tarefas). Hobby permite 1×/dia — suficiente |
| `mcp:purge` (auditoria > 12 meses, *tokens*, pedidos, DCR, *buckets*) | — (SDD-024) | Mesma rota `/api/cron/purge` |
| Backup | `backup.yml` semanal com `DATABASE_PUBLIC_URL` | **Mantido no GitHub Actions** (a função da Vercel não tem `pg_dump` e o arquivo precisa sair do provedor): segredo renomeado para **`DATABASE_DIRECT_URL`** (`db.prisma.io`), cliente `postgresql-client-17` (bate com a versão do Prisma Postgres), cadência **diária** se o plano do Prisma for Free (sem *snapshot*) ou semanal se Starter+ |
Rota de *cron*: `runtime = "nodejs"`, `maxDuration = 60`; exige `Authorization === "Bearer " + CRON_SECRET` (comparação em tempo constante; `CRON_SECRET` ausente ⇒ `401` sempre); cada tarefa é um `DELETE … WHERE createdAt < corte` (idempotente; duplicata inofensiva); *lock* `pg_advisory_xact_lock('cron:purge')`; grava 1 linha de *log* por tarefa (só contagens). Os *scripts* `pnpm ai:purge-*` continuam existindo (mesma função de domínio, para uso manual/dev). `vercel.json`: `{"crons":[{"path":"/api/cron/purge","schedule":"0 7 * * *"}]}` (07:00 UTC = 04:00 BRT).

### 9. Variáveis de ambiente (escopo *Production*)
| Grupo | Variáveis | Observação |
| :-- | :-- | :-- |
| Banco | `DATABASE_URL` (*pooled*), `DIRECT_URL` (direta), `DB_POOL_MAX` (opcional, padrão 3) | §3 |
| Ambiente | `APP_DEPLOY_ENV=production`, `APP_URL=https://verbus-finance.vercel.app`, `APP_TIMEZONE=America/Sao_Paulo` | `VERCEL_ENV` é do sistema |
| Auth | `AUTH_SECRET`, `AUTH_URL` (= `APP_URL`), `AUTH_TRUST_HOST=true`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | *Redirect URI* no Google = `https://verbus-finance.vercel.app/api/auth/callback/google` |
| LLM (SDD-021) | `AI_FEATURES_ENABLED`, `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL_ANALYSIS`, `LLM_PRICES_JSON`, teto | Como no SDD-021 |
| MCP (SDD-024) | `MCP_ENABLED` (padrão `false`), `MCP_CIMD_ALLOWED_HOSTS` (POC: `claude.ai`) | §10 |
| *Cron* | `CRON_SECRET` (≥ 32 caracteres aleatórios) | §8 |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Opcional |
| **Nunca** | `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` | §4 |

### 10. Domínio e URL pública
- URL canônica = **`https://verbus-finance.vercel.app`** (TLS da Vercel). Domínio próprio é opcional, **mas deve ser decidido antes de ligar o MCP** (TL-45): o `resource` OAuth (`${APP_URL}/api/mcp`) fica gravado em cada conexão; trocar o domínio depois **invalida todas as conexões** (o membro reconecta) e exige atualizar o Google OAuth.
- URLs de *deploy* (`*-<hash>.vercel.app`) não são canônicas: o AS e o `Origin` aceitam só `APP_URL`.

### 11. O que manter, adaptar ou remover (tarefas do Dev — **EN-007**, nada alterado por este ADR)
| Arquivo | Ação | Motivo |
| :-- | :-- | :-- |
| `docker-compose.yml` (`db`, `db-test`, `mailpit`) | **Manter** | Ambiente de dev/teste (decisão do Gestor) |
| `Dockerfile` | **Manter** (comentário: "ensaio local da build de produção; produção = Vercel, ADR-031") | Portabilidade e ensaio de *restore*/*smoke*; plano B de saída da Vercel |
| `railway.json` | **Remover** | Não há Railway |
| `next.config.ts` `output: "standalone"` | Manter (comentário cita ADR-031) | Usado só pelo Docker |
| `prisma.config.ts` | Adaptar (`DIRECT_URL ?? DATABASE_URL`) | §3 |
| `src/lib/db.ts` | Adaptar (*pool* explícito + `attachDatabasePool`) | §3; nova dependência `@vercel/functions` |
| `src/lib/auth/dev-login-guard.ts` `isProdDeploy` + `src/modules/ia/config.ts` | Adaptar (`VERCEL_ENV`) + testes de matriz | §4 |
| `package.json` | `vercel-build` + `scripts/vercel-build.mjs` | §3 |
| `vercel.json` (novo) | `regions`, `crons` | §2, §8 |
| `src/app/api/cron/purge/route.ts` (novo) | Rota de expurgo | §8 |
| `.github/workflows/backup.yml` + `scripts/backup.sh` | Adaptar segredo `DATABASE_DIRECT_URL` e cadência | §8 |
| `scripts/smoke-prod.sh` | Atualizar comentário/URL de exemplo | §5 |
| `agents/tech-lead/architecture/producao.md` | Reescrito pelo TL neste ciclo | — |
| README/ambiente-local | Citar ADR-031 para produção | — |
| *Proxy* (`proxy.ts`) | Excluir `api/cron/` e `\.well-known/` do *matcher* | §8 e SDD-024 §1 |
**Estimativa EN-007: 5 pts** (travas + testes 1; *pool* + config Prisma + `vercel-build` 1,5; *cron* + rota + testes 1; backup + *smoke* + limpeza 1; verificação em produção com o usuário 0,5). Executor: Sonnet (Opus revisa §3/§4).

### 12. Riscos e lacunas do estado atual de produção (inferidos do repositório — **conferir**)
| # | Risco | Severidade | Ação |
| :-: | :-- | :-: | :-- |
| 1 | **`APP_DEPLOY_ENV` provavelmente ausente na Vercel** (só existia no `Dockerfile`) ⇒ as três travas do ADR-026 §5 **estão desligadas**; sobra só a barreira `NODE_ENV=production` + `AUTH_DEV_LOGIN` sem `APP_HOMOLOG_MODE`. Se alguém definir `APP_HOMOLOG_MODE=true` + `AUTH_DEV_LOGIN=true`, o login de teste **liga em produção** | **Alta** | Usuário: definir `APP_DEPLOY_ENV=production` já; Dev: §4 |
| 2 | **Migrações**: não há `migrate deploy` no *build*; não se sabe como o *schema* de produção foi criado (`db push`? migração manual?) ⇒ risco de *drift* e de a próxima migração falhar | **Alta** | `prisma migrate status` pela URL direta; se houve `db push`, *baseline* (`migrate resolve --applied`) com o Dev antes da EN-006 |
| 3 | **Backup**: se o Prisma Postgres for **Free**, não há *snapshot*; o `backup.yml` aponta para `DATABASE_PUBLIC_URL` (Railway) e provavelmente **não roda** com sucesso ⇒ **pode não existir nenhum backup** de dados reais | **Alta** | Usuário confere o plano e os segredos do GitHub; Dev ajusta (§8) e faz **ensaio de *restore*** |
| 4 | `DATABASE_URL` da integração pode ser a **direta** ⇒ app consome conexões diretas (10 no Free, 5 reservadas) e o *pool* padrão do `pg` é 10 por instância ⇒ "too many connections" sob picos | Média | §3 |
| 5 | *Previews* com acesso ao banco de produção e a segredos (se as variáveis estiverem em "All Environments") | Média–alta | §6 |
| 6 | Região da função (`iad1`) ≠ região do banco ⇒ latência | Média | §2 |
| 7 | Expurgos de IA (24 meses) não rodam (eram manuais) | Baixa (dados recentes) | §8 |
| 8 | Correção do `sessionToken` no `/api/auth/session` (ADR-026 §6) — conferir no *smoke* em produção | Média | *smoke* |
| 9 | *Logs* da Vercel no Hobby têm retenção curta (não verificado o prazo exato) ⇒ investigação de incidente limitada; a auditoria do MCP fica no banco (12 meses), não depende disso | Baixa | Aceito |

## O que só o usuário faz
1. Vercel ▸ *Settings* ▸ *Environment Variables*: criar `APP_DEPLOY_ENV=production` (Production) **hoje**; conferir que `DATABASE_URL` e segredos estão só em *Production*; decidir *previews* (TL-44).
2. Prisma Console: anotar **plano** e **região**; copiar as URLs *pooled* e direta; se Free, avaliar Starter (*snapshots* de 7 dias) ou aceitar backup só pelo GitHub (diário).
3. GitHub ▸ *Secrets*: `DATABASE_DIRECT_URL` e `BACKUP_PASSPHRASE`.
4. Vercel: criar `CRON_SECRET`.
5. Decidir domínio definitivo antes do MCP (TL-45).

## Consequências
- (+) Produção sem servidor para manter, TLS e domínio prontos, *rollback* de código em um clique, custo zero de hospedagem no Hobby (uso pessoal) + Prisma Postgres conforme plano.
- (+) Dev inalterado (Docker), sem retrabalho nos testes.
- (−) Sem *healthcheck* que barre *deploy*; migração precisa ser compatível com a versão anterior.
- (−) *Cron* do Hobby impreciso e 1×/dia; *pool* e região exigem cuidado.
- (−) Dois provedores (Vercel + Prisma) e backup fora deles (GitHub).

## Fontes (consultadas em 2026-10-24)
- Vercel — limites de funções (atualizado 2026-08-24): https://vercel.com/docs/functions/limitations
- Vercel — Cron: https://vercel.com/docs/cron-jobs · uso e limites (Hobby 1×/dia, ±59 min): https://vercel.com/docs/cron-jobs/usage-and-pricing · `CRON_SECRET`, idempotência, sem *retry*: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Vercel — *pool* com Fluid (`attachDatabasePool`): https://vercel.com/guides/connection-pooling-with-functions
- Prisma Postgres — *pooled* × direta, limites: https://www.prisma.io/docs/postgres/database/connection-pooling · conexão com ORM 7 e `DIRECT_URL`: https://www.prisma.io/docs/postgres/database/connecting-to-your-database · backups/PITR: https://www.prisma.io/docs/postgres/database/backups · integração Vercel (variáveis): https://prisma.io/docs/postgres/integrations/vercel
- Next 16 local: `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md`, `self-hosting.md`
