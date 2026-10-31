import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AccountDTO } from "@/modules/contas/schemas";
import { useSourceAccount } from "@/modules/contas/use-source-account";

const acc = (id: string, balance: number, owner = "m1"): AccountDTO =>
  ({
    id,
    name: id,
    owner: { id: owner, name: owner, image: null },
    balanceInCents: balance,
    usageCountByMe: 0,
    archived: false,
  }) as unknown as AccountDTO;
const accounts = [acc("a", 100000), acc("b", 500000)];
const base = { open: true, amountInCents: 10000, ownerMemberId: "m1", accounts };

describe("US-089 useSourceAccount: preferredAccountId e preferredReason", () => {
  it("pagadora ativa vira pré-seleção com o texto do cartão", () => {
    const { result } = renderHook(() =>
      useSourceAccount({
        ...base,
        preferredAccountId: "b",
        preferredReason: "Conta pagadora do cartão",
      }),
    );
    expect(result.current.accountId).toBe("b");
    expect(result.current.reasonText).toBe("Conta pagadora do cartão");
  });

  it("padrão do texto continua 'Conta prevista' (baixa e prevista)", () => {
    const { result } = renderHook(() => useSourceAccount({ ...base, preferredAccountId: "b" }));
    expect(result.current.reasonText).toBe("Conta prevista");
  });

  it("pagadora inexistente/arquivada (fora da lista) é ignorada: cai na sugestão da US-023", () => {
    const { result } = renderHook(() =>
      useSourceAccount({ ...base, preferredAccountId: "arquivada", preferredReason: "x" }),
    );
    expect(result.current.accountId).not.toBe("arquivada");
    expect(result.current.reasonText).not.toBe("x");
  });

  it("escolha manual vence a pagadora", () => {
    const { result, rerender } = renderHook(() =>
      useSourceAccount({ ...base, preferredAccountId: "b", preferredReason: "x" }),
    );
    result.current.pick("a");
    rerender();
    expect(result.current.accountId).toBe("a");
    expect(result.current.reasonText).toBe("");
  });
});
