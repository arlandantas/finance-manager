import { describe, expect, it } from "vitest";
import { INVITATION_TTL_DAYS } from "@/modules/familia/invitations/constants";
import { cleanLabel, invitationEmail } from "@/modules/familia/invitations/email";

describe("US-003 invitationEmail (snapshot)", () => {
  const mail = invitationEmail({
    inviterName: "Mariana Silva",
    familyName: "Família Silva",
    inviteUrl: "http://localhost:3100/convite/abc123",
    email: "lucas@exemplo.com",
  });

  it("assunto e texto", () => {
    expect(mail.subject).toBe("Mariana Silva convidou você para o Finance Manager");
    expect(mail.text).toMatchInlineSnapshot(`
      "Olá!

      Mariana Silva convidou você para a família Família Silva.

      Para entrar, abra o link: http://localhost:3100/convite/abc123

      O convite vale por 7 dias e só funciona com a conta Google deste e-mail (lucas@exemplo.com)."
    `);
  });

  it("html simples, sem imagens externas e com escape", () => {
    expect(mail.html).toContain('<a href="http://localhost:3100/convite/abc123">');
    expect(mail.html).not.toContain("<img");
    const evil = invitationEmail({
      inviterName: '<script>alert("x")</script>',
      familyName: "A & B",
      inviteUrl: "http://x/convite/t",
      email: "a@b.com",
    });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("A &amp; B");
  });

  it("validade padrão de 7 dias (D-GES-07)", () => {
    expect(INVITATION_TTL_DAYS).toBe(7);
  });

  it("SEC-014: o assunto nunca carrega o nome livre da família nem quebras de linha", () => {
    const phish = invitationEmail({
      inviterName: "Mariana\r\nBcc: x@evil.example",
      familyName: "BANCO OFICIAL: confirme sua senha em http://evil.example\nUrgente",
      inviteUrl: "http://x/convite/t",
      email: "a@b.com",
    });
    expect(phish.subject).not.toMatch(/[\r\n]/);
    expect(phish.subject).not.toContain("BANCO");
    expect(phish.subject).not.toContain("evil.example\nUrgente");
    expect(phish.subject.endsWith("convidou você para o Finance Manager")).toBe(true);
    expect(phish.text).not.toContain("\nUrgente");
    expect(cleanLabel("  a\u0000b\u202e  c  ")).toBe("a b c");
    expect(cleanLabel("x".repeat(100), 10)).toHaveLength(10);
  });
});
