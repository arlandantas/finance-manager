import { isDevToolingEnabled, isDirectLocalRequest } from "@/lib/auth/dev-login-guard";
import { setDevClockOverride } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Apoio a E2E (mesma proteção do login de teste, ADR-008): fixa o "hoje" do servidor por cenário.
 * 404 sem AUTH_DEV_LOGIN, ou em produção sem APP_HOMOLOG_MODE (ADR-024); 403 fora de localhost (na homologação, também aceita o host de APP_URL/AUTH_URL). Em produção o relógio ignora o override.
 * Corpo: `{ "now": "2026-10-15T15:00:00Z" }` ou `{ "now": null }` para restaurar.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isDevToolingEnabled()) return new Response(null, { status: 404 });
  if (!isDirectLocalRequest(req.headers)) {
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
