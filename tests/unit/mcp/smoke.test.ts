import { describe, expect, it } from "vitest";
import { smoke } from "../../../scripts/mcp-smoke";

const BASE = "https://exemplo.test";
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });

// Sem rede: um servidor falso responde como o app responderia.
function fake(overrides: Partial<Record<string, () => Response>> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = `${init?.method ?? "GET"} ${url.replace(BASE, "")}`;
    if (overrides[key]) return (overrides[key] as () => Response)();
    switch (key) {
      case "POST /api/mcp":
        return new Response("{}", {
          status: 401,
          headers: {
            "www-authenticate": `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp", scope="read write"`,
          },
        });
      case "GET /api/mcp":
        return new Response("{}", { status: 405 });
      case "GET /.well-known/oauth-protected-resource/api/mcp":
        return json({ resource: `${BASE}/api/mcp` });
      case "GET /.well-known/oauth-authorization-server":
        return json({
          issuer: BASE,
          code_challenge_methods_supported: ["S256"],
          client_id_metadata_document_supported: true,
        });
      default:
        return new Response("?", { status: 404 });
    }
  }) as typeof fetch;
}

describe("EN-006b pnpm mcp:smoke (SDD-024 §9.3)", () => {
  it("servidor saudável => OK", async () => {
    const r = await smoke(`${BASE}/`, fake());
    expect(r.ok).toBe(true);
    expect(r.lines.at(-1)).toBe("SMOKE MCP OK");
  });
  it("detecta 200 sem credencial e metadados quebrados", async () => {
    const r1 = await smoke(
      BASE,
      fake({ "POST /api/mcp": () => new Response("{}", { status: 200 }) }),
    );
    expect(r1.ok).toBe(false);
    const r2 = await smoke(
      BASE,
      fake({
        "GET /.well-known/oauth-authorization-server": () => json({ issuer: "https://outro" }),
      }),
    );
    expect(r2.ok).toBe(false);
    const r3 = await smoke(
      BASE,
      fake({ "GET /api/mcp": () => new Response("{}", { status: 200 }) }),
    );
    expect(r3.ok).toBe(false);
  });
});
