import { describe, expect, it } from "vitest";
import { buildSmtpConfig, SmtpMailer } from "@/lib/mail";

const dev = { host: "localhost", port: 1025, from: "a <a@x.com>" };
const real = { host: "smtp.provedor.com", from: "a <a@x.com>", user: "u", password: "s3gredo-xyz" };

describe("EN-006 configuração SMTP", () => {
  it("dev sem SMTP: Mailpit local, sem TLS nem auth", () => {
    const t = buildSmtpConfig(dev, false);
    expect(t).toMatchObject({ host: "localhost", port: 1025, secure: false, ignoreTLS: true });
    expect(t.auth).toBeUndefined();
  });

  it("porta 465 usa TLS implícito", () => {
    const t = buildSmtpConfig({ ...real, port: 465 }, true);
    expect(t).toMatchObject({ secure: true, auth: { user: "u", pass: "s3gredo-xyz" } });
    expect(t.requireTLS).toBeUndefined();
  });

  it("SMTP_SECURE=true força TLS implícito em outra porta", () => {
    expect(buildSmtpConfig({ ...real, port: 2465, secure: true }, true).secure).toBe(true);
  });

  it("porta 587 exige STARTTLS", () => {
    expect(buildSmtpConfig({ ...real, port: 587 }, true)).toMatchObject({
      secure: false,
      requireTLS: true,
    });
  });

  it("produção sem usuário/senha falha nomeando só as variáveis", () => {
    const run = () => buildSmtpConfig({ host: "smtp.p.com", port: 587, from: "a" }, true);
    expect(run).toThrow(/SMTP_USER.*SMTP_PASSWORD/);
  });

  it("produção apontando para localhost falha", () => {
    expect(() => buildSmtpConfig({ ...dev, user: "u", password: "p" }, true)).toThrow(/SMTP_HOST/);
  });

  it("falha de envio não vaza a senha", async () => {
    const m = new SmtpMailer({ ...real, port: 1, isProd: false });
    const err = await m
      .send({ to: "a@b.com", subject: "s", text: "t", html: "h" })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message) + String((err as Error).stack)).not.toContain(
      "s3gredo-xyz",
    );
  });
});
