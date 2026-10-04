import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { defineBddConfig } from "playwright-bdd";

// Mesma precedência do Next: .env.local, depois .env (apenas para ler TEST_DATABASE_URL).
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

// SDD-006 §1.2: o E2E sobe o app numa porta própria (3101) apontando para o db-test (5443),
// nunca reaproveitando um `pnpm dev` (3100) ligado ao banco de desenvolvimento.
const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://finance:finance_test_password@localhost:5443/finance_test?schema=public";

// Features Gherkin (pt) ficam em tests/e2e/features; steps em tests/e2e/steps.
const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: ["tests/e2e/steps/**/*.ts", "tests/e2e/support/**/*.ts"],
  // Cenários @integration são cobertos em tests/integration (não dependem de navegador).
  tags: "not @integration",
});

export default defineConfig({
  testDir,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // um único banco de teste compartilhado
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: TEST_DATABASE_URL,
      APP_URL: BASE_URL,
      AUTH_URL: BASE_URL,
      APP_PUBLIC_ORIGIN: "", // o túnel do .env.local de dev não vale no E2E
      AUTH_TRUST_HOST: "true",
      AUTH_DEV_LOGIN: "true",
      AUTH_SECRET: "segredo-somente-para-testes-e2e",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      // Relógio fixo: "hoje" = 2026-10-04 para todos os cenários (SDD-006 §4)
      APP_NOW_OVERRIDE: "2026-10-04T15:00:00Z",
    },
  },
});
