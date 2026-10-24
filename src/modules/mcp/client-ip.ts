/**
 * IP do chamador para limites de taxa (SEC-005). Na Vercel `x-real-ip`/`x-forwarded-for` são escritos pela
 * plataforma (o valor do cliente é descartado). Fora dela (self-host sem proxy confiável) o cabeçalho é
 * forjável: o limite por IP vira só um freio de conveniência.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "unknown").slice(0, 64);
}
