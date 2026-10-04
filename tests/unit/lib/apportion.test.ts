import { describe, expect, it } from "vitest";
import { apportion } from "@/lib/apportion";

const run = (total: number, weights: number[], ordinals = weights.map((_, i) => i)) => {
  const parts = weights.map((weight, i) => ({
    key: `k${i}`,
    weight,
    ordinal: ordinals[i] as number,
  }));
  const out = apportion(total, parts);
  return parts.map((p) => out[p.key] as number);
};

// Gerador pseudoaleatório com semente fixa (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("EN-001 apportion: vetores A1..A7 (SDD-002 §4.6)", () => {
  it("A1", () => expect(run(10001, [5000, 5000])).toEqual([5001, 5000]));
  it("A2", () => expect(run(100, [1, 1, 1])).toEqual([34, 33, 33]));
  it("A3", () => expect(run(100001, [3334, 3333, 3333])).toEqual([33341, 33330, 33330]));
  it("A4", () => expect(run(0, [3, 7])).toEqual([0, 0]));
  it("A5: menor ordinal recebe o centavo", () => expect(run(1, [1, 1], [1, 0])).toEqual([0, 1]));
  it("A6", () => expect(run(100, [6000, 4000])).toEqual([60, 40]));
  it("A7", () => expect(run(7, [0, 10000])).toEqual([0, 7]));
});

describe("EN-001 apportion: erros e propriedades", () => {
  it("todos os pesos zero lança RangeError", () => {
    expect(() => run(10, [0, 0])).toThrow(RangeError);
  });

  it("propriedades com 1000+ casos aleatórios (semente fixa)", () => {
    const rand = rng(42);
    for (let c = 0; c < 1500; c++) {
      const n = 1 + Math.floor(rand() * 5);
      const total = Math.floor(rand() * 1_000_000);
      const weights = Array.from({ length: n }, () => Math.floor(rand() * 10000));
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const W = weights.reduce((a, b) => a + b, 0);
      const out = run(total, weights);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      out.forEach((v, i) => {
        const exact = (total * (weights[i] as number)) / W;
        expect(v === Math.floor(exact) || v === Math.ceil(exact)).toBe(true);
      });
      // ordem embaralhada (mantendo ordinais) => mesma saída por chave
      const parts = weights.map((weight, i) => ({ key: `k${i}`, weight, ordinal: i }));
      const shuffled = [...parts].sort(() => rand() - 0.5);
      expect(apportion(total, shuffled)).toEqual(apportion(total, parts));
    }
  });

  it("aceita totais grandes sem estouro (BigInt interno)", () => {
    const out = run(9_999_999_999, [9999, 1]);
    expect(out[0]! + out[1]!).toBe(9_999_999_999);
  });
});
