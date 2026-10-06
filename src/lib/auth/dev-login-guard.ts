// Funções puras e sem dependências de Node (usáveis em instrumentation/Edge).
import { hostnameOf, isAllowedDevHost, isPrivateIPv4 } from "@/lib/dev-origins";

type Env = Record<string, string | undefined>;

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const isLoopbackName = (h: string | undefined) => !!h && LOOPBACK_NAMES.has(h);
const isLoopbackOrPrivate = (h: string | undefined) =>
  !!h && (isLoopbackName(h) || isPrivateIPv4(h));
const isOn = (v: string | undefined) => v?.trim().toLowerCase() === "true";

/**
 * ADR-024: condições do modo de homologação rápida (build de produção + login de teste). Devolve a lista
 * de violações; vazia = modo válido. Só faz sentido com NODE_ENV=production e APP_HOMOLOG_MODE=true.
 */
export function homologModeViolations(env: Env = process.env): string[] {
  const v: string[] = [];
  if (env.NODE_ENV !== "production") v.push("NODE_ENV precisa ser production");
  if (!isOn(env.APP_HOMOLOG_MODE)) v.push("APP_HOMOLOG_MODE precisa ser true");
  const bind = hostnameOf(env.HOSTNAME);
  if (!isLoopbackOrPrivate(bind)) {
    v.push(`HOSTNAME (bind) precisa ser loopback ou IP privado, recebido "${env.HOSTNAME ?? ""}"`);
  }
  const dbHost = env.DATABASE_URL?.includes("://") ? hostnameOf(env.DATABASE_URL) : undefined;
  if (!isLoopbackName(dbHost)) v.push("DATABASE_URL precisa apontar para localhost/127.0.0.1/::1");
  for (const key of ["APP_URL", "AUTH_URL"] as const) {
    const value = env[key]?.trim() ?? "";
    if (!value.toLowerCase().startsWith("http://") || !isLoopbackOrPrivate(hostnameOf(value))) {
      v.push(`${key} precisa ser http:// em localhost ou IP privado`);
    }
  }
  if (env.AUTH_GOOGLE_ID?.trim() || env.AUTH_GOOGLE_SECRET?.trim()) {
    v.push("AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET precisam estar vazios (credencial real = produção)");
  }
  return v;
}

/** ADR-024: homologação rápida ativa (produção + flag + login de teste + todas as condições locais). */
export function isHomologModeActive(env: Env = process.env): boolean {
  return env.AUTH_DEV_LOGIN === "true" && homologModeViolations(env).length === 0;
}

/** ADR-008: só com AUTH_DEV_LOGIN=true e fora de produção, ou no modo de homologação válido (ADR-024). */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  if (env.AUTH_DEV_LOGIN !== "true") return false;
  return env.NODE_ENV !== "production" || isHomologModeActive(env);
}

/** Ferramentas só de dev/E2E (ex.: /api/dev/clock): nunca em build de produção, nem na homologação. */
export function isDevToolingEnabled(env: Env = process.env): boolean {
  return env.AUTH_DEV_LOGIN === "true" && env.NODE_ENV !== "production";
}

/**
 * Camada (b): a aplicação recusa subir em produção com o login de teste ligado, salvo no modo de
 * homologação (ADR-024) com TODAS as condições atendidas. APP_HOMOLOG_MODE=true em produção é sempre
 * validado (recusa subir com bind/banco/URL não locais), mesmo sem o login de teste.
 */
export function assertSafeAuthConfig(env: Env = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (isOn(env.APP_HOMOLOG_MODE)) {
    const v = homologModeViolations(env);
    if (v.length > 0) {
      throw new Error(`APP_HOMOLOG_MODE recusado (ADR-024): ${v.join("; ")}`);
    }
    return;
  }
  if (env.AUTH_DEV_LOGIN === "true") {
    throw new Error("AUTH_DEV_LOGIN não pode estar ativo em produção");
  }
}

/**
 * Host aceito pelo login de teste na homologação: localhost ou o próprio IP privado do bind (HOSTNAME).
 */
export function isHomologLoginHost(hostHeader: string | null | undefined, env: Env = process.env) {
  if (isLocalHost(hostHeader)) return true;
  const name = hostnameOf(hostHeader);
  return !!name && isPrivateIPv4(name) && name === hostnameOf(env.HOSTNAME);
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
export function isDirectLocalRequest(headers: Headers): boolean {
  if (!isLocalHost(headers.get("host"))) return false;
  const fwdHost = headers.get("x-forwarded-host");
  if (fwdHost && !isLocalHost(fwdHost)) return false;
  const fwdFor = headers.get("x-forwarded-for");
  if (fwdFor && !fwdFor.split(",").every((ip) => LOOPBACK_IP.test(ip.trim()))) return false;
  if (headers.has("forwarded")) return false;
  return true;
}

export const localPart = (email: string) => email.split("@")[0] ?? email;
