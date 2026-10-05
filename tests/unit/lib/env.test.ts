import { describe, expect, it } from "vitest";
import { getEnv, publicBaseUrl } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://x:y@localhost:5442/db",
  AUTH_SECRET: "segredo-de-teste",
};

describe("EN-001 env (ADR-008)", () => {
  it("aplica padrões", () => {
    const env = getEnv({ ...base, NODE_ENV: "development" });
    expect(env.APP_TIMEZONE).toBe("America/Sao_Paulo");
    expect(env.AUTH_DEV_LOGIN).toBe(false);
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.AUTH_URL).toBe("http://localhost:3100");
  });

  it("lê AUTH_DEV_LOGIN=true fora de produção", () => {
    expect(
      getEnv({ ...base, NODE_ENV: "development", AUTH_DEV_LOGIN: "true" }).AUTH_DEV_LOGIN,
    ).toBe(true);
  });

  it("guarda de produção: AUTH_DEV_LOGIN=true com NODE_ENV=production lança", () => {
    expect(() => getEnv({ ...base, NODE_ENV: "production", AUTH_DEV_LOGIN: "true" })).toThrow(
      /AUTH_DEV_LOGIN/,
    );
  });

  it("produção sem a flag é aceita", () => {
    expect(getEnv({ ...base, NODE_ENV: "production" }).NODE_ENV).toBe("production");
  });

  it("AUTH_SECRET é obrigatório fora de test", () => {
    expect(() => getEnv({ DATABASE_URL: base.DATABASE_URL, NODE_ENV: "development" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(getEnv({ DATABASE_URL: base.DATABASE_URL, NODE_ENV: "test" }).NODE_ENV).toBe("test");
  });

  it("strings vazias do .env viram ausentes (Google não configurado)", () => {
    const env = getEnv({
      ...base,
      NODE_ENV: "development",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
    });
    expect(env.AUTH_GOOGLE_ID).toBeUndefined();
  });
});

describe("publicBaseUrl (links de e-mail)", () => {
  const tunnel = "https://fancy-queens-kick.loca.lt/";
  it("usa o túnel em dev e APP_URL sem ele ou em produção", () => {
    const dev = { ...base, NODE_ENV: "development" };
    expect(publicBaseUrl(getEnv({ ...dev, APP_PUBLIC_ORIGIN: tunnel }))).toBe(tunnel.slice(0, -1));
    expect(publicBaseUrl(getEnv(dev))).toBe("http://localhost:3100");
    expect(publicBaseUrl(getEnv({ ...dev, APP_PUBLIC_ORIGIN: "" }))).toBe("http://localhost:3100");
    const prod = { ...base, NODE_ENV: "production", APP_URL: "https://app.exemplo.com" };
    expect(publicBaseUrl(getEnv({ ...prod, APP_PUBLIC_ORIGIN: tunnel }))).toBe(
      "https://app.exemplo.com",
    );
  });

  it("usa a origem da requisição quando é origem de dev permitida (LAN, localhost, túnel)", () => {
    const dev = getEnv({ ...base, NODE_ENV: "development", APP_PUBLIC_ORIGIN: tunnel });
    expect(publicBaseUrl(dev, "http://192.168.1.81:3100")).toBe("http://192.168.1.81:3100");
    expect(publicBaseUrl(dev, "http://localhost:3100")).toBe("http://localhost:3100");
    expect(publicBaseUrl(dev, "https://fancy-queens-kick.loca.lt")).toBe(
      "https://fancy-queens-kick.loca.lt",
    );
    // origem desconhecida/pública não é refletida: cai no túnel configurado
    expect(publicBaseUrl(dev, "https://evil.com")).toBe(tunnel.slice(0, -1));
    expect(publicBaseUrl(dev, "javascript:alert(1)")).toBe(tunnel.slice(0, -1));
    const semTunel = getEnv({ ...base, NODE_ENV: "development" });
    expect(publicBaseUrl(semTunel, "http://evil.com")).toBe("http://localhost:3100");
    const prod = getEnv({ ...base, NODE_ENV: "production", APP_URL: "https://app.exemplo.com" });
    expect(publicBaseUrl(prod, "http://192.168.1.81:3100")).toBe("https://app.exemplo.com");
  });
});
