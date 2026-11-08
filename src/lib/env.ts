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
    // U6 (D-GES-42): lista de e-mails que podem CRIAR conta (vírgula); vazia/ausente = cadastro aberto
    ALLOWED_SIGNUP_EMAILS: optionalString,
    // SEC-017e (US-082): e-mail de contato da página Privacidade; vazio = mostra o marcador a definir
    PRIVACY_CONTACT_EMAIL: optionalString,
    // EN-006 (SDD-024 §3): servidor MCP/OAuth desligado por padrão; em preview da Vercel nunca liga.
    MCP_ENABLED: flag,
    MCP_CIMD_ALLOWED_CLIENT_IDS: optionalString, // SEC-010: URLs exatas; MCP_CIMD_ALLOWED_HOSTS obsoleta (ignorada)
    MCP_CIMD_ALLOWED_HOSTS: optionalString,
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString, // segredo (EN-006): nunca em log, erro ou resposta
    SMTP_SECURE: flag, // TLS implícito (porta 465); na 587 usa STARTTLS
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
    // SDD-024 §3: o `resource` OAuth e o issuer precisam de https em produção.
    if (env.NODE_ENV === "production" && env.MCP_ENABLED && !env.APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL precisa ser https quando MCP_ENABLED=true em produção",
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
