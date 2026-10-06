# Go-live do alpha (roteiro do usuário, ADR-026)

Tempo estimado: 1 hora. O código já está pronto; falta só você criar as contas e colar as chaves.

## 1. Railway (hospedagem + banco)
1. Entre em railway.com com sua conta do GitHub e assine o plano Hobby (cerca de US$ 5/mês).
2. **New Project > Deploy PostgreSQL**. Abra o Postgres criado > **Backups** e ative.
3. No mesmo projeto: **New > GitHub Repo** e escolha este repositório (o Railway lê o `Dockerfile` e o `railway.json` sozinho). Ainda não precisa dar certo: faltam as variáveis.
4. No serviço web > **Settings > Networking > Generate Domain**. Anote a URL (ex.: `https://finance-xxxx.up.railway.app`).

## 2. Variáveis do serviço web (aba Variables)
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referência ao banco)
- `AUTH_SECRET` = resultado de `openssl rand -base64 32` (no Git Bash) ou qualquer texto aleatório longo
- `AUTH_URL` e `APP_URL` = a URL do passo 1.4
- `AUTH_TRUST_HOST` = `true`
- `APP_TIMEZONE` = `America/Sao_Paulo`
- `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` = do passo 3
- **Não crie** `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` nem `APP_NOW_OVERRIDE` (o app se recusa a subir se existirem).

## 3. Login com Google (console.cloud.google.com)
1. Crie um projeto. **APIs e serviços > Tela de consentimento OAuth**: tipo **Externo**, deixe em **Testing**.
2. Em **Usuários de teste**, adicione os e-mails Google de cada pessoa da família (só eles conseguirão entrar).
3. **Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web**:
   - Origem JavaScript autorizada: `https://<sua-url>`
   - URI de redirecionamento: `https://<sua-url>/api/auth/callback/google`
4. Copie o ID e o segredo para as variáveis do passo 2 (o Railway refaz o deploy sozinho).

## 4. Primeiro deploy e conferência
1. Espere o deploy ficar verde (a migração do banco roda antes de subir).
2. Peça ao Dev para rodar: `scripts/smoke-prod.sh https://<sua-url>` (precisa dar "SMOKE OK").
3. Faça o primeiro login com Google. O primeiro acesso cria sua conta.

## 5. Backup extra semanal (GitHub)
1. No Railway, Postgres > **Connect** > copie a **Public URL** (postgresql://...proxy.rlwy.net...).
2. No GitHub do repositório > **Settings > Secrets and variables > Actions > New repository secret**:
   - `DATABASE_PUBLIC_URL` = a URL pública acima
   - `BACKUP_PASSPHRASE` = uma senha longa que você guarda fora do repositório (gerenciador de senhas)
3. Aba **Actions > backup-postgres > Run workflow** para testar uma vez.
4. **Ensaie o restore** no seu computador antes de usar de verdade: roteiro em `agents/tech-lead/architecture/producao.md`.

## Depois
- E-mail de convite (opcional): ainda não há SMTP com senha; convide pelo link.
- Quando quiser domínio próprio: Railway > Settings > Networking > Custom Domain, e atualize `AUTH_URL`, `APP_URL` e o redirect do Google.
