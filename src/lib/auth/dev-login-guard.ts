// Funções puras e sem dependências de Node (usáveis em instrumentation/Edge).
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

export const localPart = (email: string) => email.split("@")[0] ?? email;
