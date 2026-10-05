import { describe, expect, it } from "vitest";
import {
  insufficient,
  type SourceCandidate,
  suggestSourceAccount,
} from "@/modules/contas/suggest-source";

const acc = (
  id: string,
  owner: string,
  balance: number,
  usage = 0,
  archived = false,
): SourceCandidate => ({
  id,
  ownerMemberId: owner,
  balanceInCents: balance,
  usageCountByMe: usage,
  archived,
});
const L = "lucas";
const M = "mariana";
const base = [acc("dinheiro", L, 9000), acc("itau-l", L, 300000), acc("itau-m", M, 650000)];
const run = (amount: number, accounts = base) =>
  suggestSourceAccount({ amountInCents: amount, ownerMemberId: L, accounts });

describe("US-023 suggestSourceAccount (SDD-013 §4.1)", () => {
  it("A1: titular com saldo suficiente (Dinheiro não cobre)", () => {
    expect(run(47900)).toEqual({ accountId: "itau-l", reason: "OWNER_ENOUGH", sufficient: true });
  });
  it("A2: titular não cobre => outra conta com saldo", () => {
    expect(run(400000)).toEqual({ accountId: "itau-m", reason: "OTHER_ENOUGH", sufficient: true });
  });
  it("A3: ninguém cobre => maior saldo, insuficiente", () => {
    expect(run(900000)).toEqual({
      accountId: "itau-m",
      reason: "HIGHEST_BALANCE",
      sufficient: false,
    });
  });
  it("A4: mais usada vence maior saldo", () => {
    const r = run(47900, [acc("itau-l", L, 300000, 5), acc("bradesco-l", L, 350000, 1)]);
    expect(r.accountId).toBe("itau-l");
  });
  it("A5: mesmo uso => maior saldo", () => {
    const r = run(47900, [acc("itau-l", L, 300000, 2), acc("bradesco-l", L, 350000, 2)]);
    expect(r.accountId).toBe("bradesco-l");
  });
  it("A6: mesmo uso e saldo => menor id", () => {
    const r = run(100, [acc("b", L, 5000, 1), acc("a", L, 5000, 1)]);
    expect(r.accountId).toBe("a");
  });
  it("A7: conta arquivada nunca é sugerida", () => {
    const r = run(47900, [acc("itau-l", L, 300000, 9, true), acc("itau-m", M, 650000)]);
    expect(r).toEqual({ accountId: "itau-m", reason: "OTHER_ENOUGH", sufficient: true });
  });
  it("A8: única conta sem saldo => ela mesma, insuficiente", () => {
    expect(run(47900, [acc("dinheiro", L, 9000)])).toEqual({
      accountId: "dinheiro",
      reason: "HIGHEST_BALANCE",
      sufficient: false,
    });
  });
  it("A9: insufficient marca saldo menor que o valor", () => {
    expect(insufficient(acc("d", L, 9000), 47900)).toBe(true);
    expect(insufficient(acc("d", L, 47900), 47900)).toBe(false);
  });
  it("A10: lista vazia => NONE", () => {
    expect(run(100, [])).toEqual({ accountId: null, reason: "NONE", sufficient: false });
    expect(run(100, [acc("x", L, 1, 0, true)]).reason).toBe("NONE");
  });
  it("saldo exatamente igual ao valor é suficiente; não muta a lista de entrada", () => {
    const input = [acc("b", L, 500), acc("a", L, 500)];
    const copy = [...input];
    expect(run(500, input).sufficient).toBe(true);
    expect(input).toEqual(copy);
  });
});
