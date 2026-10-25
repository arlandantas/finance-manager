import { unsafeProdVars } from "@/lib/auth/dev-login-guard";

export type HealthStatus = {
  status: "ok" | "degraded" | "unsafe_config";
  checks: { database: "up" | "down" };
  timestamp: string;
};

/** Regra pura: recebe um "ping" do banco e devolve o estado. Sem dependência de framework. */
export async function checkHealth(
  pingDatabase: () => Promise<unknown>,
  now: () => Date = () => new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<HealthStatus> {
  const unsafe = unsafeProdVars(env);
  let database: "up" | "down" = "up";
  try {
    await pingDatabase();
  } catch {
    database = "down";
  }
  return {
    status: unsafe.length > 0 ? "unsafe_config" : database === "up" ? "ok" : "degraded",
    checks: { database },
    timestamp: now().toISOString(),
  };
}

export type PublicHealthStatus = { status: "ok" | "degraded"; timestamp: string };

/**
 * Visão pública (SEC-022): anônimos só distinguem ok de não-ok. `unsafe_config` (sinal de variável de teste
 * em produção) vira `degraded` e `checks` NÃO é exposto: "degraded" com banco "up" só ocorreria com
 * `unsafe_config`, então o detalhe do banco entregaria o motivo. O detalhe completo exige o segredo do
 * cron (`Authorization: Bearer`).
 */
export function toPublicHealth(h: HealthStatus): PublicHealthStatus {
  return { status: h.status === "ok" ? "ok" : "degraded", timestamp: h.timestamp };
}
