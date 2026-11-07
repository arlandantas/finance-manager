# Regras: testes

- TDD por critério de aceite: escreva o teste vermelho de cada AC antes do código.
- Vitest unit (`tests/unit`, `pnpm test`): lógica pura, schemas Zod, centavos/rateio, varredura de travas. Roda também `check:imports` e `check:docs`.
- Vitest integração (`tests/integration`, `pnpm test:int`): banco real, rotas, travas, gatilhos, migrações, isolamento por família.
- Playwright-BDD (`tests/e2e`, `pnpm test:e2e` = `bddgen && playwright test`): cenários Gherkin dos fluxos de usuário.
- Novo gatilho/CHECK/migração exige teste de integração; novo fluxo de UI exige cenário E2E.
- Chamadas reais a LLM/rede externa proibidas em teste (helpers `no-llm-network`).
- Por história: `pnpm lint`, `pnpm typecheck`, `pnpm test`, o int e o E2E da própria história, e (se tocou schema/migração/tabela) os guardas baratos `sec017*`, `sec029*`, `migrations`, `lock-coverage` e os que usam `seed-all`; verdes antes de entregar.
- Por bloco (3 a 5 histórias, ou antes de QA/release): `pnpm test:int` completo, E2E completo (desktop e mobile) e conferência visual no browser. O gestor agenda; não rode a suíte completa a cada história.
- Teste não executado deve ser declarado como tal, nunca como passando.
- Suítes longas (`test:int`, `test:e2e`) rodam em segundo plano e podem travar sob carga: confira a cada 5 min se o processo vive (`ps`) e produz saída; matar `next dev`/`playwright` órfãos e apagar `.next-e2e` antes de repetir.
