import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LedgerRow } from "@/app/(app)/extrato/ledger-row";
import { eventText } from "@/app/(app)/familia/familia-screen";
import { PrefsProvider } from "@/lib/prefs";
import { SettlementProvider } from "@/lib/settlement-context";

const item = {
  id: "t1",
  groupId: "g1",
  type: "EXPENSE",
  direction: "DEBIT",
  description: "Mercado",
  occurredOn: "2026-10-03",
  amountInCents: 10000,
  isSharedExpense: true,
  account: { id: "a", name: "Nubank", archived: false },
  card: null,
  category: null,
  payer: null,
  author: { id: "m" },
  tags: [],
  viaAssistant: null,
  invoice: null,
  installment: null,
  deletedAt: null,
} as never;

const row = (enabled: boolean, shared: boolean) => (
  <PrefsProvider userId="u1">
    <SettlementProvider enabled={enabled}>
      <LedgerRow
        item={{ ...(item as object), isSharedExpense: shared } as never}
        highlighted={false}
        onOpen={() => {}}
        onHover={() => {}}
      />
    </SettlementProvider>
  </PrefsProvider>
);

describe("US-053 selos", () => {
  it("acerto ligado mostra Comum/Pessoal", () => {
    const { rerender } = render(row(true, true));
    expect(screen.getByText("Comum")).toBeInTheDocument();
    rerender(row(true, false));
    expect(screen.getByText("Pessoal")).toBeInTheDocument();
  });
  it("acerto desligado não mostra selos de divisão", () => {
    const { rerender } = render(row(false, true));
    expect(screen.queryByText("Comum")).toBeNull();
    rerender(row(false, false));
    expect(screen.queryByText("Pessoal")).toBeNull();
  });
});

describe("US-053 rótulo do evento de acerto", () => {
  it("liga/desliga conforme enabled", () => {
    expect(eventText({ type: "SETTLEMENT_TOGGLED", changes: { enabled: true } })).toBe(
      "ligou o acerto de contas",
    );
    expect(eventText({ type: "SETTLEMENT_TOGGLED", changes: { enabled: false } })).toBe(
      "desligou o acerto de contas",
    );
  });
  it("evento antigo mantém o texto genérico", () => {
    expect(eventText({ type: "SETTLEMENT_TOGGLED", changes: {} })).toBe(
      "alterou o acerto de contas",
    );
  });
});
