/**
 * Verificações de arquitetura (ADR-013, SDD-006 §6). Uso: `pnpm check:imports`.
 *  1. `@/lib/db` só pode ser importado por camadas de acesso a dados.
 *  2. Regras puras (period, money, apportion, dates, rules, settlement) não importam Next/Prisma
 *     nem usam `Date.now()` / `new Date()` sem argumento.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Violation = { file: string; rule: string; message: string };

const DB_IMPORT =
  /from\s+["'](?:@\/lib\/db|(?:\.\.?\/)+(?:lib\/)?db)["']|import\(\s*["']@\/lib\/db["']\s*\)/;

const DB_ALLOWED: RegExp[] = [
  /^src\/lib\/db\.ts$/,
  /^src\/lib\/api\//,
  /^src\/lib\/auth\//, // infraestrutura de autenticação (anterior ao contexto de família)
  /^src\/modules\/.+\/repo\.ts$/,
  /^src\/modules\/.+\/ledger[^/]*\.ts$/,
  /^src\/instrumentation\.ts$/,
  /^tests\//,
  /^prisma\//,
  /^scripts\//,
];

const PURE: RegExp[] = [
  /^src\/lib\/(period|money|apportion|dates)\.ts$/,
  /^src\/modules\/.+\/(rules|settlement|period|money|apportion)[^/]*\.ts$/,
];

const FORBIDDEN_IN_PURE =
  /from\s+["'](?:next(?:\/[^"']*)?|@prisma\/[^"']+|@\/lib\/db|@\/generated\/[^"']+)["']/;
const CLOCK_USE = /Date\.now\(|new Date\(\s*\)/;

export function checkFile(file: string, content: string): Violation[] {
  const out: Violation[] = [];
  const rel = file.split(path.sep).join("/");
  if (DB_IMPORT.test(content) && !DB_ALLOWED.some((re) => re.test(rel))) {
    out.push({
      file: rel,
      rule: "db-import",
      message:
        "`@/lib/db` só pode ser importado em src/lib/api, src/lib/auth, repo.ts, ledger*.ts, tests, prisma e scripts",
    });
  }
  if (PURE.some((re) => re.test(rel))) {
    if (FORBIDDEN_IN_PURE.test(content)) {
      out.push({
        file: rel,
        rule: "pure-imports",
        message: "Regra pura não pode importar next, Prisma ou db",
      });
    }
    if (CLOCK_USE.test(content)) {
      out.push({
        file: rel,
        rule: "pure-clock",
        message: "Regra pura não pode usar Date.now() nem new Date() sem argumento",
      });
    }
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      [
        "node_modules",
        ".next",
        "generated",
        ".features-gen",
        "playwright-report",
        "test-results",
      ].includes(name)
    )
      continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

export function checkProject(root = process.cwd()): Violation[] {
  const files = ["src", "tests", "prisma", "scripts"].flatMap((d) => {
    try {
      return walk(path.join(root, d));
    } catch {
      return [];
    }
  });
  return files.flatMap((f) => checkFile(path.relative(root, f), readFileSync(f, "utf8")));
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("check-imports")) {
  const violations = checkProject();
  for (const v of violations) console.error(`✗ ${v.file} [${v.rule}] ${v.message}`);
  if (violations.length > 0) process.exit(1);
  console.log("check:imports ok");
}
