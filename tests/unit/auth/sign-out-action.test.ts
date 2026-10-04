import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
const endSession = vi.fn(async () => 1);
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/auth/sign-out", () => ({ endSessionFromCookies: endSession }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "__Secure-authjs.session-token", value: "tok" }],
    set,
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  set.mockClear();
  endSession.mockClear();
  redirect.mockClear();
});

describe("logout atrás de túnel/proxy (sem depender de AUTH_URL)", () => {
  it("signOutAction apaga a sessão do banco, expira os dois cookies e redireciona de forma relativa", async () => {
    const { signOutAction } = await import("@/app/actions");
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(endSession).toHaveBeenCalledWith({ "__Secure-authjs.session-token": "tok" });
    const names = set.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["authjs.session-token", "__Secure-authjs.session-token"]);
    expect(set.mock.calls[1]?.[2]).toMatchObject({ maxAge: 0, secure: true });
  });

  it("switchAccountAction volta ao convite com redirect relativo", async () => {
    const { switchAccountAction } = await import("@/app/actions");
    const fd = new FormData();
    fd.set("callbackUrl", "/convite/abc");
    await expect(switchAccountAction(fd)).rejects.toThrow(
      `NEXT_REDIRECT:/login?callbackUrl=${encodeURIComponent("/convite/abc")}`,
    );
    expect(endSession).toHaveBeenCalled();
  });
});
