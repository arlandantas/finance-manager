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

describe("SDD-010 regras de CI: Money e predicado único de período", () => {
  it("formatBRL em tela ou componente falha; em Money/MoneyInput/lib/money/testes passa", () => {
    const code = `import { formatBRL } from "@/lib/money"; const x = formatBRL(1);`;
    expect(checkFile("src/app/(app)/home-screen.tsx", code)[0]?.rule).toBe("money-format");
    expect(checkFile("src/components/transaction-drawer.tsx", code)[0]?.rule).toBe("money-format");
    expect(
      checkFile("src/components/x.tsx", `new Intl.NumberFormat("pt-BR", { style: "currency" })`)[0]
        ?.rule,
    ).toBe("money-format");
    for (const f of [
      "src/components/money.tsx",
      "src/components/money-input.tsx",
      "src/lib/money.ts",
      "src/modules/split/hero.ts",
      "tests/unit/lib/money.test.ts",
    ]) {
      expect(checkFile(f, code).filter((v) => v.rule === "money-format")).toEqual([]);
    }
  });

  it("occurredOn com BETWEEN/gte/lte fora de ledger-where.ts falha", () => {
    expect(checkFile("src/modules/x/repo.ts", `occurredOn: { gte: a, lte: b }`)[0]?.rule).toBe(
      "period-predicate",
    );
    expect(
      checkFile("src/modules/transacoes/extrato.ts", `t."occurredOn" BETWEEN a AND b`)[0]?.rule,
    ).toBe("period-predicate");
    expect(
      checkFile("src/modules/transacoes/ledger-where.ts", `t."occurredOn" BETWEEN a AND b`),
    ).toEqual([]);
    expect(checkFile("tests/integration/x.int.test.ts", `occurredOn: { gte: a }`)).toEqual([]);
  });

  it("competenceOn com BETWEEN/gte/lte fora de ledger-where.ts também falha (US-040b)", () => {
    expect(checkFile("src/modules/x/repo.ts", `competenceOn: { gte: a, lte: b }`)[0]?.rule).toBe(
      "period-predicate",
    );
    expect(
      checkFile("src/modules/transacoes/extrato.ts", `t."competenceOn" BETWEEN a AND b`)[0]?.rule,
    ).toBe("period-predicate");
    expect(
      checkFile("src/modules/transacoes/ledger-where.ts", `t."competenceOn" BETWEEN a AND b`),
    ).toEqual([]);
    expect(checkFile("src/modules/x/repo.ts", `orderBy: [{ competenceOn: "asc" }]`)).toEqual([]);
  });

  it("ordenar ou comparar occurredOn de outra forma não é filtro de período", () => {
    expect(checkFile("src/modules/x/repo.ts", `orderBy: [{ occurredOn: "desc" }]`)).toEqual([]);
    expect(checkFile("src/modules/x/service.ts", `existing.occurredOn <= item.occurredOn`)).toEqual(
      [],
    );
  });
});
