import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLOR_LABEL,
  ACCOUNT_COLORS,
  type AccountColor,
  accountColorSchema,
  pickNextColor,
} from "@/modules/contas/colors";

describe("US-050 pickNextColor (SDD-017 §4.1)", () => {
  it("C1 vazio => BLUE", () => expect(pickNextColor([])).toBe("BLUE"));
  it("C2 [BLUE, GREEN] => PURPLE", () => expect(pickNextColor(["BLUE", "GREEN"])).toBe("PURPLE"));
  it("C3 [GREEN, PURPLE] => BLUE (preenche o buraco)", () =>
    expect(pickNextColor(["GREEN", "PURPLE"])).toBe("BLUE"));
  it("C4 as 10 cores uma vez => BLUE", () =>
    expect(pickNextColor([...ACCOUNT_COLORS])).toBe("BLUE"));
  it("C5 BLUE x2 e as demais x1 => GREEN", () =>
    expect(pickNextColor([...ACCOUNT_COLORS, "BLUE"])).toBe("GREEN"));
  it("C6 BLUE x2, GREEN x2, demais x1 => PURPLE", () =>
    expect(pickNextColor([...ACCOUNT_COLORS, "BLUE", "GREEN"])).toBe("PURPLE"));

  it("propriedade (1000 casos): na paleta, nunca usada se há livre, determinística", () => {
    let seed = 20261031;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 1000; i++) {
      const n = Math.floor(rnd() * 25);
      const used: AccountColor[] = Array.from(
        { length: n },
        () => ACCOUNT_COLORS[Math.floor(rnd() * ACCOUNT_COLORS.length)] as AccountColor,
      );
      const got = pickNextColor(used);
      expect(ACCOUNT_COLORS).toContain(got);
      expect(pickNextColor([...used])).toBe(got);
      if (new Set(used).size < ACCOUNT_COLORS.length) expect(used).not.toContain(got);
    }
  });
});

describe("US-050 paleta", () => {
  it("10 cores com nome em português e schema fechado", () => {
    expect(ACCOUNT_COLORS).toHaveLength(10);
    expect(ACCOUNT_COLORS.map((c) => ACCOUNT_COLOR_LABEL[c])).toEqual([
      "Azul",
      "Verde",
      "Roxo",
      "Laranja",
      "Rosa",
      "Turquesa",
      "Vermelho",
      "Amarelo",
      "Cinza",
      "Marrom",
    ]);
    expect(accountColorSchema.safeParse("BLUE").success).toBe(true);
    const bad = accountColorSchema.safeParse("#ff0000");
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe("Escolha uma cor");
  });
});
