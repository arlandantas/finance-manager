// Funções puras e sem dependências de Node (usáveis em instrumentation/Edge).
import { isAllowedDevHost } from "@/lib/dev-origins";

type Env = Record<string, string | undefined>;

/** ADR-008: só com AUTH_DEV_LOGIN=true e fora de produção. */
export function isDevLoginEnabled(env: Env = process.env): boolean {
  return env.AUTH_DEV_LOGIN === "true" && env.NODE_ENV !== "production";
}

/** Camada (b): a aplicação recusa subir em produção com o login de teste ligado. */
export function assertSafeAuthConfig(env: Env = process.env): void {
  if (env.NODE_ENV === "production" && env.AUTH_DEV_LOGIN === "true") {
    throw new Error("AUTH_DEV_LOGIN não pode estar ativo em produção");
  }
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
