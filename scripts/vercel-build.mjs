// ADR-031 §3: build da Vercel (a Vercel usa o script `vercel-build` no lugar de `build` quando ele existe).
// `prisma migrate deploy` SÓ em produção (VERCEL_ENV=production); preview/dev/local nunca migram.
// Migração falhou => o build falha => a versão anterior continua no ar. As migrações precisam ser
// compatíveis com a versão anterior do código (expandir antes de contrair).
import { spawnSync } from "node:child_process";

export function shouldMigrate(env) {
  return env.VERCEL_ENV === "production";
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env, shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.argv[1]?.endsWith("vercel-build.mjs")) {
  if (shouldMigrate(process.env)) {
    console.log(
      "[vercel-build] VERCEL_ENV=production: aplicando migrações (prisma migrate deploy)",
    );
    run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  } else {
    console.log(`[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(ausente)"}: sem migração`);
  }
  run("pnpm", ["exec", "next", "build"]);
}
