import { describe, expect, it } from "vitest";
import { resolveDirectDatabaseUrl, resolveRuntimeDatabaseUrl } from "@/lib/db-url";
import { getEnv } from "@/lib/env";

const DIRECT = "postgres://u:p@db.prisma.io:5432/postgres?sslmode=require";
const POOLED = "postgres://u:p@pooled.db.prisma.io:5432/postgres?sslmode=require";

describe("EN-007 resolução tolerante das URLs do banco (ADR-031 §3)", () => {
  it("dev local: DATABASE_URL local passa intacta nas duas pontas", () => {
    const env = { DATABASE_URL: "postgresql://finance:x@127.0.0.1:5442/finance_dev" };
    expect(resolveRuntimeDatabaseUrl(env)).toBe(env.DATABASE_URL);
    expect(resolveDirectDatabaseUrl(env)).toBe(env.DATABASE_URL);
  });

  it("integração Prisma (DATABASE_URL direta + prisma+postgres://): app usa pooled, CLI usa direta", () => {
    const env = {
      DATABASE_URL: DIRECT,
      POSTGRES_URL: DIRECT,
      PRISMA_DATABASE_URL: "prisma+postgres://accelerate.prisma-data.net/?api_key=zzz",
    };
    expect(resolveRuntimeDatabaseUrl(env)).toContain("@pooled.db.prisma.io");
    expect(resolveDirectDatabaseUrl(env)).toContain("@db.prisma.io");
    expect(resolveDirectDatabaseUrl(env)).not.toContain("pooled");
  });

  it("só POSTGRES_URL presente é aceita", () => {
    expect(resolveRuntimeDatabaseUrl({ POSTGRES_URL: DIRECT })).toContain("pooled.db.prisma.io");
  });

  it("URL pooled explícita no DATABASE_URL e DIRECT_URL direta: sem mexer", () => {
    const env = { DATABASE_URL: POOLED, DIRECT_URL: DIRECT };
    expect(resolveRuntimeDatabaseUrl(env)).toBe(POOLED);
    expect(resolveDirectDatabaseUrl(env)).toBe(DIRECT);
  });

  it("DATABASE_URL pooled sem DIRECT_URL: o CLI nunca usa o pooler", () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: POOLED })).toContain("@db.prisma.io");
  });

  it("nomes alternativos da integração para a URL direta", () => {
    expect(resolveDirectDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(
      DIRECT,
    );
    expect(
      resolveDirectDatabaseUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: DIRECT }),
    ).toBe(DIRECT);
  });

  it("ignora prisma+postgres:// e vazios", () => {
    const env = { DATABASE_URL: "prisma+postgres://x/?api_key=1", POSTGRES_URL: " " };
    expect(resolveRuntimeDatabaseUrl(env)).toBeUndefined();
    expect(resolveDirectDatabaseUrl(env)).toBeUndefined();
  });

  it("getEnv deriva DATABASE_URL de POSTGRES_URL e lê DB_POOL_MAX", () => {
    const env = getEnv({
      POSTGRES_URL: DIRECT,
      AUTH_SECRET: "s",
      NODE_ENV: "test",
      DB_POOL_MAX: "5",
    });
    expect(env.DATABASE_URL).toContain("pooled.db.prisma.io");
    expect(env.DB_POOL_MAX).toBe(5);
    expect(
      getEnv({ DATABASE_URL: DIRECT, AUTH_SECRET: "s", NODE_ENV: "test" }).DB_POOL_MAX,
    ).toBeUndefined();
  });
});
