# Estado atual

**Fase:** R1–R4 em grande parte entregues; R2.2 concluída; **R3 concluída** (US-041/042/043/044 aprovadas pelo reviewer em 2026-11-07, ADR-040). US-050 e US-051 entregues, aceite do Gestor pendente; UR-2 aceite pendente.
**Verificação (2026-11-07):** `pnpm test:int` completo verde após o bloco R3 (129 arquivos, 1528 testes); `pnpm test` 936. E2E pontual por história verde; E2E completo não rodado. QA no browser (dev, Mariana): compra 3x dividida entra no acerto de nov (R$ 1.000,00, cotas 333,34/333,33/333,33) e na lista "1/3"; editar parcela ("Somente esta"), Histórico, excluir parcela (acerto recalcula a zero); "Dividir por padrão" em Supermercado liga "Pela regra" no lançamento e "Só meu" manual resiste à troca de categoria; revisão de out ("2 despesas Só meu") pede confirmação em mês acertado. Sem erro de console além do 409 esperado.

**E2E enxuto (ADR-039):** mobile roda só `@mobile` (12 cenários); 132 cenários de regra viraram `@integration` (auditoria das 87 features, só onde o int/unit equivalente foi conferido). Execuções E2E ~1.490 → ~610 (599 desktop + 12 mobile); tempo real ainda não medido. Se continuar lento: paralelizar por schema.

## Próximo passo
1. Aceitar UR-2, US-050/051 e o bloco R3; QA com dados reais fica com o usuário.
2. Achados do QA do R3 tratados (`a2876e0`, ADR-041): motor STORED por padrão (migração `20261108000200` vira só famílias LEGACY sem despesa comum; as demais exigem `pnpm migrate:split --dry-run` e depois sem a flag, com `--verify`); revisão do mês com ação por item; "Parcela excluída". QA no browser repetido nesses pontos (dev migrada com `migrate:split`, gate ok, acerto de out idêntico).
3. CHECK `isSharedExpense=(splitMode<>NONE)` em `transactions` só depois de `migrate:split` em produção e `--verify` limpo (ADR-041).
4. Bloqueadas: US-066..069 (R5 adiada), US-074b e US-076c (decisão do usuário).

## Pendências do usuário
- Validar US-092a/b e US-093a/b (aceite condicionado, D-GES-67) e aplicar migrações em produção (`20261029*`, `20261030*`, `20261031*`, `20261107*`; expand antes do código).
- Produção (Vercel + Prisma Postgres, ADR-031): `APP_DEPLOY_ENV=production`, `DATABASE_URL` pooled / `DIRECT_URL` direta, `AUTH_SECRET`, `CRON_SECRET`, redirect do Google, `regions` em `vercel.json`, desligar previews, segredos de backup (`DATABASE_DIRECT_URL`, `BACKUP_PASSPHRASE`; `backup.yml` ainda cita Railway), primeiro deploy + `scripts/smoke-prod.sh`.
- Antes de divulgar: SMTP + SPF/DKIM/DMARC (convites), `ALLOWED_SIGNUP_EMAILS`, texto de `/privacidade` (US-082) com revisão jurídica e `PRIVACY_CONTACT_EMAIL`.
- IA real: conta/chave Anthropic, `LLM_PROVIDER=anthropic`, teto (Q-U10: R$ 5/família, global R$ 50). MCP só com `MCP_ENABLED=true` após restore testado e homologação no claude.ai.
- `git push`: há commits locais não enviados (só o usuário autoriza).
- Decisões: TL-42/TL-47 (token pessoal, limites do assistente). Aprovados como padrão em 2026-11-07: SEC-037 manter confirmação digitada + e-mail, SEC-035 e D-GES-57/61 aceitos, SEC-060 só aviso, SEC-062 não oferecer, agregados da IA sem "Só meu" alheio.

## Dívidas conhecidas
- Fontes >300 linhas: `planned-drawer.tsx` (1018), `transaction-drawer.tsx` (834), `transacoes/service.ts` (680), `mutations.ts` (648), `familia-screen.tsx` (837), `invitations/service.ts` (525), `recurring-service.ts` (448), `export.ts` (389), `removal.ts` (370), `contas-screen.tsx`, `cartoes-screen.tsx`, `previstas-screen.tsx`, `subscription-drawer.tsx` (300); dividir ao tocar.
- US-096b: `removal.ts:323` troca o pagador sem lock de assinaturas (risco baixo); sem teste de concorrência do bloqueio de arquivar cartão. US-098: `canEditSubscription` faz N+1; filtro de cartão em `/assinaturas` pode não achar cartão arquivado. US-099: `split-sweep.test.ts` só cobre `splitAmount`.
- US-053: E2E de selos só cobre o Extrato. US-054: `ArchiveBlocker` declarado em `cartoes/archive.ts` e `cartoes/hooks.ts`.
- E2E: cache `.next-e2e` velho dá falso negativo (apagar antes); 1º cenário falha por compilação a frio; máquina carregada (Elasticsearch/Kibana de outros projetos) estoura timeouts: use `--timeout=120000`. `backfill.test.ts` estoura 5 s sob carga.
- Divergência spec×código: código e testes vencem; registrar em `docs/spec/<área>`.
- DEV-168..173 (previstas, US-051) e DEV-164..167 (cores, US-050): ver specs 04b e 10b.
