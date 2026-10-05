import { z } from "zod";
import { isLocalHost } from "@/lib/auth/dev-login-guard";
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
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1025),
    MAIL_FROM: z.string().default("Finance Manager <no-reply@finance-manager.local>"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN) {
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
  return schema.parse(source);
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
