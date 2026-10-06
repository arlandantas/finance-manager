// Funções puras e sem dependências de Node (usáveis em instrumentation/Edge).
import { hostnameOf, isAllowedDevHost } from "@/lib/dev-origins";

type Env = Record<string, string | undefined>;

/** ADR-026 §5: imagem de produção grava APP_DEPLOY_ENV=production; nela, nada de teste/homologação. */
export const PROD_FORBIDDEN_VARS = [
  "AUTH_DEV_LOGIN",
  "APP_HOMOLOG_MODE",
  "APP_NOW_OVERRIDE",
] as const;

export function isProdDeploy(env: Env = process.env): boolean {
  return env.APP_DEPLOY_ENV === "production";
}

/** Variáveis proibidas presentes (a mera presença, com qualquer valor, conta). */
export function unsafeProdVars(env: Env = process.env): string[] {
  if (!isProdDeploy(env)) return [];
  return PROD_FORBIDDEN_VARS.filter((k) => env[k] !== undefined);
}

const isOn = (v: string | undefined) => v?.trim().toLowerCase() === "true";

/**
 * ADR-024 (rev. 2): homologação ativa = produção + APP_HOMOLOG_MODE=true + AUTH_DEV_LOGIN=true. Nenhuma outra
 * condição (bind, banco, URL, Google): o usuário aceitou o risco (ver ADR-024, revisão 2).
 */
export function isHomologModeActive(env: Env = process.env): boolean {
  if (isProdDeploy(env)) return false;
  return (
    env.NODE_ENV === "production" && isOn(env.APP_HOMOLOG_MODE) && env.AUTH_DEV_LOGIN === "true"
  );
}

/** ADR-008: só com AUTH_DEV_LOGIN=true e fora de produção, ou no modo de homologação (ADR-024). */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  if (isProdDeploy(env) || env.AUTH_DEV_LOGIN !== "true") return false;
  return env.NODE_ENV !== "production" || isHomologModeActive(env);
}

/** Ferramentas só de dev/E2E (ex.: /api/dev/clock): fora de produção ou no modo de homologação. */
export function isDevToolingEnabled(env: Env = process.env): boolean {
  if (isProdDeploy(env)) return false;
  return (
    env.AUTH_DEV_LOGIN === "true" && (env.NODE_ENV !== "production" || isHomologModeActive(env))
  );
}

export const HOMOLOG_WARNING = "MODO DE HOMOLOGAÇÃO ATIVO: login de teste habilitado";

/**
 * Camada (b): a aplicação recusa subir em produção com o login de teste ligado, salvo no modo de
 * homologação (ADR-024), que apenas registra um aviso no log.
 */
export function assertSafeAuthConfig(env: Env = process.env): void {
  const unsafe = unsafeProdVars(env);
  if (unsafe.length > 0) {
    throw new Error(
      `Configuração insegura em produção (APP_DEPLOY_ENV=production): ${unsafe.join(", ")}`,
    );
  }
  if (env.NODE_ENV !== "production") return;
  if (isOn(env.APP_HOMOLOG_MODE)) {
    if (env.AUTH_DEV_LOGIN === "true") console.warn(HOMOLOG_WARNING);
    return;
  }
  if (env.AUTH_DEV_LOGIN === "true") {
    throw new Error("AUTH_DEV_LOGIN não pode estar ativo em produção");
  }
}

/** Host aceito na homologação: local ou o host de APP_URL/AUTH_URL (sem exigir localhost/IP privado). */
export function isHomologLoginHost(hostHeader: string | null | undefined, env: Env = process.env) {
  if (isLocalHost(hostHeader)) return true;
  const name = hostnameOf(hostHeader);
  if (!name) return false;
  return [env.APP_URL, env.AUTH_URL].some((u) => !!u && hostnameOf(u) === name);
}

/** Aceita somente localhost, 127.0.0.1, [::1] e *.localhost (porta livre). */
export function isLocalHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  const name = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.replace(/:\d+$/, "");
  return (
    name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name.endsWith(".localhost")
  );
}

/**
 * Host aceito pelo login de teste: local OU um host de dev configurado (APP_PUBLIC_ORIGIN, APP_DEV_ORIGINS)
 * OU, em dev, IP privado/`*.local`. A trava de produção vale em qualquer host.
 */
export function isDevLoginHost(hostHeader: string | null | undefined, env: Env = process.env) {
  if (env.NODE_ENV === "production") return isHomologLoginHost(hostHeader, env);
  if (isLocalHost(hostHeader)) return true;
  return isAllowedDevHost(hostHeader, env);
}

const LOOPBACK_IP = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/**
 * Endpoint de apoio ao E2E: só localhost direto, nunca via túnel/proxy. O Next acrescenta `x-forwarded-*`
 * com valores locais; um proxy/túnel real traz Host ou IP de cliente não locais, e isso é recusado.
 */
export function isDirectLocalRequest(headers: Headers, env: Env = process.env): boolean {
  const homolog = isHomologModeActive(env);
  const ok = (h: string | null) => (homolog ? isHomologLoginHost(h, env) : isLocalHost(h));
  if (!ok(headers.get("host"))) return false;
  const fwdHost = headers.get("x-forwarded-host");
  if (fwdHost && !ok(fwdHost)) return false;
  const fwdFor = headers.get("x-forwarded-for");
  if (!homolog && fwdFor && !fwdFor.split(",").every((ip) => LOOPBACK_IP.test(ip.trim()))) {
    return false;
  }
  if (headers.has("forwarded")) return false;
  return true;
}

export const localPart = (email: string) => email.split("@")[0] ?? email;
