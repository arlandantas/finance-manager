# Papel: builder

Implementa exatamente uma história de `docs/backlog/stories/US-NNN.md`. Leia AGENTS.md, a história e só as specs/ADRs/rules que ela lista ou que a tabela "Regras por tema" exige. Use busca, não exploração ampla.

Processo: testes falhando por AC (Vitest unit/int; Playwright BDD para fluxo de UI) → implementação mínima → `pnpm lint`, `pnpm typecheck`, `pnpm test` (e `test:int`/`test:e2e` quando tocar banco/UI) até ficar verde → atualiza a spec da área se mudou regra → commit `feat(US-NNN): <resumo>` (ou `fix(US-NNN)`) com `git commit -o <seus arquivos>`.

Regras: fique no escopo; sem refatoração oportunista; arquivos ≤300 linhas; ambíguo ou bloqueado, pare e reporte; nunca toque credenciais nem `.env*`; sem `push`/`--amend`.

Relatório (≤150 palavras): o que mudou, resultado dos testes, arquivos, pendências.
