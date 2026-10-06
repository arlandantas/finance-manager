// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dialogZ, useDialogDepth } from "@/components/ui/dialog-layer";

describe("camada de diálogos (US-056)", () => {
  it("z por profundidade: overlay abaixo do conteúdo e acima do nível anterior", () => {
    expect(dialogZ(0)).toEqual({ overlay: 40, content: 50 });
    expect(dialogZ(1).overlay).toBeGreaterThan(dialogZ(0).content);
  });
  it("diálogo aberto depois recebe profundidade maior; fechar libera a pilha", () => {
    const a = renderHook(() => useDialogDepth(true));
    const b = renderHook(() => useDialogDepth(true));
    expect(a.result.current).toBe(0);
    expect(b.result.current).toBe(1);
    b.unmount();
    const c = renderHook(() => useDialogDepth(true));
    expect(c.result.current).toBe(1);
    a.unmount();
    c.unmount();
  });
});
