import { isDevLoginEnabled, isLocalHost } from "@/lib/auth/dev-login-guard";
import { setDevClockOverride } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Apoio a E2E (mesma proteção do login de teste, ADR-008): fixa o "hoje" do servidor por cenário.
 * 404 quando AUTH_DEV_LOGIN não está ligado ou em produção; 403 fora de localhost.
 * Corpo: `{ "now": "2026-10-15T15:00:00Z" }` ou `{ "now": null }` para restaurar.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isDevLoginEnabled()) return new Response(null, { status: 404 });
  if (!isLocalHost(req.headers.get("host"))) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Apenas em localhost." } },
      { status: 403 },
    );
  }
  let raw: { now?: unknown };
  try {
    raw = (await req.json()) as { now?: unknown };
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Corpo inválido." } },
      { status: 400 },
    );
  }
  if (raw.now === null) {
    setDevClockOverride(null);
    return Response.json({ now: null });
  }
  if (typeof raw.now !== "string" || Number.isNaN(new Date(raw.now).getTime())) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Data inválida." } },
      { status: 400 },
    );
  }
  setDevClockOverride(raw.now);
  return Response.json({ now: raw.now });
}
