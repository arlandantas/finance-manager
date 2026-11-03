# Estado atual

**Fase:** R1–R4 em grande parte entregues; US-050 e US-051 entregues, aceite do Gestor pendente. Fluxo enxuto adotado (docs/ + .claude/agents/); histórico antigo só no git (`agents/`, removida).
**Verificação:** US-051 com testes escritos e NÃO executados (rodar unit/int/E2E + regressão previstas/Resumo/acerto). QA exploratório da US-050 pendente.

## Próximo passo
1. Rodar as suítes da US-051 e da US-050 (reviewer); aceitar ou devolver.
2. Fila no índice (`docs/backlog/index.md`): US-041 (pode iniciar), US-042/043/044 só após a janela de reversão do rateio (EN-002, `INSTALLMENT_SPLIT_RELEASED=false`), US-046, US-048/049, US-053/054, US-094a/b, US-095..101 (os últimos aguardam especificação do architect).
3. Bloqueadas: US-066..069 (R5 adiada), US-074b e US-076c (decisão do usuário).

## Pendências do usuário
- Validar US-092a/b e US-093a/b (aceite condicionado, D-GES-67) e aplicar migrações em produção (`20261029*`, `20261030*`, `20261031*`, expand antes do código).
- Produção (Vercel + Prisma Postgres, ADR-031): `APP_DEPLOY_ENV=production`, `DATABASE_URL` pooled / `DIRECT_URL` direta, `AUTH_SECRET`, `CRON_SECRET`, redirect do Google, `regions` em `vercel.json`, desligar previews, segredos de backup (`DATABASE_DIRECT_URL`, `BACKUP_PASSPHRASE`; `backup.yml` ainda cita Railway), primeiro deploy + `scripts/smoke-prod.sh`.
- Antes de divulgar: SMTP + SPF/DKIM/DMARC (convites), `ALLOWED_SIGNUP_EMAILS`, texto de `/privacidade` (US-082) com revisão jurídica e `PRIVACY_CONTACT_EMAIL`.
- IA real: conta/chave Anthropic, `LLM_PROVIDER=anthropic`, teto (Q-U10: R$ 5/família, global R$ 50). MCP só com `MCP_ENABLED=true` após restore testado e homologação no claude.ai.
- `git push`: há commits locais não enviados (só o usuário autoriza).
- Decisões: SEC-037 (reautenticação nas exclusões), vetos a D-GES-57/61 e SEC-035, agregados da IA com "Só meu" alheio (recomendado: não), TL-42/TL-47 (token pessoal, limites do assistente), ordem US-041 × US-042.

## Dívidas conhecidas
- Divergência spec×código: código e testes vencem; registrar em `docs/spec/<área>`.
- DEV-168..173 (previstas, US-051) e DEV-164..167 (cores, US-050): ver specs 04b e 10b.
