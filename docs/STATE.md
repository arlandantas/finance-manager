# Estado atual

**Fase:** US-046 (tags), US-048 e US-049 (análise) e US-094a, US-094b e US-095 (convites) e US-096/096b/096c/096d (assinatura: servidor, remoção, exportação, telas) entregues; visual das telas novas e E2E completo (regressão da porta única) ainda sem conferência (QA final); migrações 20261107* pendentes em produção e aprovadas em 2026-11-07. R1–R4 em grande parte entregues; R2.2 concluída (US-053 e US-054 aprovadas pelo reviewer em 2026-11-03); US-050 e US-051 entregues, aceite do Gestor pendente. Fluxo enxuto adotado (docs/ + .claude/agents/); histórico antigo só no git (`agents/`, removida).
**Verificação (2026-11-03):** lint, typecheck, check:imports e check:docs ok · unit 867 ok · int 1292 ok (1 pulado) · E2E 1313 ok, 2 pulados na 1ª execução, com 7 falhas únicas em EN-004/EN-005 (`/familia` presa em "Carregando família"); não reproduziu (isoladas, cache frio, após `test:int`) e o desktop completo passou depois (660 ok, 1 pulado) → flakiness de ambiente, sem defeito de código. Se voltar, abrir o trace. QA exploratório da US-050 pendente.

## Próximo passo
1. Aceitar ou devolver US-050/US-051 (suítes verdes; falta o QA exploratório da US-050).
2. Fila no índice (`docs/backlog/index.md`): US-041 (pode iniciar), US-042/043/044 só após a janela de reversão do rateio (EN-002, `INSTALLMENT_SPLIT_RELEASED=false`), US-097..101 (especificadas pelo architect em 2026-11-07, prontas para o builder).
3. Bloqueadas: US-066..069 (R5 adiada), US-074b e US-076c (decisão do usuário).

## Pendências do usuário
- Validar US-092a/b e US-093a/b (aceite condicionado, D-GES-67) e aplicar migrações em produção (`20261029*`, `20261030*`, `20261031*`, expand antes do código).
- Produção (Vercel + Prisma Postgres, ADR-031): `APP_DEPLOY_ENV=production`, `DATABASE_URL` pooled / `DIRECT_URL` direta, `AUTH_SECRET`, `CRON_SECRET`, redirect do Google, `regions` em `vercel.json`, desligar previews, segredos de backup (`DATABASE_DIRECT_URL`, `BACKUP_PASSPHRASE`; `backup.yml` ainda cita Railway), primeiro deploy + `scripts/smoke-prod.sh`.
- Antes de divulgar: SMTP + SPF/DKIM/DMARC (convites), `ALLOWED_SIGNUP_EMAILS`, texto de `/privacidade` (US-082) com revisão jurídica e `PRIVACY_CONTACT_EMAIL`.
- IA real: conta/chave Anthropic, `LLM_PROVIDER=anthropic`, teto (Q-U10: R$ 5/família, global R$ 50). MCP só com `MCP_ENABLED=true` após restore testado e homologação no claude.ai.
- `git push`: há commits locais não enviados (só o usuário autoriza).
- Decisões: SEC-037 (reautenticação nas exclusões), vetos a D-GES-57/61 e SEC-035, agregados da IA com "Só meu" alheio (recomendado: não), TL-42/TL-47 (token pessoal, limites do assistente), ordem US-041 × US-042.

## Dívidas conhecidas
- US-053: E2E de selos só cobre o Extrato (Início e A pagar sem E2E). US-054: `contas-screen.tsx` e `cartoes-screen.tsx` passam de 300 linhas; `ArchiveBlocker` declarado em `cartoes/archive.ts` e `cartoes/hooks.ts`; sem E2E próprio de conta (coberto pela US-032).
- E2E: o 1º cenário de uma rodada às vezes falha (compilação a frio do `next dev`); com a máquina carregada (load alto de outros processos) muitos cenários estouram o timeout de 30 s. Passam no reteste ou com `--timeout=120000`. `tests/unit/split/backfill.test.ts` estoura 5 s sob carga.
- Fontes acima de 300 linhas (anteriores): `familia-screen.tsx` (837), `invitations/service.ts` (525); dividir quando tocar.
- US-096b: `removal.ts:323` (`reassignPayerSubscriptions`) troca o pagador sem `lockFamilySplit`/lock de assinaturas (risco baixo: cobrança concorrente pode lançar no removido); sem teste de concorrência do bloqueio de arquivar cartão; `removal.ts` (370) e `export.ts` (383) >300, extrair `gather`/`blockersOf`.
- Divergência spec×código: código e testes vencem; registrar em `docs/spec/<área>`.
- DEV-168..173 (previstas, US-051) e DEV-164..167 (cores, US-050): ver specs 04b e 10b.
