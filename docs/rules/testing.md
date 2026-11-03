# Regras: testes

- TDD por critério de aceite: escreva o teste vermelho de cada AC antes do código.
- Vitest unit (`tests/unit`, `pnpm test`): lógica pura, schemas Zod, centavos/rateio, varredura de travas. Roda também `check:imports` e `check:docs`.
- Vitest integração (`tests/integration`, `pnpm test:int`): banco real, rotas, travas, gatilhos, migrações, isolamento por família.
- Playwright-BDD (`tests/e2e`, `pnpm test:e2e` = `bddgen && playwright test`): cenários Gherkin dos fluxos de usuário.
- Novo gatilho/CHECK/migração exige teste de integração; novo fluxo de UI exige cenário E2E.
- Chamadas reais a LLM/rede externa proibidas em teste (helpers `no-llm-network`).
- Antes de entregar: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:int` verdes; não marque pronto sem executar.
- Teste não executado deve ser declarado como tal, nunca como passando.
