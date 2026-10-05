import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_PREFS,
  PrefsProvider,
  prefKey,
  readPref,
  resetPrefsMemory,
  usePref,
  writePref,
} from "@/lib/prefs";

const wrap =
  (userId: string) =>
  ({ children }: { children: ReactNode }) =>
    createElement(PrefsProvider, { userId, children });

beforeEach(() => {
  window.localStorage.clear();
  resetPrefsMemory();
});
afterEach(() => vi.restoreAllMocks());

describe("US-027 preferências por usuário e dispositivo", () => {
  it("padrões: valores ocultos, saldos recolhidos", () => {
    expect(DEFAULT_USER_PREFS).toEqual({ hideValues: true, balancesExpanded: false });
    const { result } = renderHook(() => usePref("hideValues"), { wrapper: wrap("u1") });
    expect(result.current[0]).toBe(true);
  });

  it("chave inclui o usuário (fm:v1:u:<id>:<pref>)", () => {
    expect(prefKey("u1", "hideValues")).toBe("fm:v1:u:u1:hideValues");
    writePref("u1", "hideValues", false);
    expect(window.localStorage.getItem("fm:v1:u:u1:hideValues")).toBe("false");
  });

  it("outro usuário no mesmo dispositivo começa no padrão", () => {
    writePref("lucas", "hideValues", false);
    expect(readPref("lucas", "hideValues")).toBe(false);
    expect(readPref("mariana", "hideValues")).toBe(true);
  });

  it("alternar atualiza o hook e persiste", () => {
    const { result } = renderHook(() => usePref("hideValues"), { wrapper: wrap("u1") });
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(prefKey("u1", "hideValues"))).toBe("false");
  });

  it("evento storage (outra aba) atualiza o hook", () => {
    const { result } = renderHook(() => usePref("hideValues"), { wrapper: wrap("u1") });
    act(() => {
      window.localStorage.setItem(prefKey("u1", "hideValues"), "false");
      window.dispatchEvent(new StorageEvent("storage", { key: prefKey("u1", "hideValues") }));
    });
    expect(result.current[0]).toBe(false);
  });

  it("valor inválido no storage cai no padrão", () => {
    window.localStorage.setItem(prefKey("u1", "hideValues"), "talvez");
    expect(readPref("u1", "hideValues")).toBe(true);
  });

  it("navegador sem storage: leitura captura o erro e usa a memória da sessão", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("negado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("negado");
    });
    expect(readPref("u1", "hideValues")).toBe(true);
    const { result } = renderHook(() => usePref("hideValues"), { wrapper: wrap("u1") });
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});
