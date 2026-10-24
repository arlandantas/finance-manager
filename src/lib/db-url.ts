// ADR-031 §3 / EN-007: resolução TOLERANTE das URLs do banco.
//
// A integração Prisma da Vercel grava `DATABASE_URL` / `POSTGRES_URL` (TCP direto, host `db.prisma.io`) e
// `PRISMA_DATABASE_URL` (`prisma+postgres://`, que o adapter `pg` NÃO entende). O ADR-031 pede duas URLs:
//   - app (runtime)  -> pooled  (`pooled.db.prisma.io`, PgBouncer em modo transação);
//   - CLI/backup     -> direta  (`db.prisma.io`).
// Em vez de exigir que o usuário crie variáveis novas, aceitamos os nomes que a integração já injeta e,
// quando a única URL disponível é a direta do Prisma Postgres, derivamos a pooled trocando o host.
// Funções puras, sem dependências (usadas por prisma.config.ts, db.ts e env.ts).

type Env = Record<string, string | undefined>;

const DIRECT_HOST = "db.prisma.io";
const POOLED_HOST = "pooled.db.prisma.io";

/** Nomes aceitos, em ordem de precedência. `prisma+postgres://` é sempre ignorada. */
export const RUNTIME_URL_VARS = ["DATABASE_URL", "POSTGRES_URL"] as const;
export const DIRECT_URL_VARS = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

function usable(v: string | undefined): string | undefined {
  const s = v?.trim();
  if (!s) return undefined;
  return /^postgres(ql)?:\/\//i.test(s) ? s : undefined;
}

function swapHost(url: string, from: string, to: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() !== from) return url;
    u.hostname = to;
    return u.toString();
  } catch {
    return url;
  }
}

/** URL do app: a primeira utilizável; host direto do Prisma Postgres vira `pooled.` (a menos que seja explícito). */
export function resolveRuntimeDatabaseUrl(env: Env): string | undefined {
  for (const k of RUNTIME_URL_VARS) {
    const v = usable(env[k]);
    if (v) return swapHost(v, DIRECT_HOST, POOLED_HOST);
  }
  return undefined;
}

/** URL do CLI do Prisma (migrações) e do backup: nunca o pooler (host `pooled.` volta a `db.prisma.io`). */
export function resolveDirectDatabaseUrl(env: Env): string | undefined {
  for (const k of DIRECT_URL_VARS) {
    const v = usable(env[k]);
    if (v) return swapHost(v, POOLED_HOST, DIRECT_HOST);
  }
  return undefined;
}
