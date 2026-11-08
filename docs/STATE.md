# Estado atual

**Fase:** backlog planejado concluído em 2026-11-08 (nenhuma história `todo`, `doing` ou `blocked`): R3 (US-041..044), importação de fatura (US-066..069, ADR-042), token pessoal MCP (US-074b/c, ADR-043), US-076c, EN-006 (SMTP real) e o motor STORED por padrão (ADR-041). Tudo aprovado pelo reviewer. Aceite do Gestor pendente: UR-2, US-050/051 e este bloco.
**Produção:** no ar em https://verbus-finance.vercel.app/ (Vercel, Prisma Postgres na Vercel, Node 22 até o deploy); detalhes em `docs/rules/producao.md` §0. US-102 `done` no repositório: alvo Node 26 (ADR-044, risco HTTP/2 do `fetch` sem dependência de HTTP/1.1 nos clientes externos). Falta do usuário: AC3 (Vercel Node.js Version = 26) e AC5 (`scripts/smoke-prod.sh` após o deploy); se `fetch` externo falhar, `VERCEL_FETCH_DISABLE_H2=1`.
**Verificação (2026-11-08, Node 26.13):** lint e typecheck limpos; `pnpm test` 1276 (110 arquivos); `pnpm test:int` 141 arquivos, 1638 testes; E2E completo 634 de 635 (a única falha, US-094b "nome escolhido", é corrida de hidratação do `fill` sobre campo pré-preenchido e passa isolada; sem relação com o Node). QA no browser (dev, Mariana, IA simulada): CSV de 6 linhas → rascunho (compras, parcela 3/10, estorno bloqueado) → 5 itens importados (fatura R$ 428,50; parcelas futuras +R$ 1.750,00; selo "Importado da fatura") → desfazer devolveu limite, fatura e parcelas ao valor anterior; token pessoal criado (formato `fmp_`, valor só no diálogo, nunca no DOM depois), listado e revogado; chaves da família nascem desligadas. Sem erro de console além do ruído do HMR. NÃO conferido no browser: PDF, "Esta e as próximas" na parcela, mobile da importação, e-mail de alerta do token.

## Próximo passo
1. Usuário: checklist passo a passo em `docs/rules/producao.md` §0.1 (Vercel em Node 26, push/deploy, smoke, health, login; fecha US-102 AC3 e AC5); aceite do bloco e QA com dados reais; conferir em produção os itens "a confirmar" de `docs/rules/producao.md` §0.
2. Em produção, após o deploy: `pnpm migrate:split --dry-run`, depois sem a flag, depois `--verify` (ADR-041). Só então o CHECK `isSharedExpense=(splitMode<>NONE)` em `transactions` vira história.
3. Sem desenvolvimento autônomo pendente. Candidatos se o usuário quiser: dividir as fontes >300 linhas; paginar a lista de lotes importados; E2E completo medido.

## Pendências do usuário
- Produção (já no ar): confirmar variáveis, migrações aplicadas até `20261108050100_us074b_pat`, `regions` em `vercel.json` (região do banco), previews desligados, segredos do GitHub de backup (`DATABASE_DIRECT_URL`, `BACKUP_PASSPHRASE`), backup + ensaio de restore, `scripts/smoke-prod.sh`.
- Validar US-092a/b e US-093a/b (aceite condicionado, D-GES-67).
- Antes de divulgar: provedor SMTP real (`SMTP_HOST/PORT/USER/PASSWORD`, `MAIL_FROM`; EN-006) + SPF/DKIM/DMARC, `ALLOWED_SIGNUP_EMAILS`, texto de `/privacidade` (US-082) com revisão jurídica, `PRIVACY_CONTACT_EMAIL`.
- IA real: chave Anthropic (EXT-12), `LLM_PROVIDER=anthropic`, limite de gasto na console, teto (R$ 5/família, global R$ 50), `OPS_ALERT_EMAIL`, `AI_FEATURES_ENABLED`. Importação de PDF: aceite explícito de que a descrição do estabelecimento vai à Anthropic (ADR-042 §4) e faturas reais para validar o parser; `INVOICE_IMPORT_ENABLED` nasce desligado.
- MCP e token pessoal: `MCP_ENABLED`/`MCP_PAT_ENABLED` só após restore testado e homologação no claude.ai; no self-host, `X-Forwarded-For` só vale atrás de proxy confiável (spec 08).
- `git push`: há commits locais não enviados (só o usuário autoriza).
- Aprovados como padrão: SEC-037, SEC-035, D-GES-57/61, SEC-060 só aviso, SEC-062 não oferecer, agregados da IA sem "Só meu" alheio; ADR-040/041/042/043 (decididos sem escalar por autorização do usuário em 2026-11-08).

## Dívidas conhecidas
- Fontes >300 linhas: `planned-drawer.tsx` (1018), `familia-screen.tsx` (837), `transaction-drawer.tsx` (834), `transacoes/service.ts` (680), `mutations.ts` (648), `invitations/service.ts` (525), `transaction-detail-drawer.tsx` (490), `recurring-service.ts` (448), `export.ts` (389), `removal.ts` (370), `acerto-screen.tsx` (504), telas de contas/cartões/previstas; dividir ao tocar.
- Importação: lista de lotes limitada a 100 (sem paginação); redação do PDF tem riscos aceitos IMP-6/IMP-7 (spec 13); `itemCount`/`totalInCents` do lote agregam "Só meu" de outro membro (só agregado).
- US-096b: `removal.ts:323` troca o pagador sem lock de assinaturas; sem teste de concorrência do bloqueio de arquivar cartão. US-098: `canEditSubscription` faz N+1. US-099: `split-sweep.test.ts` só cobre `splitAmount`. US-053/054: ver specs.
- E2E: apagar `.next-e2e` antes; 1º cenário falha por compilação a frio; máquina carregada estoura timeouts (`--timeout=120000`); `pnpm test:int -- x` roda a suíte toda: use `pnpm exec vitest run --config vitest.int.config.mts <arquivo>`.
- Divergência spec×código: código e testes vencem; registrar em `docs/spec/<área>`.
