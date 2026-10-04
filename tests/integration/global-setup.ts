import { execSync } from "node:child_process";
import { config } from "dotenv";

// Aplica as migrações no banco de teste efêmero antes da suíte de integração.
export default function setup() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL ausente (veja .env.example)");
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
