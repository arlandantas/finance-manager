import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

export type MailMessage = { to: string; subject: string; text: string; html: string };

/** Porta de e-mail (ADR-012): trocar de provedor (EXT-02) é só configurar SMTP_*. */
export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

export class SmtpMailer implements MailPort {
  constructor(private readonly opts: { host: string; port: number; from: string }) {}

  async send(message: MailMessage): Promise<void> {
    const local = ["localhost", "127.0.0.1"].includes(this.opts.host);
    const transport = nodemailer.createTransport({
      host: this.opts.host,
      port: this.opts.port,
      secure: false,
      ...(local ? { ignoreTLS: true } : {}),
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 5000,
    });
    await transport.sendMail({ from: this.opts.from, ...message });
  }
}

/** Adaptador de testes: guarda as mensagens e pode falhar sob demanda. */
export class InMemoryMailer implements MailPort {
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}

let override: MailPort | null = null;

/** Apenas para testes. */
export function setMailer(mailer: MailPort | null): void {
  override = mailer;
}

export function getMailer(): MailPort {
  if (override) return override;
  const env = getEnv();
  return new SmtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.MAIL_FROM });
}
