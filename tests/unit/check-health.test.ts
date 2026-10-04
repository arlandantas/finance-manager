import { describe, expect, it } from "vitest";
import { checkHealth } from "@/modules/health/check-health";

const fixed = () => new Date("2026-01-01T00:00:00Z");

describe("checkHealth", () => {
  it("retorna ok quando o banco responde", async () => {
    const r = await checkHealth(async () => 1, fixed);
    expect(r).toEqual({
      status: "ok",
      checks: { database: "up" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
  });

  it("retorna degraded quando o banco falha", async () => {
    const r = await checkHealth(async () => {
      throw new Error("boom");
    }, fixed);
    expect(r.status).toBe("degraded");
    expect(r.checks.database).toBe("down");
  });
});
