import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// US-089 (SDD-030 §9.1-3): todo tipo de FamilyEvent do Prisma tem rótulo na tela da família e na união do DTO.
const enumValues = (() => {
  const src = readFileSync("prisma/schema.prisma", "utf8");
  const body = /enum FamilyEventType \{([^}]*)\}/.exec(src)?.[1] ?? "";
  return body
    .split("\n")
    .map((l) => l.replace(/\/\/.*/, "").trim())
    .filter(Boolean);
})();

describe("rótulos dos eventos da família", () => {
  const screen = readFileSync("src/app/(app)/familia/familia-screen.tsx", "utf8");
  const dto = readFileSync("src/modules/familia/schemas.ts", "utf8");
  it.each(enumValues)("%s tem rótulo e entra na união do DTO", (type) => {
    expect(screen).toContain(`${type}:`);
    expect(dto).toContain(`"${type}"`);
  });
  it("inclui CARD_PAYER_ACCOUNT_CHANGED", () => {
    expect(enumValues).toContain("CARD_PAYER_ACCOUNT_CHANGED");
  });
});
