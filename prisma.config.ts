import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 não carrega .env sozinho. Mesma precedência do Next: .env.local, depois .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
