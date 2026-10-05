import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "@/app/(public)/login/messages";
import { authorizeSignIn, profileUpdates, sessionConfig } from "@/lib/auth/config";
import {
  assertSafeAuthConfig,
  isDevLoginEnabled,
  isDevLoginHost,
  isDirectLocalRequest,
  isLocalHost,
} from "@/lib/auth/dev-login-guard";
import { normalizeEmail } from "@/lib/auth/email";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { parseCookieHeader, sessionTokenFromCookies } from "@/lib/auth/session";

describe("US-001 Rota protegida sem sessão: safeCallbackUrl", () => {
  it("aceita apenas caminhos relativos locais", () => {
    expect(safeCallbackUrl("/contas")).toBe("/contas");
    expect(safeCallbackUrl("/extrato?period=2026-10")).toBe("/extrato?period=2026-10");
  });

  it.each(["//evil.com", "https://x", "/\\x", "", null, undefined, "javascript:alert(1)", "evil"])(
    "rejeita %j",
    (raw) => {
      expect(safeCallbackUrl(raw as string | null | undefined)).toBe("/");
    },
  );
});

describe("US-001 E-mail Google não verificado: authorizeSignIn", () => {
  it("nega Google com e-mail não verificado", () => {
    expect(authorizeSignIn({ provider: "google", profile: { email_verified: false } })).toBe(
      "/login?error=EmailNotVerified",
    );
    expect(authorizeSignIn({ provider: "google", profile: {} })).toBe(
      "/login?error=EmailNotVerified",
    );
    expect(authorizeSignIn({ provider: "google", profile: null })).toBe(
      "/login?error=EmailNotVerified",
    );
  });

  it("aceita Google verificado", () => {
    expect(authorizeSignIn({ provider: "google", profile: { email_verified: true } })).toBe(true);
  });
});

describe("US-001 Sessão persistente: configuração", () => {
  it("sessão em banco, 90 dias deslizantes, renovação a cada 24 h", () => {
    expect(sessionConfig.strategy).toBe("database");
    expect(sessionConfig.maxAge).toBe(60 * 60 * 24 * 90);
    expect(sessionConfig.updateAge).toBe(60 * 60 * 24);
  });

  it("lê o token do cookie do Auth.js (seguro tem prioridade)", () => {
    const jar = parseCookieHeader(
      "a=1; authjs.session-token=abc; __Secure-authjs.session-token=xyz",
    );
    expect(sessionTokenFromCookies(jar)).toBe("xyz");
    expect(sessionTokenFromCookies(parseCookieHeader("authjs.session-token=abc"))).toBe("abc");
    expect(sessionTokenFromCookies(parseCookieHeader(null))).toBeNull();
  });
});

describe("US-001 mensagens do login", () => {
  it("mapeia os códigos de erro (SDD-003 §3.2)", () => {
    expect(loginErrorMessage("EmailNotVerified")).toContain("não está verificado");
    for (const code of [
      "AccessDenied",
      "OAuthCallbackError",
      "Callback",
      "Configuration",
      "qualquer",
    ]) {
      expect(loginErrorMessage(code)).toBe("Não foi possível entrar. Tente novamente.");
    }
    expect(loginErrorMessage(undefined)).toBeNull();
  });
});

describe("US-001 infra: dev-login seguro", () => {
  it("normalizeEmail: trim + minúsculas", () => {
    expect(normalizeEmail("  Lucas@Exemplo.COM ")).toBe("lucas@exemplo.com");
  });

  it("isDevLoginEnabled exige a flag e NODE_ENV != production", () => {
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" })).toBe(true);
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "false", NODE_ENV: "development" })).toBe(false);
    expect(isDevLoginEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isDevLoginEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "production" })).toBe(false);
  });

  it("assertSafeAuthConfig lança em produção com a flag ligada", () => {
    expect(() => assertSafeAuthConfig({ AUTH_DEV_LOGIN: "true", NODE_ENV: "production" })).toThrow(
      "AUTH_DEV_LOGIN não pode estar ativo em produção",
    );
    expect(() =>
      assertSafeAuthConfig({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" }),
    ).not.toThrow();
    expect(() => assertSafeAuthConfig({ NODE_ENV: "production" })).not.toThrow();
  });

  it("isDevLoginHost: localhost sempre; túnel só se for exatamente o host de APP_PUBLIC_ORIGIN", () => {
    const env = { APP_PUBLIC_ORIGIN: "https://fancy-queens-kick.loca.lt" };
    expect(isDevLoginHost("localhost:3100", {})).toBe(true);
    expect(isDevLoginHost("fancy-queens-kick.loca.lt", env)).toBe(true);
    expect(isDevLoginHost("FANCY-queens-kick.loca.lt:443", env)).toBe(true);
    expect(isDevLoginHost("fancy-queens-kick.loca.lt", {})).toBe(false);
    expect(isDevLoginHost("outro.loca.lt", env)).toBe(false);
    expect(isDevLoginHost("evil.com", { APP_PUBLIC_ORIGIN: "lixo" })).toBe(false);
    expect(isDevLoginHost(null, env)).toBe(false);
  });

  it("isDevLoginHost: IP privado e *.local em dev; lista APP_DEV_ORIGINS; nunca IP público nem produção", () => {
    expect(isDevLoginHost("192.168.1.81:3100", {})).toBe(true);
    expect(isDevLoginHost("10.0.0.5:3100", {})).toBe(true);
    expect(isDevLoginHost("172.20.1.2:3100", {})).toBe(true);
    expect(isDevLoginHost("meu-pc.local:3100", {})).toBe(true);
    expect(isDevLoginHost("172.32.0.1:3100", {})).toBe(false);
    expect(isDevLoginHost("8.8.8.8:3100", {})).toBe(false);
    expect(isDevLoginHost("192.168.1.81:3100", { APP_DEV_LAN_AUTO: "false" })).toBe(false);
    const list = {
      APP_DEV_LAN_AUTO: "false",
      APP_DEV_ORIGINS: "http://192.168.1.81:3100, dev.exemplo.com",
    };
    expect(isDevLoginHost("192.168.1.81:3100", list)).toBe(true);
    expect(isDevLoginHost("dev.exemplo.com", list)).toBe(true);
    expect(isDevLoginHost("192.168.1.82:3100", list)).toBe(false);
    expect(isDevLoginHost("192.168.1.81:3100", { NODE_ENV: "production", ...list })).toBe(false);
  });

  it("isDirectLocalRequest segue só localhost direto (nunca IP da LAN)", () => {
    expect(isDirectLocalRequest(new Headers({ host: "localhost:3100" }))).toBe(true);
    expect(isDirectLocalRequest(new Headers({ host: "192.168.1.81:3100" }))).toBe(false);
  });

  it("isDirectLocalRequest (relógio de apoio): localhost direto, sem IP/host de proxy ou túnel", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(isDirectLocalRequest(h({ host: "localhost:3100" }))).toBe(true);
    expect(isDirectLocalRequest(h({ host: "localhost:3100", "x-forwarded-for": "1.2.3.4" }))).toBe(
      false,
    );
    expect(isDirectLocalRequest(h({ host: "localhost", "x-forwarded-host": "a.loca.lt" }))).toBe(
      false,
    );
    // cabeçalhos que o próprio Next acrescenta (loopback) não bloqueiam
    expect(
      isDirectLocalRequest(
        h({
          host: "127.0.0.1:3101",
          "x-forwarded-for": "::1",
          "x-forwarded-host": "127.0.0.1:3101",
          "x-forwarded-proto": "http",
        }),
      ),
    ).toBe(true);
    expect(isDirectLocalRequest(h({ host: "a.loca.lt" }))).toBe(false);
  });

  it("isLocalHost aceita só localhost, 127.0.0.1, [::1] e *.localhost", () => {
    for (const h of [
      "localhost",
      "localhost:3100",
      "127.0.0.1:3101",
      "[::1]:3000",
      "app.localhost:3100",
    ]) {
      expect(isLocalHost(h)).toBe(true);
    }
    for (const h of ["evil.com", "localhost.evil.com", "10.0.0.5:3100", "", null, undefined]) {
      expect(isLocalHost(h)).toBe(false);
    }
  });

  it("profileUpdates devolve só o que mudou (nome/foto do Google a cada login)", () => {
    expect(profileUpdates({ name: "A", image: "x" }, { name: "A", picture: "x" })).toEqual({});
    expect(profileUpdates({ name: "A", image: "x" }, { name: "B", picture: "y" })).toEqual({
      name: "B",
      image: "y",
    });
    expect(profileUpdates({ name: null, image: null }, undefined)).toEqual({});
  });
});
