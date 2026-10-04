export type HealthStatus = {
  status: "ok" | "degraded";
  checks: { database: "up" | "down" };
  timestamp: string;
};

/** Regra pura: recebe um "ping" do banco e devolve o estado. Sem dependência de framework. */
export async function checkHealth(
  pingDatabase: () => Promise<unknown>,
  now: () => Date = () => new Date(),
): Promise<HealthStatus> {
  let database: "up" | "down" = "up";
  try {
    await pingDatabase();
  } catch {
    database = "down";
  }
  return {
    status: database === "up" ? "ok" : "degraded",
    checks: { database },
    timestamp: now().toISOString(),
  };
}
