import { describe, expect, it } from "vitest";
import {
  admits,
  buildPendingItem,
  type InfiniteLedger,
  insertPending,
  type LedgerPageData,
  type PendingLookups,
} from "@/modules/transacoes/optimistic";
import type { TransactionDTO } from "@/modules/transacoes/schemas";

const lucas = { id: "m-lucas", name: "Lucas Silva", image: null };
const mariana = { id: "m-mariana", name: "Mariana Silva", image: null };
const nubank = { id: "a-nubank", name: "Nubank Conjunta" };
const itau = { id: "a-itau", name: "Itaú Mariana" };
const mercado = {
  id: "c-mercado",
  name: "Supermercado",
  icon: "shopping-cart",
  kind: "EXPENSE" as const,
  archived: false,
};
const salario = {
  id: "c-salario",
  name: "Salário",
  icon: "wallet",
  kind: "INCOME" as const,
  archived: false,
};

const lookups: PendingLookups = {
  today: "2026-10-04",
  me: lucas,
  accounts: [nubank, itau],
  categories: [mercado, salario],
  members: [lucas, mariana],
  now: new Date("2026-10-04T15:00:00Z"),
  key: "k1",
};

const existing = (id: string, occurredOn: string): TransactionDTO => ({
  id,
  type: "EXPENSE",
  direction: "DEBIT",
  amountInCents: 1000,
  occurredOn,
  competenceOn: occurredOn,
  installment: null,
  description: id,
  note: null,
  account: nubank,
  card: null,
  invoice: null,
  category: mercado,
  payer: lucas,
  author: lucas,
  updatedBy: null,
  isSharedExpense: true,
  transferGroupId: null,
  plannedExpenseId: null,
  isSettlement: false,
  counterpartAccount: null,
  version: 1,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
  deletedAt: null,
  deletionReason: null,
});

const page = (items: TransactionDTO[], over: Partial<LedgerPageData> = {}): LedgerPageData => ({
  items,
  nextCursor: null,
  period: { key: "2026-10", start: "2026-10-01", end: "2026-10-31" },
  totals: { incomeInCents: 0, expenseInCents: 3000, balanceInCents: -3000, count: 3 },
  hasAnyTransactions: true,
  ...over,
});

const data = (items: TransactionDTO[], over: Partial<LedgerPageData> = {}): InfiniteLedger => ({
  pages: [page(items, over)],
  pageParams: [undefined],
});

const expensePayload = {
  type: "EXPENSE" as const,
  accountId: nubank.id,
  categoryId: mercado.id,
  amountInCents: 15050,
};

describe("US-007 Novo lançamento aparece sem recarregar: atualização otimista", () => {
  it("buildPendingItem monta o DTO provisório com padrões (hoje, autor, pagador, Só meu, descrição = categoria)", () => {
    const item = buildPendingItem(expensePayload, lookups);
    expect(item).toMatchObject({
      id: "pending-k1",
      pending: true,
      type: "EXPENSE",
      amountInCents: 15050,
      occurredOn: "2026-10-04",
      description: "Supermercado",
      isSharedExpense: false,
      author: lucas,
      payer: lucas,
      account: nubank,
    });
  });

  it("buildPendingItem usa pagador, data e descrição informados; receita nunca é comum", () => {
    const item = buildPendingItem(
      {
        type: "INCOME",
        accountId: itau.id,
        categoryId: salario.id,
        amountInCents: 500000,
        payerMemberId: mariana.id,
        occurredOn: "2026-10-02",
        description: "Salário de outubro",
      },
      lookups,
    );
    expect(item).toMatchObject({
      payer: mariana,
      occurredOn: "2026-10-02",
      description: "Salário de outubro",
      isSharedExpense: false,
    });
  });

  it("buildPendingItem devolve null se faltar conta/categoria no cache", () => {
    expect(buildPendingItem({ ...expensePayload, accountId: "zzz" }, lookups)).toBeNull();
    expect(buildPendingItem({ ...expensePayload, categoryId: "zzz" }, lookups)).toBeNull();
  });

  it("insere no topo e atualiza totais; o original não é mutado (permite reverter em erro)", () => {
    const original = data([existing("a", "2026-10-03"), existing("b", "2026-10-02")]);
    const snapshot = JSON.stringify(original);
    const pending = buildPendingItem(expensePayload, lookups);
    if (!pending) throw new Error("esperava item");
    const next = insertPending(original, pending, {});
    expect(next?.pages[0]?.items.map((i) => i.id)).toEqual(["pending-k1", "a", "b"]);
    expect(next?.pages[0]?.totals).toMatchObject({
      expenseInCents: 3000 + 15050,
      balanceInCents: -3000 - 15050,
      count: 4,
    });
    expect(JSON.stringify(original)).toBe(snapshot); // rollback = recolocar o snapshot
  });

  it("lançamento retroativo entra na posição correta pela data", () => {
    const original = data([existing("a", "2026-10-03"), existing("b", "2026-10-01")]);
    const pending = buildPendingItem({ ...expensePayload, occurredOn: "2026-10-02" }, lookups);
    if (!pending) throw new Error("esperava item");
    expect(insertPending(original, pending, {})?.pages[0]?.items.map((i) => i.id)).toEqual([
      "a",
      "pending-k1",
      "b",
    ]);
  });

  it("mais antigo que a 1ª página e com próxima página: não insere", () => {
    const original = data([existing("a", "2026-10-03")], { nextCursor: "abc" });
    const pending = buildPendingItem({ ...expensePayload, occurredOn: "2026-10-01" }, lookups);
    if (!pending) throw new Error("esperava item");
    expect(insertPending(original, pending, {})).toBe(original);
  });

  it("extrato vazio: insere e marca hasAnyTransactions", () => {
    const original = data([], {
      totals: { incomeInCents: 0, expenseInCents: 0, balanceInCents: 0, count: 0 },
      hasAnyTransactions: false,
    });
    const pending = buildPendingItem(expensePayload, lookups);
    if (!pending) throw new Error("esperava item");
    const next = insertPending(original, pending, {});
    expect(next?.pages[0]?.items).toHaveLength(1);
    expect(next?.pages[0]?.hasAnyTransactions).toBe(true);
  });

  it("não insere quando o filtro não admite o item", () => {
    const original = data([existing("a", "2026-10-03")]);
    const pending = buildPendingItem(expensePayload, lookups);
    if (!pending) throw new Error("esperava item");
    for (const filters of [
      { accountId: itau.id },
      { categoryId: salario.id },
      { memberId: mariana.id },
      { type: "INCOME" as const },
      { type: "TRANSFER" as const },
      { shared: true },
    ]) {
      expect(admits(original, filters, pending), JSON.stringify(filters)).toBe(false);
      expect(insertPending(original, pending, filters)).toBe(original);
    }
    expect(
      admits(
        original,
        { memberId: lucas.id, shared: false, type: "EXPENSE", accountId: nubank.id },
        pending,
      ),
    ).toBe(true);
  });

  it("fora do período mostrado ou sem período (from/to): não insere", () => {
    const pending = buildPendingItem(expensePayload, lookups);
    if (!pending) throw new Error("esperava item");
    const sept = data([], { period: { key: "2026-09", start: "2026-09-01", end: "2026-09-30" } });
    expect(insertPending(sept, pending, {})).toBe(sept);
    const custom = data([], { period: null });
    expect(insertPending(custom, pending, {})).toBe(custom);
    expect(insertPending(undefined, pending, {})).toBeUndefined();
  });
});
