# finance-manager

Gestão financeira familiar (Next.js + Prisma/Postgres + Auth.js, Vitest, Playwright-BDD, Biome, pnpm).
Idioma: docs, UI e commits em pt-BR; código e identificadores em inglês.
Ponto de entrada único de qualquer agente. Esteira enxuta: sem papéis por pasta, sem trailer por papel.

## Mapa (leia só o que a tarefa exige; nunca varra diretórios)

- `docs/STATE.md` — fase, verificação, próximo passo, pendências do usuário (reescrito, ≤40 linhas)
- `docs/backlog/index.md` — uma linha por história · `docs/backlog/stories/US-NNN.md` — história pendente
- `docs/spec/` — regra vigente por área (≤120 linhas); índice em `docs/spec/README.md`
- `docs/adr/` — uma decisão por arquivo; índice em `docs/adr/README.md`
- `docs/agents/` — papéis · `docs/rules/` — regras por tema · `docs/templates/` — story e ADR · `docs/roadmap.md` — marcos
- Histórico (`agents/`, relatórios, D-GES/D-PO, SDD, tasks) só no git: `git log -- agents/`. Não leia.

## Regras por tema

| Ao tocar | Leia |
| --- | --- |
| valores, rateio, acerto, fatura, parcelas | `docs/rules/dinheiro-centavos.md` |
| `prisma/**`, queries, transações, travas | `docs/rules/prisma-db.md` |
| `src/app/**`, componentes, hooks de UI | `docs/rules/frontend.md` |
| qualquer teste | `docs/rules/testing.md` |
| dados pessoais, "Só meu", LLM, MCP, auth | `docs/rules/seguranca-lgpd.md` |
| deploy, Vercel, backup, migração em produção | `docs/rules/producao.md` |

## Comandos

- `pnpm dev` (porta 3100) · `pnpm db:up` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:reset`
- `pnpm lint` (Biome) · `pnpm typecheck` · `pnpm test` (imports + docs + Vitest unit)
- `pnpm test:int` (Postgres real) · `pnpm test:e2e` (BDD + Playwright)
- `pnpm check:docs` — limites de tamanho, links e índice↔histórias · `pnpm check:imports`
- Hook pre-commit: lint, typecheck, check:imports, check:docs · commit-msg: commitlint

## Limites de tamanho (divida antes de passar)

AGENTS.md ≤80 linhas · spec ≤120 · história ≤60 · ADR ≤40 · STATE ≤40 · fonte ≤300.
Histórico fica no git, não em docs. Nunca anexe ao STATE.md; reescreva.

## Loop do gestor (a sessão principal)

1. Leia STATE.md e a próxima linha `todo` de `docs/backlog/index.md`.
2. Delegue ao `builder` com: ID da história + caminhos de spec/ADR/rules que ela lista. Nada mais.
3. Delegue o diff ao `reviewer`. No máx. 2 rodadas builder↔reviewer; depois pergunte ao usuário.
4. Aprovado: status `done` no index, reescreva STATE.md, commit.
5. Mudou regra de negócio: atualize a spec da área no mesmo commit.
6. Supervisione a cada 5 min enquanto houver subagente ou teste rodando (`docs/agents/supervisao.md`): processo morto ou parado sem relatório é falha silenciosa; não espere em vão.
7. Decida sozinho o que for reversível e registre ADR. Escale ao usuário só: escopo, prazo, regra financeira sensível, credenciais/contas, ações irreversíveis (push, deploy, apagar dados).

## Papéis (`docs/agents/`)

architect (opus, raro: marco/domínio crítico) · builder, reviewer (sonnet) · researcher (haiku, buscas e levantamento de segurança).
Brief = ID da história + caminhos. Resposta do subagente ≤150 palavras: resultado, arquivos, pendências. Reviewer: `APPROVED` ou lista numerada (arquivo:linha, motivo, esperado).

## Git

Commits atômicos, Conventional Commits em pt-BR; história: `feat(US-NNN): ...` ou `fix(US-NNN): ...`; docs/config: `docs:`/`chore:`.
O commitlint exige trailer `Co-authored-by:` (uma atribuição do agente). `git commit -o <seus arquivos>`; sem `push`, `--force` nem `--amend` sem autorização.

## Não negociáveis

Dinheiro em centavos inteiros (`amountInCents`). Dados pessoais/LGPD e "Só meu" nunca vazam. Sem segredos no repositório. Escalar ao usuário o que a lista do loop manda.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
