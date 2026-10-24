import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAuthorizedCron, listPurgeTasks } from "@/modules/cron/purge";
// @ts-expect-error módulo .mjs sem tipos
import { shouldMigrate } from "../../../scripts/vercel-build.mjs";

describe("EN-007 vercel-build", () => {
  it("migra só em produção", () => {
    expect(shouldMigrate({ VERCEL_ENV: "production" })).toBe(true);
    for (const e of [{}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }]) {
      expect(shouldMigrate(e)).toBe(false);
    }
  });

  it("package.json tem vercel-build e vercel.json agenda o expurgo diário", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["vercel-build"]).toBe("node scripts/vercel-build.mjs");
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(v.crons).toEqual([{ path: "/api/cron/purge", schedule: "0 7 * * *" }]);
  });
});

describe("EN-007 autenticação do cron", () => {
  const secret = "s".repeat(32);
  it("aceita só Bearer com o segredo exato", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCron(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCron(secret, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
  });
  it("segredo ausente/curto => sempre 401", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer curto", "curto")).toBe(false);
  });
  it("tarefas registradas incluem os expurgos de IA", () => {
    expect(listPurgeTasks()).toEqual(
      expect.arrayContaining(["ai:purge-usage", "ai:purge-analyses", "mcp:purge"]),
    );
  });
});
