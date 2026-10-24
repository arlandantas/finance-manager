import { isDevToolingEnabled, isDirectLocalRequest } from "@/lib/auth/dev-login-guard";
import { FAKE_SCENARIOS, type FakeScenario } from "@/modules/ia/fake-adapter";
import { getFakeAdapter } from "@/modules/ia/provider";

export const dynamic = "force-dynamic";

/**
 * Apoio a E2E (mesmas travas do login de teste, ADR-008/026): escolhe o cenário do provedor simulado.
 * 404 fora do ferramental de dev (inclui produção); 403 fora de localhost.
 * Corpo: `{ "scenario": "ok" | "unavailable" | ... }`; `{ "reset": true }` zera cenário e chamadas.
 */
export async function POST(req: Request): Promise<Response> {
  if (!isDevToolingEnabled()) return new Response(null, { status: 404 });
  if (!isDirectLocalRequest(req.headers)) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "Apenas em localhost." } },
      { status: 403 },
    );
  }
  const fake = getFakeAdapter();
  if (!fake) return new Response(null, { status: 404 });
  let raw: { scenario?: unknown; reset?: unknown };
  try {
    raw = (await req.json()) as typeof raw;
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "Corpo inválido." } },
      { status: 400 },
    );
  }
  if (raw.reset === true) {
    fake.reset();
    return Response.json({ scenario: fake.scenario, calls: 0 });
  }
  if (typeof raw.scenario !== "string" || !FAKE_SCENARIOS.includes(raw.scenario as FakeScenario)) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Cenário inválido." } },
      { status: 400 },
    );
  }
  fake.scenario = raw.scenario as FakeScenario;
  return Response.json({ scenario: fake.scenario, calls: fake.calls.length });
}
