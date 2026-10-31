import { describe, expect, it } from "vitest";
import { type AccountBalance, buildByAccount } from "@/modules/previstas/by-account";
import type { PayableItemDTO } from "@/modules/previstas/schemas";
import { mulberry32 } from "../../support/prng";

let seq = 0;
const item = (accountId: string | null, cents: number): PayableItemDTO => ({
  type: "PLANNED",
  id: `i${++seq}`,
  title: `P${seq}`,
  dueOn: "2026-10-20",
  amountInCents: cents,
  isOverdue: false,
  responsible: null,
  isSharedExpense: true,
  invoiceStatus: null,
  isRecurring: false,
  paymentAccountName: null,
  paymentAccountId: accountId,
  href: "",
});
const acc = (id: string, name: string, balance: number, o: Partial<AccountBalance> = {}) => ({
  id,
  name,
  archived: false,
  excludeFromAvailable: false,
  balanceInCents: balance,
  ...o,
});
const names = (r: ReturnType<typeof buildByAccount>) => r.rows.map((x) => x.account?.name ?? null);

describe("buildByAccount (SDD-029 §8.1)", () => {
  it("vetores do Gherkin: previsto positivo e falta", () => {
    const ok = buildByAccount([item("c", 65000), item("c", 12000)], [acc("c", "Corrente", 100000)]);
    expect(ok.rows[0]).toMatchObject({
      balanceInCents: 100000,
      dueInCents: 77000,
      itemCount: 2,
      projectedInCents: 23000,
      shortfallInCents: 0,
    });
    const falta = buildByAccount([item("c", 77000)], [acc("c", "Corrente", 50000)]);
    expect(falta.rows[0]).toMatchObject({ projectedInCents: -27000, shortfallInCents: 27000 });
  });

  it("'Sem conta definida': só com a pagar, saldo/previsto nulos, sempre por último", () => {
    expect(buildByAccount([], [acc("c", "Corrente", 0)]).rows).toEqual([]);
    const r = buildByAccount([item(null, 10000), item("c", 90000)], [acc("c", "Corrente", 1000)]);
    expect(names(r)).toEqual(["Corrente", null]); // Corrente falta e ainda assim vem antes
    expect(r.rows[1]).toMatchObject({
      account: null,
      balanceInCents: null,
      dueInCents: 10000,
      projectedInCents: null,
      shortfallInCents: 0,
    });
  });

  it("R5: quais contas viram linha", () => {
    const accounts = [
      acc("a", "Ativa zerada", 0),
      acc("b", "Ativa com saldo", 500),
      acc("r", "Reserva sem a pagar", 900, { excludeFromAvailable: true }),
      acc("r2", "Reserva com a pagar", 900, { excludeFromAvailable: true }),
      acc("x", "Arquivada com saldo", 900, { archived: true }),
      acc("x2", "Arquivada com a pagar", 0, { archived: true }),
    ];
    const r = buildByAccount([item("r2", 100), item("x2", 200)], accounts);
    expect(new Set(names(r))).toEqual(
      new Set(["Ativa com saldo", "Reserva com a pagar", "Arquivada com a pagar"]),
    );
    const byName = Object.fromEntries(r.rows.map((x) => [x.account?.name, x.account]));
    expect(byName["Reserva com a pagar"]?.excludeFromAvailable).toBe(true);
    expect(byName["Arquivada com a pagar"]?.archived).toBe(true);
  });

  it("R7: previsto crescente, nome pt-BR, depois id; negativos antes dos positivos", () => {
    const r = buildByAccount(
      [item("z", 5000)],
      [
        acc("1", "Poupança", 100),
        acc("2", "Álamo", 100),
        acc("3", "Zeta", 100),
        acc("z", "Corrente", 1000), // previsto -4000
        acc("0", "Beta", 100),
      ],
    );
    expect(names(r)).toEqual(["Corrente", "Álamo", "Beta", "Poupança", "Zeta"]);
    const ties = buildByAccount([], [acc("b", "Igual", 100), acc("a", "Igual", 100)]);
    expect(ties.rows.map((x) => x.account?.id)).toEqual(["a", "b"]);
  });

  it("R4: previsto zero não é falta; centavos grandes sem perda", () => {
    expect(buildByAccount([item("c", 500)], [acc("c", "C", 500)]).rows[0]).toMatchObject({
      projectedInCents: 0,
      shortfallInCents: 0,
    });
    const big = 3_000_000_000;
    expect(buildByAccount([item("c", big + 1)], [acc("c", "C", big)]).rows[0]).toMatchObject({
      projectedInCents: -1,
      shortfallInCents: 1,
    });
  });

  it("extras (US-051/US-100) somam, ligam as colunas e listam a conta", () => {
    const base = buildByAccount([item("c", 100)], [acc("c", "C", 1000)]);
    expect(base.columns).toEqual({ toReceive: false, plannedTransfers: false });
    const extras = new Map([["c", { toReceive: 300, plannedTransfers: -50 }]]);
    const r = buildByAccount([item("c", 100)], [acc("c", "C", 1000)], extras);
    expect(r.rows[0]).toMatchObject({ projectedInCents: 1150 });
    expect(r.columns).toEqual({ toReceive: true, plannedTransfers: true });
    const reserve = buildByAccount(
      [],
      [acc("r", "R", 0, { excludeFromAvailable: true })],
      new Map([["r", { toReceive: 10, plannedTransfers: 0 }]]),
    );
    expect(names(reserve)).toEqual(["R"]);
  });

  it("R1 defesa: conta desconhecida cai em 'Sem conta definida'", () => {
    const r = buildByAccount([item("fantasma", 700)], [acc("c", "C", 0)]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ account: null, dueInCents: 700, itemCount: 1 });
  });

  it("propriedade (200 casos): Σ due = Σ itens; Σ contagem = n; sem item duplicado; falta = max(0,-previsto)", () => {
    const rnd = mulberry32(60);
    for (let n = 0; n < 200; n++) {
      const accounts = Array.from({ length: Math.floor(rnd() * 6) }, (_, k) =>
        acc(`a${k}`, `Conta ${k}`, Math.floor(rnd() * 400000) - 100000, {
          archived: rnd() < 0.2,
          excludeFromAvailable: rnd() < 0.2,
        }),
      );
      const items = Array.from({ length: Math.floor(rnd() * 15) }, () => {
        const pick = Math.floor(rnd() * (accounts.length + 2)); // inclui null e desconhecido
        const id = pick < accounts.length ? `a${pick}` : pick === accounts.length ? null : "zz";
        return item(id, 1 + Math.floor(rnd() * 200000));
      });
      const r = buildByAccount(items, accounts);
      expect(r.rows.reduce((s, x) => s + x.dueInCents, 0)).toBe(
        items.reduce((s, x) => s + x.amountInCents, 0),
      );
      expect(r.rows.reduce((s, x) => s + x.itemCount, 0)).toBe(items.length);
      const keys = r.rows.map((x) => x.account?.id ?? "none");
      expect(new Set(keys).size).toBe(keys.length);
      for (const x of r.rows)
        expect(x.shortfallInCents).toBe(Math.max(0, -(x.projectedInCents ?? 0)));
      if (r.rows.some((x) => x.account === null)) expect(r.rows.at(-1)?.account).toBeNull();
    }
  });
});
