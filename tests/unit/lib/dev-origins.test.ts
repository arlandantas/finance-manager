import { describe, expect, it } from "vitest";
import {
  allowedDevOriginsFor,
  explicitDevHosts,
  hostnameOf,
  isAllowedDevHost,
  isPrivateIPv4,
} from "@/lib/dev-origins";

describe("dev-origins", () => {
  it("hostnameOf aceita host, host:porta e URL", () => {
    expect(hostnameOf("http://192.168.1.81:3100/x")).toBe("192.168.1.81");
    expect(hostnameOf("Meu-PC.local:3100")).toBe("meu-pc.local");
    expect(hostnameOf("https://a.loca.lt")).toBe("a.loca.lt");
    expect(hostnameOf("")).toBeUndefined();
    expect(hostnameOf(undefined)).toBeUndefined();
  });

  it("isPrivateIPv4 cobre exatamente RFC1918", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.0.10"]) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
    for (const ip of ["172.15.0.1", "172.32.0.1", "192.169.0.1", "11.0.0.1", "300.1.1.1", "x"]) {
      expect(isPrivateIPv4(ip)).toBe(false);
    }
  });

  it("explicitDevHosts junta APP_PUBLIC_ORIGIN e APP_DEV_ORIGINS, sem duplicar", () => {
    expect(
      explicitDevHosts({
        APP_PUBLIC_ORIGIN: "https://t.loca.lt",
        APP_DEV_ORIGINS: "192.168.1.81:3100, http://t.loca.lt ,, ",
      }),
    ).toEqual(["t.loca.lt", "192.168.1.81"]);
  });

  it("isAllowedDevHost: LAN automática em dev, desligável, nunca em produção", () => {
    expect(isAllowedDevHost("192.168.1.81:3100", {})).toBe(true);
    expect(isAllowedDevHost("http://x.local:3100", {})).toBe(true);
    expect(isAllowedDevHost("8.8.8.8", {})).toBe(false);
    expect(isAllowedDevHost("192.168.1.81", { APP_DEV_LAN_AUTO: "false" })).toBe(false);
    expect(isAllowedDevHost("192.168.1.81", { NODE_ENV: "production" })).toBe(false);
    expect(isAllowedDevHost("t.loca.lt", { APP_PUBLIC_ORIGIN: "https://t.loca.lt" })).toBe(true);
    expect(
      isAllowedDevHost("t.loca.lt", {
        NODE_ENV: "production",
        APP_PUBLIC_ORIGIN: "https://t.loca.lt",
      }),
    ).toBe(false);
  });

  it("allowedDevOriginsFor (next.config): lista + padrões LAN; vazio em produção", () => {
    const dev = allowedDevOriginsFor({ APP_DEV_ORIGINS: "foo.exemplo.com" });
    expect(dev).toContain("foo.exemplo.com");
    expect(dev).toContain("192.168.*.*");
    expect(dev).toContain("172.31.*.*");
    expect(dev).not.toContain("172.32.*.*");
    expect(allowedDevOriginsFor({ APP_DEV_LAN_AUTO: "false" })).toEqual([]);
    expect(allowedDevOriginsFor({ NODE_ENV: "production", APP_DEV_ORIGINS: "x.com" })).toEqual([]);
  });
});
