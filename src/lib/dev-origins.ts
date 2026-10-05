// Origens de desenvolvimento aceitas além de localhost. Módulo puro (sem Node/Next/Prisma): usado por
// next.config.ts, guard do login de teste, CSRF e links de convite. NUNCA vale em produção.
type Env = {
  NODE_ENV?: string;
  APP_PUBLIC_ORIGIN?: string;
  APP_DEV_ORIGINS?: string;
  APP_DEV_LAN_AUTO?: string;
};

/** Extrai o hostname (minúsculo, sem porta/esquema) de "host", "host:porta" ou "http(s)://host[:porta]". */
export function hostnameOf(value: string | null | undefined): string | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) return undefined;
  try {
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    return url.hostname.replace(/^\[|\]$/g, "") || undefined;
  } catch {
    return undefined;
  }
}

/** IPv4 privado RFC1918 (10/8, 172.16/12, 192.168/16). */
export function isPrivateIPv4(hostname: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number) as [number, number, number, number];
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Rede local automática: IP privado RFC1918 ou nome mDNS `*.local`. */
export function isLanHostname(hostname: string): boolean {
  return isPrivateIPv4(hostname) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(hostname);
}

const isProduction = (env: Env) => env.NODE_ENV === "production";
/** Liberação automática de IP privado/`*.local` em dev. Desligue com APP_DEV_LAN_AUTO=false. */
const lanAutoEnabled = (env: Env) => env.APP_DEV_LAN_AUTO?.trim().toLowerCase() !== "false";

/** Hostnames explícitos: APP_PUBLIC_ORIGIN (túnel) + APP_DEV_ORIGINS (lista separada por vírgula). */
export function explicitDevHosts(env: Env): string[] {
  const items = [env.APP_PUBLIC_ORIGIN ?? "", ...(env.APP_DEV_ORIGINS ?? "").split(",")];
  const hosts = items.map(hostnameOf).filter((h): h is string => !!h);
  return [...new Set(hosts)];
}

/** Aceita um hostname (sem porta) como origem de dev: lista explícita ou LAN automática. Falso em produção. */
export function isAllowedDevHostname(hostname: string | undefined, env: Env): boolean {
  if (!hostname || isProduction(env)) return false;
  if (explicitDevHosts(env).includes(hostname)) return true;
  return lanAutoEnabled(env) && isLanHostname(hostname);
}

/** Aceita o valor de um cabeçalho Host (`host[:porta]`) ou Origin (URL). */
export function isAllowedDevHost(value: string | null | undefined, env: Env): boolean {
  return isAllowedDevHostname(hostnameOf(value), env);
}

/** Entradas para `allowedDevOrigins` do Next (hostname; `*` = um rótulo, `**` = um ou mais). */
export function allowedDevOriginsFor(env: Env): string[] {
  if (isProduction(env)) return [];
  const lan = lanAutoEnabled(env)
    ? [
        "10.*.*.*",
        ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
        "192.168.*.*",
        "**.local",
      ]
    : [];
  return [...new Set([...explicitDevHosts(env), ...lan])];
}
