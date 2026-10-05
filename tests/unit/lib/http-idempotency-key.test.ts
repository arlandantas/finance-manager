import { afterEach, describe, expect, it, vi } from "vitest";
import { newIdempotencyKey } from "@/lib/http";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newIdempotencyKey", () => {
  it("gera UUID v4 com crypto.randomUUID", () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4);
  });

  it("em contexto inseguro (http://IP-da-LAN, sem randomUUID) cai para getRandomValues", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = newIdempotencyKey();
    expect(a).toMatch(UUID_V4);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});
