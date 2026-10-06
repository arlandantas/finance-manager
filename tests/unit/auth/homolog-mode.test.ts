import { describe, expect, it, vi } from "vitest";
import {
  assertSafeAuthConfig,
  isDevLoginEnabled,
  isDevLoginHost,
  isDevToolingEnabled,
  isDirectLocalRequest,
  isHomologModeActive,
} from "@/lib/auth/dev-login-guard";
import { getEnv } from "@/lib/env";

// ADR-024 (rev. 2): homologação = só a flag explícita APP_HOMOLOG_MODE (+ AUTH_DEV_LOGIN).
const homolog = {
  NODE_ENV: "production",
  APP_HOMOLOG_MODE: "true",
  AUTH_DEV_LOGIN: "true",
  DATABASE_URL: "postgresql://finance:x@localhost:5442/finance_dev?schema=public",
  APP_URL: "http://127.0.0.1:3102",
  AUTH_URL: "http://127.0.0.1:3102",
  AUTH_SECRET: "segredo-de-teste",
};

describe("ADR-024 homologação rápida", () => {
  it("com a flag: sobe, libera o login de teste e avisa no log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isHomologModeActive(homolog)).toBe(true);
    expect(isDevLoginEnabled(homolog)).toBe(true);
    expect(() => assertSafeAuthConfig(homolog)).not.toThrow();
    expect(warn).toHaveBeenCalledWith("MODO DE HOMOLOGAÇÃO ATIVO: login de teste habilitado");
    expect(() => getEnv(homolog)).not.toThrow();
    warn.mockRestore();
  });

  it("produção real (sem APP_HOMOLOG_MODE) continua recusando o login de teste", () => {
    const prod = { ...homolog, APP_HOMOLOG_MODE: undefined };
    expect(isDevLoginEnabled(prod)).toBe(false);
    expect(() => assertSafeAuthConfig(prod)).toThrow(
      "AUTH_DEV_LOGIN não pode estar ativo em produção",
    );
    expect(() => getEnv(prod)).toThrow("AUTH_DEV_LOGIN não pode estar ativo em produção");
    expect(isDevLoginEnabled({ ...homolog, APP_HOMOLOG_MODE: "false" })).toBe(false);
  });

  it("flag sem AUTH_DEV_LOGIN: login de teste desligado", () => {
    expect(isDevLoginEnabled({ ...homolog, AUTH_DEV_LOGIN: undefined })).toBe(false);
  });

  it("Google configurado, banco remoto e URL pública não recusam (risco aceito)", () => {
    const env = {
      ...homolog,
      AUTH_GOOGLE_ID: "id.apps.googleusercontent.com",
      AUTH_GOOGLE_SECRET: "segredo",
      DATABASE_URL: "postgresql://u:p@db.exemplo.com:5432/prod",
      APP_URL: "https://financas.exemplo.com",
      AUTH_URL: "https://financas.exemplo.com",
      HOSTNAME: "0.0.0.0",
    };
    expect(isDevLoginEnabled(env)).toBe(true);
    expect(() => assertSafeAuthConfig(env)).not.toThrow();
    expect(() => getEnv(env)).not.toThrow();
  });

  it("APP_HOMOLOG_MODE não muda nada fora de produção", () => {
    const dev = { ...homolog, NODE_ENV: "development" };
    expect(() => assertSafeAuthConfig(dev)).not.toThrow();
    expect(isDevLoginEnabled(dev)).toBe(true);
  });

  it("na homologação o login aceita localhost e o host de APP_URL/AUTH_URL, não outros", () => {
    const env = {
      ...homolog,
      APP_URL: "https://financas.exemplo.com",
      AUTH_URL: "https://financas.exemplo.com",
      APP_PUBLIC_ORIGIN: "https://x.loca.lt",
    };
    expect(isDevLoginHost("localhost:3102", env)).toBe(true);
    expect(isDevLoginHost("financas.exemplo.com", env)).toBe(true);
    expect(isDevLoginHost("x.loca.lt", env)).toBe(false);
    expect(isDevLoginHost("evil.com", env)).toBe(false);
  });

  it("ferramentas de E2E: dev e homologação sim; produção real não", () => {
    expect(isDevToolingEnabled(homolog)).toBe(true);
    expect(isDevToolingEnabled({ ...homolog, APP_HOMOLOG_MODE: undefined })).toBe(false);
    expect(isDevToolingEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" })).toBe(true);
    const headers = new Headers({ host: "127.0.0.1:3102" });
    expect(isDirectLocalRequest(headers, homolog)).toBe(true);
    expect(isDirectLocalRequest(new Headers({ host: "evil.com" }), homolog)).toBe(false);
  });
});
