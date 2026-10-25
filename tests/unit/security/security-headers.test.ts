import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security-headers";
import nextConfig from "../../../next.config";

const get = (h: Array<{ key: string; value: string }>, k: string) =>
  h.find((x) => x.key === k)?.value;

describe("SEC-006 cabeçalhos de segurança globais", () => {
  it("next.config aplica os cabeçalhos a todas as rotas", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const global = rules.find((r) => r.source === "/:path*");
    expect(global).toBeTruthy();
    const h = global?.headers ?? [];
    expect(get(h, "X-Frame-Options")).toBe("DENY");
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get(h, "Permissions-Policy")).toContain("camera=()");
    expect(get(h, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(get(h, "Content-Security-Policy-Report-Only")).toContain("default-src 'self'");
  });

  it("HSTS só em produção", () => {
    expect(get(securityHeaders(true), "Strict-Transport-Security")).toContain("max-age=");
    expect(get(securityHeaders(false), "Strict-Transport-Security")).toBeUndefined();
  });
});
