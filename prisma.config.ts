import { config } from "dotenv";
import { defineConfig } from "prisma/config";
import { resolveDirectDatabaseUrl } from "./src/lib/db-url";

// Prisma 7 não carrega .env sozinho. Mesma precedência do Next: .env.local, depois .env.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // ADR-031 §3: o CLI (migrate/studio) usa a URL DIRETA (DIRECT_URL, ou a que a integração Prisma da Vercel
  // injeta); o runtime do app usa a pooled (src/lib/db.ts). Em dev só existe DATABASE_URL.
  datasource: { url: resolveDirectDatabaseUrl(process.env) ?? "" },
});
