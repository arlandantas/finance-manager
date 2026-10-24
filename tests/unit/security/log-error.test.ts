import { describe, expect, it } from "vitest";
import { describeError } from "@/lib/log-error";

describe("SEC-012 describeError: erro para log sem dado pessoal", () => {
  it("não inclui message nem a primeira linha do stack", () => {
    const e = Object.assign(
      new Error("Invalid `create()`: description: 'Farmácia da Maria R$ 123,45'"),
      {
        code: "P2002",
      },
    );
    const out = describeError(e);
    const text = JSON.stringify(out);
    expect(text).not.toContain("Farmácia");
    expect(text).not.toContain("123,45");
    expect(out.name).toBe("Error");
    expect(out.code).toBe("P2002");
    expect(out.stack).toMatch(/^\s+at /);
  });

  it("valor que não é Error vira só o tipo", () => {
    expect(describeError("segredo de string")).toEqual({ name: "string" });
  });
});
