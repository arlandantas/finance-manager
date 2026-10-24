# Checklist de produção: Vercel, Prisma Postgres e GitHub

*Para o dono do produto executar no painel. Extraído de [ADR-031](../tech-lead/adrs/ADR-031-producao-vercel-prisma-postgres.md), [producao.md](../tech-lead/architecture/producao.md) e [respostas-r4d-v2.md](../tech-lead/respostas-r4d-v2.md).*

**Domínio fixo:** `https://verbus-finance.vercel.app` (não mudar).
**Banco:** Prisma Postgres, plano Free, usado só pelo dono.

**Regras gerais**
- Nenhum valor de segredo vai para este documento, para chat, para o repositório ou para `.env` versionado. Copie direto do painel para o campo da Vercel ou do GitHub.
- Onde o documento não traz o dado, está escrito "confirmar no ADR-031".
- Itens marcados como **(depende da EN-007)** exigem código que ainda não existe no repositório. Ainda não execute esses itens; eles entram quando a EN-007 for entregue.
- Ordem: primeiro os riscos, depois a configuração, depois o que depende do código.

---

## Bloco 1: Riscos imediatos (fazer hoje, sem código)

Estes itens fecham os riscos 1 a 3 do ADR-031 §12 e são o "item 0" da ordem de execução (respostas-r4d-v2 §2).

- [ ] **1.1 Definir `APP_DEPLOY_ENV=production`** na Vercel, escopo **Production**. Sem isso, as travas contra login de teste ficam desligadas (ADR-031 §12, risco 1, severidade alta).
  - *Verificar:* na lista de variáveis do projeto, a variável existe e o escopo mostra só Production.
- [ ] **1.2 Confirmar que não existem** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` e `APP_NOW_OVERRIDE` em nenhum escopo. Se alguma existir, remova-a. Essas três nunca podem estar em produção (ADR-031 §9).
  - *Verificar:* `curl -i https://verbus-finance.vercel.app/api/health` não retorna `503` com `unsafe_config`. A tela de login oferece só Google (ADR-031 §1).
- [ ] **1.3 Confirmar o escopo das variáveis sensíveis.** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `ANTHROPIC_API_KEY` e demais segredos devem estar **só em Production**, não em "All Environments" nem em Preview (ADR-031 §6 e §12, risco 5).
  - *Verificar:* em cada variável, o escopo mostra apenas Production.
- [ ] **1.4 Anotar no Console do Prisma o plano e a região** do banco (ADR-031 §12; respostas-r4d-v2 TL-49). Guarde a informação fora do repositório.
  - *Por que importa:* se o plano for Free, não há snapshot automático (ver Bloco 6).
- [ ] **1.5 Confirmar se `DATABASE_URL` aponta para a URL pooled ou para a direta.** Se a integração gravou a direta, o app usa conexões diretas e o limite do Free (10 diretas) pode estourar sob pico (ADR-031 §12, risco 4). Ver o mapeamento na seção 2.
- [ ] **1.6 Confirmar se o schema de produção está em dia.** Rode `prisma migrate status` com a URL **direta** (ADR-031 §3, risco 2).
  - *Comando (com a URL direta no ambiente, nunca a pooled):* `DIRECT_URL="<url direta>" pnpm prisma migrate status`
  - *Se retornar drift ou "database schema is not in sync":* não aplique nada. Avise o Gestor e o Dev. A correção (baseline com `migrate resolve --applied`, se o schema foi criado por `db push`) é feita com o Dev antes da EN-007 (ADR-031 §12, risco 2).
  - *Resultado esperado:* todas as migrações do repositório aparecem como aplicadas. Se não aparecerem, confirmar no ADR-031 o que fazer.
- [ ] **1.7 Confirmar se existe backup real de dados de produção.** No plano Free não há snapshot automático. O `backup.yml` atual ainda aponta para `DATABASE_PUBLIC_URL` (Railway) e provavelmente não roda com sucesso. **Pode não existir nenhum backup** (ADR-031 §12, risco 3; TL-46).
  - *Ação até a EN-007:* confirmar no ADR-031 se há outra forma de backup disponível antes de qualquer mudança de dados. Não há procedimento manual definido nos documentos; confirmar no ADR-031 e em `scripts/backup.sh`.
- [ ] **1.8 Decidir os previews (TL-44).** Recomendação do TL: **desligar** os previews de branch no alpha. A alternativa é um banco de preview separado com dados fictícios (ADR-031 §6).
  - *Onde:* a opção fica nas configurações do projeto na Vercel; confirmar o caminho no painel.
  - *Verificar:* nenhum deploy de branch é criado após um push de teste em branch que não seja `main` (ou não há preview, se desligado).
- [ ] **1.9 Ativar Deployment Protection** (Vercel Authentication, "Standard Protection") para previews (ADR-031 §6).
  - *Verificar:* a URL de um preview pede autenticação da Vercel antes de abrir.

---

## Bloco 2: Banco, URLs e mapeamento de variáveis

A integração Prisma da Vercel cria variáveis com nomes padrão. O ADR-031 §3 define o que o app precisa. Use esta tabela para mapear.

| Variável que a integração cria | Formato esperado | O que fazer |
| :-- | :-- | :-- |
| `DATABASE_URL` | Pode ser a **direta** (`db.prisma.io`) ou a **pooled** (`pooled.db.prisma.io`) | Se for a direta, **substitua** pelo valor **pooled** (ver linha seguinte) |
| `POSTGRES_URL` | TCP direto (ADR-031 §3) | Não é a variável que o app usa segundo o ADR. Não remova sem confirmar no ADR-031 |
| `PRISMA_DATABASE_URL` | `prisma+postgres://` | **Não usar** como `DATABASE_URL`. O adapter `pg` precisa de uma string `postgresql://` (ADR-031 §3). Confirmar no ADR-031 antes de remover |

**Valores que o usuário deve colocar (Production):**
- [ ] **`DATABASE_URL`** = URL **pooled** do Prisma Console (host `pooled.db.prisma.io`, com `sslmode=require`). Usada pelo app. Segredo.
- [ ] **`DIRECT_URL`** = URL **direta** do Prisma Console (host `db.prisma.io`, com `sslmode=require`). Usada pelo CLI do Prisma (migrações) e pelo backup. Segredo. **Criar se não existir.**
  - Mesmo usuário e senha nos dois hosts. Copie as duas strings do painel do Prisma (ADR-031 §3).
  - *Por que importa:* sem `DIRECT_URL`, o `prisma.config.ts` (depois da EN-007) cai no `DATABASE_URL` pooled, e migrações pelo pooler causam erros de *lock* e de sessão (ADR-031 §3).
- [ ] **`DB_POOL_MAX`** = `3` (opcional; é o padrão). Não criar acima de 3 sem confirmar no ADR-031.

**Verificações:**
- [ ] `DATABASE_URL` tem `pooled.db.prisma.io`.
- [ ] `DIRECT_URL` tem `db.prisma.io` (sem `pooled`).
- [ ] Ambas terminam com `sslmode=require`.
- [ ] Nenhuma das duas aparece em log, em commit ou no repositório.

---

## Bloco 3: Variáveis de ambiente (escopo Production)

Todas as variáveis abaixo são só de **Production** (ADR-031 §6 e §9). Marque **S** para segredo.

| Variável | Segredo | Valor / observação |
| :-- | :-: | :-- |
| `DATABASE_URL` | **S** | URL pooled (Bloco 2) |
| `DIRECT_URL` | **S** | URL direta (Bloco 2) |
| `DB_POOL_MAX` | | Opcional, padrão 3 |
| `APP_DEPLOY_ENV` | | `production` (Bloco 1.1) |
| `APP_URL` | | `https://verbus-finance.vercel.app` |
| `AUTH_URL` | | `https://verbus-finance.vercel.app` |
| `AUTH_TRUST_HOST` | | `true` |
| `AUTH_SECRET` | **S** | Gerar um valor novo e guardar fora do repositório. Confirmar no ADR-031 se o valor atual deve ser mantido |
| `AUTH_GOOGLE_ID` | | Client ID do Google OAuth |
| `AUTH_GOOGLE_SECRET` | **S** | Client secret do Google OAuth |
| `APP_TIMEZONE` | | `America/Sao_Paulo` |
| `CRON_SECRET` | **S** | **(depende da EN-007)** Mínimo 32 caracteres aleatórios. Criar só quando o cron existir (Bloco 5) |
| `AI_FEATURES_ENABLED` | | Variável de LLM (SDD-021). Confirmar o valor no SDD-021 |
| `LLM_PROVIDER` | | Confirmar no SDD-021 |
| `ANTHROPIC_API_KEY` | **S** | Confirmar no SDD-021. Chave de produção, não de teste |
| `LLM_MODEL_ANALYSIS` | | Confirmar no SDD-021 |
| `LLM_PRICES_JSON` | | Confirmar no SDD-021 |
| (teto de custo) | | Nome e valor exatos: confirmar no SDD-021 (ADR-028) |
| `MCP_ENABLED` | | Padrão `false`. **Deixar `false`** até os pré-requisitos do Bloco 7 |
| `MCP_CIMD_ALLOWED_HOSTS` | | POC: `claude.ai`. Confirmar no SDD-024 |
| `SMTP_HOST` | | Opcional |
| `SMTP_PORT` | | Opcional |
| `MAIL_FROM` | | Opcional |
| Senha SMTP (se houver) | **S** | Confirmar no ADR-031 se existe e qual o nome |

**Nunca definir em produção:** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` (ADR-031 §9).

**Verificações:**
- [ ] Todas as variáveis acima têm escopo Production.
- [ ] Nenhuma variável de preview tem os segredos (Bloco 1.3).
- [ ] Nenhuma das três "nunca" está definida.
- [ ] O redirect URI no Google Cloud Console é `https://verbus-finance.vercel.app/api/auth/callback/google` (ADR-031 §9).

---

## Bloco 4: Domínio e URL pública

- [ ] **4.1 Confirmar** que o domínio canônico é `https://verbus-finance.vercel.app` (TLS da Vercel, ADR-031 §10).
- [ ] **4.2 Decidir o domínio definitivo (TL-45) antes de ligar o MCP.** O `resource` OAuth fica gravado em cada conexão. Trocar de domínio depois invalida todas as conexões e exige atualizar o Google OAuth (ADR-031 §10; respostas-r4d-v2 TL-45). A recomendação do TL é ficar com `verbus-finance.vercel.app` se não houver plano de domínio próprio.
- [ ] **4.3 Não usar URLs `*-<hash>.vercel.app`** como base de login ou OAuth. O AS e o `Origin` aceitam só `APP_URL` (ADR-031 §10).

---

## Bloco 5: Build, migrações e cron (depende da EN-007)

Esta seção só vale depois que a EN-007 estiver pronta. Até lá, não altere o *build* de produção.

- [ ] **5.1 Confirmar que o `vercel-build` existe** no `package.json` (`node scripts/vercel-build.mjs`). O script roda `prisma migrate deploy` **somente se** `VERCEL_ENV === "production"` e depois `next build` (ADR-031 §3).
  - *Verificar:* um deploy de produção mostra a etapa de migração no log de build. Um preview não mostra.
- [ ] **5.2 Regra de migração.** Toda migração precisa ser compatível com a versão anterior (expandir antes de contrair). Quando uma migração falha, o build falha e a versão anterior continua no ar (ADR-031 §3 e §12).
  - *Verificar antes de aprovar uma migração:* o Dev confirma que ela não remove coluna em uso pela versão anterior.
- [ ] **5.3 Confirmar `vercel.json`** com `"regions"` igual à região do banco (ADR-031 §2). Ex.: banco `us-east-1` ⇒ `iad1`. Confirmar a região no Console do Prisma (Bloco 1.4).
  - *Verificar:* o campo de região da função, na Vercel, bate com a região do banco.
- [ ] **5.4 Confirmar o cron:** `vercel.json` com `{"crons":[{"path":"/api/cron/purge","schedule":"0 7 * * *"}]}` (07:00 UTC = 04:00 BRT). No Hobby, o cron roda no máximo 1 vez por dia, com até ±59 min de atraso (ADR-031 §8).
  - *Verificar sem esperar o cron:* `curl -i https://verbus-finance.vercel.app/api/cron/purge` (sem cabeçalho) deve retornar `401`. Com `Authorization: Bearer <CRON_SECRET>`, deve executar. Não cole o segredo em chat; use uma variável de shell local.
- [ ] **5.5 Confirmar que o proxy não bloqueia o cron.** O `proxy.ts` deve excluir `api/cron/` e `\.well-known/` do *matcher* (ADR-031 §11).

---

## Bloco 6: Backup e restore

Até a EN-007, não há backup confirmado. Este bloco é o item de maior risco de perda de dados.

**GitHub (Settings > Secrets, do repositório):**
- [ ] **6.1 Criar `DATABASE_DIRECT_URL`** = URL **direta** do Prisma (segredo). Usada pelo `backup.yml` (ADR-031 §8; ADR-031 §12, risco 3).
- [ ] **6.2 Criar `BACKUP_PASSPHRASE`** (segredo) para o gpg AES256 (ADR-031 §12, item 3; producao.md §Backup). Guardar a senha fora do GitHub também; sem ela o backup não abre.
- [ ] **6.3 Remover `DATABASE_PUBLIC_URL`** (Railway) do repositório depois que o `backup.yml` novo estiver no ar (ADR-031 §8). Não remover antes disso, para não perder o último caminho de backup.

**Cadência e plano:**
- [ ] **6.4 Decidir o plano do Prisma (TL-46).** No Free não há snapshot automático. Recomendação do TL: pelo menos backup **diário** criptografado no GitHub. Starter dá snapshots de 7 dias, se o custo for aceitável (ADR-031 §12; respostas-r4d-v2 TL-46).
- [ ] **6.5 Confirmar a cadência do `backup.yml`:** diária se Free, semanal se Starter ou superior (ADR-031 §8). Retenção do artefato: 35 dias (producao.md §Backup).

**Ensaio de restore (obrigatório antes de `MCP_ENABLED=true`):**
- [ ] **6.6 Baixar o último artefato** do GitHub Actions (Actions > execução > Artifacts) e descompactar.
- [ ] **6.7 Descriptografar:** `gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d finance-backup.dump.gpg > finance.dump`
- [ ] **6.8 Restaurar em banco local** (Postgres do docker compose ou `docker run -e POSTGRES_PASSWORD=x -p 5499:5432 postgres:17`): `pg_restore --clean --if-exists --no-owner -d "postgresql://postgres:x@localhost:5499/postgres" finance.dump`
- [ ] **6.9 Conferir o restore:** as contas e os lançamentos recentes aparecem. Registrar a data do ensaio no ADR ou no status do Dev.
- [ ] **6.10 Restore real (só em caso de incidente):** preferir o restore do Console do Prisma "no mesmo banco", que mantém as variáveis da Vercel. Pelo dump, colocar o app em manutenção e usar `-d "$DIRECT_URL"` (producao.md §Restore).

---

## Bloco 7: Pré-requisitos para ligar o MCP

Não ligue `MCP_ENABLED=true` antes destes itens (respostas-r4d-v2 §2, regra de liberação).

- [ ] **7.1 EN-007 entregue** (Blocos 5 e 6 aplicados).
- [ ] **7.2 Ensaio de restore feito** (item 6.9). O lançamento direto grava dados reais.
- [ ] **7.3 Checklist SDD-024 §9 concluído**, incluindo `/security-review` (respostas-r4d-v2 §2).
- [ ] **7.4 Domínio decidido** (item 4.2, TL-45).
- [ ] **7.5 Decidir as opções do MCP:** token pessoal (TL-42) e limites de lançamento (TL-47). Confirmar no respostas-r4d-v2 §3.

---

## Bloco 8: Verificação pós-deploy (sempre)

Rodar após cada deploy de produção.

- [ ] **8.1 `/api/health`** responde sem `503 unsafe_config`: `curl -i https://verbus-finance.vercel.app/api/health` (ADR-031 §4 e §5). O status esperado de sucesso deve ser confirmado no ADR-031 ou no código da rota.
- [ ] **8.2 Smoke:** `scripts/smoke-prod.sh https://verbus-finance.vercel.app`. Termina sem erro (ADR-031 §5). Confirmar a saída esperada no próprio script.
- [ ] **8.3 Smoke do MCP** (só depois de `MCP_ENABLED=true`): `pnpm mcp:smoke` (ADR-031 §5).
- [ ] **8.4 Correção de `/api/auth/session`** (ADR-026 §6, risco 8 do ADR-031 §12): conferir no smoke que a sessão não expõe o `sessionToken`.
- [ ] **8.5 Login de teste desligado:** a tela de login oferece só Google (ADR-031 §1).
- [ ] **8.6 Rollback se algo falhar:** Vercel > Deployments > *Instant Rollback* para a versão anterior. Isso reverte o código, **não** a migração (ADR-031 §5). Por isso a regra de compatibilidade do item 5.2.
- [ ] **8.7 Monitor externo (opcional):** UptimeRobot (plano gratuito) apontando para `/api/health` (ADR-031 §5).

---

## Riscos conhecidos (resumo do ADR-031 §12)

| # | Risco | Severidade | Bloco deste checklist |
| :-: | :-- | :-: | :-- |
| 1 | `APP_DEPLOY_ENV` provavelmente ausente; travas contra login de teste desligadas. Com `APP_HOMOLOG_MODE=true` + `AUTH_DEV_LOGIN=true`, o login de teste liga em produção | Alta | 1.1, 1.2 |
| 2 | Migrações: não há `migrate deploy` no build; não se sabe como o schema foi criado | Alta | 1.6, 5.1 |
| 3 | Backup: no Free não há snapshot; `backup.yml` aponta para Railway; pode não existir backup | Alta | 1.7, 6 |
| 4 | `DATABASE_URL` pode ser a direta; conexões esgotam sob pico | Média | 1.5, Bloco 2 |
| 5 | Previews com acesso ao banco e segredos de produção | Média–alta | 1.3, 1.8, 1.9 |
| 6 | Região da função diferente da região do banco | Média | 5.3 |
| 7 | Expurgos de IA (24 meses) não rodam | Baixa | 5.4 |
| 8 | Correção do `sessionToken` no `/api/auth/session` | Média | 8.4 |
| 9 | Retenção curta dos logs da Vercel no Hobby (prazo não verificado) | Baixa | Aceito; auditoria do MCP fica no banco |

**Riscos residuais aceitos (respostas-r4d-v2 §5):** injeção ou erro da LLM gravando dados (ADR-030 §6-R2); "sem limite" escolhido pelo membro (com aviso e auditoria `LIMITS_CHANGED`).

---

## Ordem resumida

1. Hoje: Bloco 1 (riscos) e Bloco 2 (mapeamento de variáveis).
2. Bloco 3 conferido.
3. Decisões: 1.8 (previews), 6.4 (plano do Prisma), 4.2 (domínio).
4. Quando o Dev entregar a EN-007: Blocos 5 e 6 (backup e restore), depois Bloco 7.
5. A cada deploy: Bloco 8.
