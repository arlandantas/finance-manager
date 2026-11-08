import { beforeEach, describe, expect, it } from "vitest";
import { SmtpMailer } from "@/lib/mail";
import { clearMessages, waitForMessage } from "../support/mailpit";

describe("EN-006 envio SMTP contra o Mailpit local", () => {
  beforeEach(clearMessages);

  it("entrega pelo SmtpMailer na porta local", async () => {
    const mailer = new SmtpMailer({
      host: "localhost",
      port: 1025,
      from: "Finance Manager <no-reply@finance-manager.local>",
      isProd: false,
    });
    await mailer.send({
      to: "en006@example.com",
      subject: "EN-006",
      text: "oi",
      html: "<p>oi</p>",
    });
    const msg = await waitForMessage("en006@example.com");
    expect(msg.subject).toBe("EN-006");
  });
});
