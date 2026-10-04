import { describe, expect, it } from "vitest";
import { INVITATION_TTL_DAYS } from "@/modules/familia/invitations/constants";
import { invitationEmail } from "@/modules/familia/invitations/email";

describe("US-003 invitationEmail (snapshot)", () => {
  const mail = invitationEmail({
    inviterName: "Mariana Silva",
    familyName: "Família Silva",
    inviteUrl: "http://localhost:3100/convite/abc123",
    email: "lucas@exemplo.com",
  });

  it("assunto e texto", () => {
    expect(mail.subject).toBe(
      "Mariana Silva convidou você para a Família Silva no Finance Manager",
    );
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
});
