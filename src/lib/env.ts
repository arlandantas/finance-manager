import { z } from "zod";
import { isLocalHost } from "@/lib/auth/dev-login-guard";
import { resolveRuntimeDatabaseUrl } from "@/lib/db-url";
import { isAllowedDevHost } from "@/lib/dev-origins";

// Valores vazios no .env (ex.: AUTH_GOOGLE_ID="") equivalem a "não definido".
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const flag = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() === "true" : v),
  z.boolean().default(false),
);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    // ADR-031 §3: máximo de conexões do pool por instância (padrão 3).
    DB_POOL_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).optional()),
    APP_TIMEZONE: z.string().default("America/Sao_Paulo"),
    APP_URL: z.string().default("http://localhost:3100"),
    APP_PUBLIC_ORIGIN: optionalString,
    APP_DEV_ORIGINS: optionalString,
    APP_DEV_LAN_AUTO: optionalString,
    APP_NOW_OVERRIDE: optionalString,
    AUTH_SECRET: optionalString,
    AUTH_URL: z.string().default("http://localhost:3100"),
    AUTH_TRUST_HOST: flag,
    AUTH_DEV_LOGIN: flag,
    APP_HOMOLOG_MODE: flag,
    HOSTNAME: optionalString,
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    MAIL_FROM: z.string().default("Finance Manager <no-reply@finance-manager.local>"),
  })
  .superRefine((env, ctx) => {
    // ADR-024 (rev. 2): a homologação só exige a flag explícita APP_HOMOLOG_MODE; sem outras condições.
    if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN && !env.APP_HOMOLOG_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_DEV_LOGIN"],
        message: "AUTH_DEV_LOGIN não pode estar ativo em produção",
      });
    }
    if (env.NODE_ENV !== "test" && !env.AUTH_SECRET) {
      ctx.addIssue({ code: "custom", path: ["AUTH_SECRET"], message: "AUTH_SECRET é obrigatório" });
    }
  });

export type Env = z.infer<typeof schema>;

export function getEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  // ADR-031 §3: tolera os nomes injetados pela integração Prisma (POSTGRES_URL, host direto -> pooled).
  const url = resolveRuntimeDatabaseUrl(source);
  return schema.parse(url ? { ...source, DATABASE_URL: url } : source);
}

/**
 * Base dos links enviados por e-mail. Em produção: APP_URL. Em dev: a origem da requisição (Origin) quando é
 * uma origem de dev permitida (localhost/IP da LAN/túnel), senão APP_PUBLIC_ORIGIN, senão APP_URL.
 */
export function publicBaseUrl(env: Env = getEnv(), requestOrigin?: string | null): string {
  let base = env.APP_URL;
  if (env.NODE_ENV !== "production") {
    const origin = requestOrigin?.trim();
    if (origin && isAllowedOrigin(origin, env)) base = new URL(origin).origin;
    else if (env.APP_PUBLIC_ORIGIN) base = env.APP_PUBLIC_ORIGIN;
  }
  return base.replace(/\/+$/, "");
}

function isAllowedOrigin(origin: string, env: Env): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isLocalHost(url.host) || isAllowedDevHost(origin, env);
  } catch {
    return false;
  }
}
