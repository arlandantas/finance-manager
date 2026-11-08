import { describe, expect, it } from "vitest";
import {
  initialSplitPick,
  type SplitPick,
  splitPickReducer,
} from "@/components/use-split-default-from-category";

const NONE = initialSplitPick("NONE");

describe("splitPickReducer (US-044)", () => {
  it("categoria com defaultSplit e sem escolha manual => RULE", () => {
    const s = splitPickReducer(NONE, { type: "category", defaultSplit: true });
    expect(s).toMatchObject({ mode: "RULE", userPicked: false });
  });

  it("categoria comum volta ao padrão do modo quando nada foi escolhido à mão", () => {
    const rule = splitPickReducer(NONE, { type: "category", defaultSplit: true });
    expect(splitPickReducer(rule, { type: "category", defaultSplit: false }).mode).toBe("NONE");
  });

  it("escolha manual liga userPicked e não é sobrescrita pela categoria", () => {
    const picked = splitPickReducer(NONE, { type: "pick", mode: "NONE" });
    expect(picked.userPicked).toBe(true);
    const after = splitPickReducer(picked, { type: "category", defaultSplit: true });
    expect(after.mode).toBe("NONE");
  });

  it("categoria sem defaultSplit não desliga RULE escolhido à mão", () => {
    const picked = splitPickReducer(NONE, { type: "pick", mode: "RULE" });
    expect(splitPickReducer(picked, { type: "category", defaultSplit: false }).mode).toBe("RULE");
  });

  it("trocar o modo da porta só mexe no padrão não escolhido; reset limpa tudo", () => {
    const later = splitPickReducer(NONE, { type: "base", base: "RULE" });
    expect(later.mode).toBe("RULE");
    const picked: SplitPick = splitPickReducer(NONE, { type: "pick", mode: "NONE" });
    expect(splitPickReducer(picked, { type: "base", base: "RULE" }).mode).toBe("NONE");
    expect(splitPickReducer(picked, { type: "reset", base: "NONE" })).toEqual(NONE);
  });
});
