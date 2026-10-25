import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthConfig } from "@/lib/auth/config";
import { resetDb, testDb } from "../support/db";
import { makeUser } from "../support/factories";

// U6 (D-GES-42): o callback `signIn` REAL do Auth.js, com o banco de teste.
const db = testDb();
const signIn = (email: string) =>
  (buildAuthConfig().callbacks?.signIn as (a: unknown) => Promise<unknown>)({
    account: { provider: "google" },
    profile: { email, email_verified: true },
    user: { email },
  });

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("AUTH_SECRET", "x");
});
afterEach(() => vi.unstubAllEnvs());

describe("U6 ALLOWED_SIGNUP_EMAILS", () => {
  it("vazia: cadastro aberto (dev e teste inalterados)", async () => {
    vi.stubEnv("ALLOWED_SIGNUP_EMAILS", "");
    expect(await signIn("qualquer@exemplo.com")).toBe(true);
  });

  it("com lista: só e-mails da lista criam conta; fora da lista é barrado sem criar usuário nem e-mail", async () => {
    vi.stubEnv("ALLOWED_SIGNUP_EMAILS", "mariana@exemplo.com");
    expect(await signIn("Mariana@Exemplo.com")).toBe(true);
    expect(await signIn("estranho@exemplo.com")).toBe("/login?error=SignupRestricted");
    expect(await db.user.count()).toBe(0);
  });

  it("conta já existente continua entrando mesmo fora da lista", async () => {
    vi.stubEnv("ALLOWED_SIGNUP_EMAILS", "mariana@exemplo.com");
    await makeUser("lucas@exemplo.com");
    expect(await signIn("lucas@exemplo.com")).toBe(true);
  });

  it("convite não contorna a lista", async () => {
    vi.stubEnv("ALLOWED_SIGNUP_EMAILS", "mariana@exemplo.com");
    expect(await signIn("vovo@exemplo.com")).toBe("/login?error=SignupRestricted");
  });
});
