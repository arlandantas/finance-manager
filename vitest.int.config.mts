import path from "node:path";
import { defineConfig } from "vitest/config";

// Integração: Postgres real (db-test, tmpfs, porta 5443). Rodar `docker compose up -d db-test` antes.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
