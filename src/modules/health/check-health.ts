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
