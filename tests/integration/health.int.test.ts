import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { checkHealth } from "@/modules/health/check-health";

const db = createPrismaClient(process.env.TEST_DATABASE_URL);

describe("banco de teste (Postgres real)", () => {
  afterAll(() => db.$disconnect());

  it("responde ao ping e o health fica ok", async () => {
    const health = await checkHealth(() => db.$queryRaw`SELECT 1`);
    expect(health.status).toBe("ok");
  });

  it("migração baseline aplicada: SystemInfo aceita gravação", async () => {
    const row = await db.systemInfo.upsert({
      where: { key: "int-test" },
      update: { value: "2" },
      create: { key: "int-test", value: "1" },
    });
    expect(row.key).toBe("int-test");
  });
});
