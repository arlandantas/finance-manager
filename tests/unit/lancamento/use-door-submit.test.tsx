import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoorService, DoorSubmission } from "@/modules/lancamento/door";
import { useDoorKey, useDoorSubmit } from "@/modules/lancamento/use-door-submit";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("SDD-031 §5.1/§5.3 useDoorKey: regeração e preservação da chave", () => {
  it("gera uma chave por abertura e a regera a cada renew()", () => {
    const { result } = renderHook(() => useDoorKey("TRANSACTION", false));
    const first = result.current.key;
    expect(first).toBeTruthy();
    act(() => result.current.renew());
    expect(result.current.key).not.toBe(first);
  });

  it("mudar de serviço regera a chave; rerender no mesmo serviço a mantém", () => {
    const { result, rerender } = renderHook(({ s }: { s: DoorService }) => useDoorKey(s, false), {
      initialProps: { s: "TRANSACTION" as DoorService },
    });
    const k0 = result.current.key;
    rerender({ s: "TRANSACTION" });
    expect(result.current.key).toBe(k0);
    rerender({ s: "PLANNED" });
    const k1 = result.current.key;
    expect(k1).not.toBe(k0);
    rerender({ s: "SERIES" });
    const k2 = result.current.key;
    expect(k2).not.toBe(k1);
    rerender({ s: "SUBSCRIPTION" });
    expect(result.current.key).not.toBe(k2);
  });

  it("resultado desconhecido (falha de rede) preserva a chave mesmo se o serviço mudar", () => {
    const { result, rerender } = renderHook(
      ({ s, u }: { s: DoorService; u: boolean }) => useDoorKey(s, u),
      { initialProps: { s: "TRANSACTION" as DoorService, u: false } },
    );
    const k0 = result.current.key;
    rerender({ s: "TRANSACTION", u: true });
    rerender({ s: "PLANNED", u: true });
    expect(result.current.key).toBe(k0);
  });
});

describe("SDD-031 §5.3 useDoorSubmit: mutação do serviço e Idempotency-Key", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ generatedCount: 7 }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const subs: Array<[string, DoorSubmission, string]> = [
    [
      "TRANSACTION",
      { service: "TRANSACTION", input: { type: "EXPENSE" } } as never,
      "/api/v1/transactions",
    ],
    ["PLANNED", { service: "PLANNED", input: {} } as never, "/api/v1/planned-expenses"],
    ["SERIES", { service: "SERIES", input: {} } as never, "/api/v1/recurring-expenses"],
    ["SUBSCRIPTION", { service: "SUBSCRIPTION", input: {} } as never, "/api/v1/subscriptions"],
  ];

  it.each(subs)("%s: rota certa com a chave recebida", async (_n, sub, url) => {
    const { result } = renderHook(() => useDoorSubmit("chave-fixa"), { wrapper: wrapper() });
    const onSuccess = vi.fn();
    act(() => {
      result.current.submit(sub, { onSuccess, onError: vi.fn(), onSettled: vi.fn() });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("chave-fixa");
    if (sub.service === "SERIES") expect(onSuccess).toHaveBeenCalledWith(7);
    else expect(onSuccess).toHaveBeenCalledWith();
  });

  it("reenvio com a mesma chave após falha de rede reutiliza o mesmo Idempotency-Key", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const { result } = renderHook(() => useDoorSubmit("chave-reenvio"), { wrapper: wrapper() });
    const onError = vi.fn();
    const onSuccess = vi.fn();
    act(() => {
      result.current.submit(subs[1]![1], { onSuccess, onError, onSettled: vi.fn() });
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    act(() => {
      result.current.submit(subs[1]![1], { onSuccess, onError, onSettled: vi.fn() });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const keys = fetchMock.mock.calls.map(
      (c) => ((c[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["chave-reenvio", "chave-reenvio"]);
  });
});
