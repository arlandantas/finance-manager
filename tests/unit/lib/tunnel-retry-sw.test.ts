import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// Executa o SW de dev em um "self" simulado para provar: concorrência máxima 2 e repetição de 502.
function load(fetchImpl: (r: unknown) => Promise<{ status: number }>) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    location: { origin: "https://t.loca.lt" },
    addEventListener: (n: string, h: (e: unknown) => void) => {
      handlers[n] = h;
    },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
  };
  const code = readFileSync("public/tunnel-retry-sw.js", "utf8");
  vm.runInNewContext(code, { self, fetch: fetchImpl, URL, setTimeout, Promise, Math, Set });
  const request = (path: string) => ({
    url: `https://t.loca.lt${path}`,
    headers: new Headers(),
    clone() {
      return this;
    },
  });
  const send = (path: string) =>
    new Promise<{ status: number }>((resolve) => {
      handlers.fetch?.({
        request: request(path),
        respondWith: (p: Promise<{ status: number }>) => resolve(p),
      });
    });
  return { send };
}

describe("tunnel-retry-sw (dev)", () => {
  it("repete 502 até obter sucesso", async () => {
    let calls = 0;
    const { send } = load(async () => ({ status: ++calls < 3 ? 502 : 200 }));
    expect((await send("/api/v1/accounts")).status).toBe(200);
    expect(calls).toBe(3);
  });

  it("limita a 2 requisições simultâneas", async () => {
    let active = 0;
    let peak = 0;
    const { send } = load(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { status: 200 };
    });
    await Promise.all(Array.from({ length: 8 }, (_, i) => send(`/_next/static/c${i}.js`)));
    expect(peak).toBe(2);
  });
});
