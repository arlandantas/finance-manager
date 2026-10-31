# Pendências externas: o que só você pode fazer

*Atualizado: 2026-10-31. Fontes: checklist de produção, decisões, `.env.example`, `vercel.json`. "Confirmar" = não verificado nos docs.*

## A. Já resolvido ou sem ação agora

| ID | Situação |
| :-- | :-- |
| Local | Feito: `localhost:3100`, Postgres 5442/5443, Mailpit 1025 (UI 8025), login de teste. Acesso pela LAN automático. |
| EXT-05 | Feito na máquina local. Repetir só em máquina nova. |
| EXT-09 | Sem ação agora. Acompanhar a versão estável do Auth.js. |
| EXT-10, EXT-11 | Arquivados (opcional). Túnel só para testar de fora (D-GES-20). |
| EXT-03 (parcial) | Hospedagem decidida: Vercel + Prisma Postgres Free (ADR-031). Domínio `verbus-finance.vercel.app` mantido. Código pronto (EN-007). **Falta o painel** (B2). |
| IA | Feito: `LLM_PROVIDER=fake` por padrão; nenhuma chamada real. |

## B. Pendências do usuário, na ordem

### B1. Necessário para uso local

**1. EXT-01: login Google no localhost** (opcional; o login de teste já funciona).
- Serve para entrar com o Google em dev. Bloqueia só esse login. Último registro (2026-10-26): `redirect_uri_mismatch`. Confirmar se ainda ocorre.
- Variáveis: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (já preenchidas), `AUTH_URL`.
- Passos:
  1. Google Cloud Console > Credenciais > seu cliente "Aplicativo da Web".
  2. Em "URIs de redirecionamento autorizados", adicione `http://localhost:3100/api/auth/callback/google`.
  3. Salve, aguarde alguns minutos e teste em `http://localhost:3100/login`.
  4. Se o consentimento estiver em "Teste", adicione seu e-mail em "Usuários de teste".

### B2. Necessário só para produção ou alpha (nesta ordem)

**2. EXT-06: repositório e push.** Há 232 commits locais não enviados ao GitHub. Bloqueia o backup por GitHub Actions e o CI (inexistente). Decida o `git push` (só você autoriza) e habilite o Actions.

**3. EXT-03: variáveis de banco e de risco (Vercel, escopo Production).** Checklist Blocos 1 e 2.
- `APP_DEPLOY_ENV=production`. Sem ela, as travas contra login de teste ficam desligadas.
- Confirme que `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE` e `APP_NOW_OVERRIDE` não existem em nenhum escopo.
- `DATABASE_URL` = URL **pooled** (`pooled.db.prisma.io`); `DIRECT_URL` = URL **direta** (`db.prisma.io`); ambas com `sslmode=require`; segredos só em Production.
- Rode `DIRECT_URL="<direta>" pnpm prisma migrate status`. Se houver drift, não aplique nada; avise o Gestor.
- Confirmar com o Dev a região da função: `vercel.json` não tem `regions`.

**4. Backup (EXT-03).**
- GitHub > Settings > Secrets: crie `DATABASE_DIRECT_URL` (URL direta) e `BACKUP_PASSPHRASE`. Guarde a senha também fora do GitHub.
- Decida o plano do Prisma: Free exige backup diário pelo GitHub (recomendação do TL); Starter traz snapshots de 7 dias.
- `backup.yml` ainda cita Railway: confirmar se foi atualizado. Depois, remova `DATABASE_PUBLIC_URL`.

**5. Previews (EXT-03).** Recomendação do TL: desligar previews de branch. Ative o Deployment Protection.

**6. Segredos novos (Production).**
- `AUTH_SECRET` (EXT-07): `openssl rand -base64 32`.
- `CRON_SECRET`: 32 ou mais caracteres aleatórios, exigido por `/api/cron/purge` (diário, 07:00 UTC).
- Google (EXT-01): adicione `https://verbus-finance.vercel.app/api/auth/callback/google` como redirect.

**7. Primeiro deploy.** `curl -i https://verbus-finance.vercel.app/api/health` deve responder `ok`; depois, `scripts/smoke-prod.sh https://verbus-finance.vercel.app`.

**8. E-mail de convite (EXT-02, EXT-08).** Contrate um SMTP transacional; configure `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` no seu domínio e a senha como segredo; publique SPF, DKIM e DMARC. Sem isso, convites só aparecem no Mailpit local.

**9. Lista de cadastro.** Defina `ALLOWED_SIGNUP_EMAILS` antes de divulgar o link. Vazia = cadastro aberto.

**10. Privacidade (checklist 9.3 e 9.6).** Aprove o texto de `/privacidade` (rascunho), defina `PRIVACY_CONTACT_EMAIL` e peça validação jurídica dos prazos. Depois o Dev vira `POLICY_IS_DRAFT` em `src/modules/privacidade/policy.ts`.

**11. Sentry (EXT-04, opcional).** Crie o projeto e informe `SENTRY_DSN`. Confirmar: não há integração no código, então pode exigir tarefa do Dev.

**12. IA em produção (EXT-12, opcional).** Crie conta e chave Anthropic; guarde `ANTHROPIC_API_KEY` (Production); defina limite de gasto no Console. Variáveis: `LLM_PROVIDER=anthropic`, `AI_FEATURES_ENABLED=true`, `LLM_GLOBAL_MONTHLY_CAP_CENTS=5000`, `OPS_ALERT_EMAIL`.

**13. Assistente MCP (depois, opcional).** Mantenha `MCP_ENABLED=false` até: restore testado (checklist 6.6 a 6.9); `client_id` do Claude em `MCP_CIMD_ALLOWED_CLIENT_IDS`; homologação com o claude.ai real.

## C. Decisões de produto pendentes

Responda em [`decisoes-para-o-usuario.md`](decisoes-para-o-usuario.md):
- **Q-U10** (seção F): teto mensal de IA por família (padrão técnico R$ 5,00; teto global sugerido R$ 50).
- **SEC-037** (`estado/privacidade-lgpd.md`): reautenticação nas exclusões.
- **Vetos** a D-GES-57, D-GES-61 e SEC-035 (`estado/seguranca.md`).
- **Agregados da IA** (`estado/ia-assistente-mcp.md`, riscos): incluir despesas "Só meu" de outros? Recomendação: não.
- **TL-42 e TL-47** (checklist 7.5): token pessoal e limites do lançamento pelo assistente.
