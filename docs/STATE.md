# Estado atual

**Fase:** R1–R4 em grande parte entregues; R2.2 concluída. Em 2026-11-07 entregues e aprovadas pelo reviewer (testes pontuais): US-046 (tags), US-048/049 (análise), UR-2 inteira (US-094a/b, 095, 096/096b/c/d, 097, 098, 099, 100/100b, 101/101b). US-050 e US-051 entregues, aceite do Gestor pendente.
**Verificação (2026-11-07):** por história: lint, typecheck, `pnpm test` (918+), int e E2E da própria história, todos verdes. Bloco UR-2: `test:int` completo verde (125 arquivos, 1485 ok, 1 pulado). E2E completo NÃO foi concluído (cortado por limite de tempo aos ~55 min, sem falhas vistas); dispensado pelo usuário: vale o QA no browser (Análise, Tags, Assinaturas, Previstas/Transferências, Cartões, Família, Extrato abriram sem erro de console; achou e corrigiu hidratação em `/analise`, `196a796`). Telas novas ainda sem conferência visual com dados reais.

**E2E enxuto (ADR-039):** mobile roda só `@mobile` (12 cenários); 132 cenários de regra viraram `@integration` (auditoria das 87 features, só onde o int/unit equivalente foi conferido). Execuções E2E ~1.490 → ~610 (599 desktop + 12 mobile); tempo real ainda não medido. Se continuar lento: paralelizar por schema.

## Próximo passo
1. Aceitar o bloco UR-2; QA exploratório com dados reais (convites, assinaturas, transferências previstas) e da US-050 fica com o usuário.
2. Fila (`docs/backlog/index.md`): US-041 (depende de US-043), US-042/043/044 só após a janela de reversão do rateio (EN-002, `INSTALLMENT_SPLIT_RELEASED=false`) e a decisão da ordem US-041 × US-042.
3. Bloqueadas: US-066..069 (R5 adiada), US-074b e US-076c (decisão do usuário).

## Pendências do usuário
- Validar US-092a/b e US-093a/b (aceite condicionado, D-GES-67) e aplicar migrações em produção (`20261029*`, `20261030*`, `20261031*`, `20261107*`; expand antes do código).
- Produção (Vercel + Prisma Postgres, ADR-031): `APP_DEPLOY_ENV=production`, `DATABASE_URL` pooled / `DIRECT_URL` direta, `AUTH_SECRET`, `CRON_SECRET`, redirect do Google, `regions` em `vercel.json`, desligar previews, segredos de backup (`DATABASE_DIRECT_URL`, `BACKUP_PASSPHRASE`; `backup.yml` ainda cita Railway), primeiro deploy + `scripts/smoke-prod.sh`.
- Antes de divulgar: SMTP + SPF/DKIM/DMARC (convites), `ALLOWED_SIGNUP_EMAILS`, texto de `/privacidade` (US-082) com revisão jurídica e `PRIVACY_CONTACT_EMAIL`.
- IA real: conta/chave Anthropic, `LLM_PROVIDER=anthropic`, teto (Q-U10: R$ 5/família, global R$ 50). MCP só com `MCP_ENABLED=true` após restore testado e homologação no claude.ai.
- `git push`: há commits locais não enviados (só o usuário autoriza).
- Decisões: ordem US-041 × US-042 e fim da janela do EN-002; TL-42/TL-47 (token pessoal, limites do assistente). Aprovados como padrão em 2026-11-07: SEC-037 manter confirmação digitada + e-mail, SEC-035 e D-GES-57/61 aceitos, SEC-060 só aviso, SEC-062 não oferecer, agregados da IA sem "Só meu" alheio.

## Dívidas conhecidas
- Fontes >300 linhas: `familia-screen.tsx` (837), `invitations/service.ts` (525), `recurring-service.ts` (448), `export.ts` (389), `removal.ts` (370), `contas-screen.tsx`, `cartoes-screen.tsx`, `previstas-screen.tsx`, `subscription-drawer.tsx` (300); dividir ao tocar.
- US-096b: `removal.ts:323` troca o pagador sem lock de assinaturas (risco baixo); sem teste de concorrência do bloqueio de arquivar cartão. US-098: `canEditSubscription` faz N+1; filtro de cartão em `/assinaturas` pode não achar cartão arquivado. US-099: `split-sweep.test.ts` só cobre `splitAmount`.
- US-053: E2E de selos só cobre o Extrato. US-054: `ArchiveBlocker` declarado em `cartoes/archive.ts` e `cartoes/hooks.ts`.
- E2E: cache `.next-e2e` velho dá falso negativo (apagar antes); 1º cenário falha por compilação a frio; máquina carregada (Elasticsearch/Kibana de outros projetos) estoura timeouts: use `--timeout=120000`. `backfill.test.ts` estoura 5 s sob carga.
- Divergência spec×código: código e testes vencem; registrar em `docs/spec/<área>`.
- DEV-168..173 (previstas, US-051) e DEV-164..167 (cores, US-050): ver specs 04b e 10b.
