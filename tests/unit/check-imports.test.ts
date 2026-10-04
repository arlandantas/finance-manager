import { describe, expect, it } from "vitest";
import { checkFile, checkProject } from "../../scripts/check-imports";

describe("EN-001 check:imports (ADR-013)", () => {
  it("proíbe @/lib/db em serviço, componente e rota", () => {
    for (const file of [
      "src/modules/contas/service.ts",
      "src/app/(app)/contas/page.tsx",
      "src/app/api/v1/accounts/route.ts",
    ]) {
      const v = checkFile(file, `import { getDb } from "@/lib/db";`);
      expect(v).toHaveLength(1);
      expect(v[0]?.rule).toBe("db-import");
    }
  });

  it("permite @/lib/db em repo.ts, ledger*.ts, src/lib/api e testes", () => {
    for (const file of [
      "src/modules/contas/repo.ts",
      "src/modules/contas/ledger-queries.ts",
      "src/lib/api/with-api.ts",
      "tests/support/factories.ts",
      "prisma/seed.ts",
    ]) {
      expect(checkFile(file, `import { getDb } from "@/lib/db";`)).toEqual([]);
    }
  });

  it("regras puras não importam next/Prisma nem usam relógio global", () => {
    expect(
      checkFile("src/lib/money.ts", `import { NextResponse } from "next/server";`)[0]?.rule,
    ).toBe("pure-imports");
    expect(checkFile("src/lib/period.ts", `const d = new Date();`)[0]?.rule).toBe("pure-clock");
    expect(checkFile("src/modules/split/settlement.ts", `const t = Date.now();`)[0]?.rule).toBe(
      "pure-clock",
    );
    expect(checkFile("src/lib/dates.ts", `const d = new Date(Date.UTC(2020, 0, 1));`)).toEqual([]);
  });

  it("o projeto atual está conforme", () => {
    expect(checkProject()).toEqual([]);
  });
});
