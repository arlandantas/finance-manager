import { afterAll } from "vitest";
import { closeTestDb, TEST_DATABASE_URL } from "../support/db";

// Handlers e serviços usam getDb() -> DATABASE_URL: sempre o banco de teste.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_URL = "http://localhost:3100";
process.env.APP_URL = "http://localhost:3100";
process.env.AUTH_SECRET ??= "segredo-somente-para-testes";
process.env.AUTH_DEV_LOGIN = "false";

afterAll(async () => {
  await closeTestDb();
});
