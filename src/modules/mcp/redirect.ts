// SDD-024 §4.9: comparação de redirect_uri. Igualdade exata, exceto loopback (porta ignorada).
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parse(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase());
}

/** `redirect_uri` aceitável para registro: https, ou http loopback (nada de http em host público). */
export function isAcceptableRedirectUri(raw: string): boolean {
  const u = parse(raw);
  if (!u || u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && isLoopbackHost(u.hostname);
}

export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  const a = parse(registered);
  const b = parse(presented);
  if (!a || !b) return false;
  if (a.protocol !== "http:" || b.protocol !== "http:") return false;
  if (!isLoopbackHost(a.hostname) || !isLoopbackHost(b.hostname)) return false;
  return (
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}

export function redirectHostOf(raw: string): string {
  return parse(raw)?.host ?? raw;
}
