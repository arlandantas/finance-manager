import { describe, expect, it } from "vitest";
import {
  assertSafeAuthConfig,
  homologModeViolations,
  isDevLoginEnabled,
  isDevLoginHost,
  isDevToolingEnabled,
  isHomologModeActive,
} from "@/lib/auth/dev-login-guard";
import { getEnv } from "@/lib/env";

// ADR-024: modo de homologação rápida (build de produção + login de teste, só local).
const homolog = {
  NODE_ENV: "production",
  APP_HOMOLOG_MODE: "true",
  AUTH_DEV_LOGIN: "true",
  HOSTNAME: "127.0.0.1",
  DATABASE_URL: "postgresql://finance:x@localhost:5442/finance_dev?schema=public",
  APP_URL: "http://localhost:3102",
  AUTH_URL: "http://localhost:3102",
  AUTH_SECRET: "segredo-de-teste",
  AUTH_GOOGLE_ID: "",
  AUTH_GOOGLE_SECRET: "",
};

describe("ADR-024 homologação rápida", () => {
  it("homologação local válida: sobe e libera o login de teste", () => {
    expect(homologModeViolations(homolog)).toEqual([]);
    expect(isHomologModeActive(homolog)).toBe(true);
    expect(isDevLoginEnabled(homolog)).toBe(true);
    expect(() => assertSafeAuthConfig(homolog)).not.toThrow();
    expect(() => getEnv(homolog)).not.toThrow();
  });

  it("aceita bind em IP privado e banco em 127.0.0.1", () => {
    const lan = {
      ...homolog,
      HOSTNAME: "192.168.1.81",
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5442/db",
      APP_URL: "http://192.168.1.81:3102",
      AUTH_URL: "http://192.168.1.81:3102",
    };
    expect(homologModeViolations(lan)).toEqual([]);
    expect(isDevLoginHost("192.168.1.81:3102", lan)).toBe(true);
    // outro IP privado que não é o do bind: recusado
    expect(isDevLoginHost("192.168.1.82:3102", lan)).toBe(false);
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

  it.each([
    ["banco remoto", { DATABASE_URL: "postgresql://u:p@db.exemplo.com:5432/prod" }, "DATABASE_URL"],
    [
      "banco por nome de serviço",
      { DATABASE_URL: "postgresql://u:p@db:5432/prod" },
      "DATABASE_URL",
    ],
    ["banco por socket", { DATABASE_URL: "postgresql://u:p@/prod?host=/run/pg" }, "DATABASE_URL"],
    ["bind 0.0.0.0", { HOSTNAME: "0.0.0.0" }, "HOSTNAME"],
    ["bind ausente", { HOSTNAME: undefined }, "HOSTNAME"],
    ["bind com nome de container", { HOSTNAME: "a1b2c3d4e5f6" }, "HOSTNAME"],
    ["bind em IP público", { HOSTNAME: "203.0.113.10" }, "HOSTNAME"],
    ["AUTH_URL https", { AUTH_URL: "https://localhost:3102" }, "AUTH_URL"],
    ["APP_URL público", { APP_URL: "http://financas.exemplo.com" }, "APP_URL"],
    ["APP_URL ausente", { APP_URL: undefined }, "APP_URL"],
    ["Google real configurado", { AUTH_GOOGLE_ID: "id.apps.googleusercontent.com" }, "AUTH_GOOGLE"],
  ])("recusa subir com %s", (_label, override, field) => {
    const env = { ...homolog, ...override };
    expect(homologModeViolations(env).join(" ")).toContain(field);
    expect(isDevLoginEnabled(env)).toBe(false);
    expect(() => assertSafeAuthConfig(env)).toThrow("APP_HOMOLOG_MODE recusado (ADR-024)");
  });

  it("APP_HOMOLOG_MODE em produção é validado mesmo sem o login de teste", () => {
    const env = { ...homolog, AUTH_DEV_LOGIN: undefined, HOSTNAME: "0.0.0.0" };
    expect(() => assertSafeAuthConfig(env)).toThrow("APP_HOMOLOG_MODE recusado");
  });

  it("APP_HOMOLOG_MODE não muda nada fora de produção", () => {
    const dev = { ...homolog, NODE_ENV: "development", HOSTNAME: "0.0.0.0" };
    expect(() => assertSafeAuthConfig(dev)).not.toThrow();
    expect(isDevLoginEnabled(dev)).toBe(true);
  });

  it("na homologação o login só aceita Host localhost; LAN/túnel de dev não valem", () => {
    const env = {
      ...homolog,
      APP_PUBLIC_ORIGIN: "https://x.loca.lt",
      APP_DEV_ORIGINS: "dev.ex.com",
    };
    expect(isDevLoginHost("localhost:3102", env)).toBe(true);
    expect(isDevLoginHost("x.loca.lt", env)).toBe(false);
    expect(isDevLoginHost("dev.ex.com", env)).toBe(false);
    expect(isDevLoginHost("10.0.0.5:3102", env)).toBe(false);
    expect(isDevLoginHost("evil.com", env)).toBe(false);
  });

  it("ferramentas de E2E (relógio) ficam desligadas na homologação", () => {
    expect(isDevToolingEnabled(homolog)).toBe(false);
    expect(isDevToolingEnabled({ AUTH_DEV_LOGIN: "true", NODE_ENV: "development" })).toBe(true);
  });
});
