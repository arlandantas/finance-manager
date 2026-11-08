import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { isProdDeploy } from "@/lib/auth/dev-login-guard";
import { getEnv } from "@/lib/env";

export type MailMessage = { to: string; subject: string; text: string; html: string };

/** Porta de e-mail (ADR-012): trocar de provedor (EXT-02) é só configurar SMTP_*. */
export interface MailPort {
  send(message: MailMessage): Promise<void>;
}

export type SmtpSettings = {
  host: string;
  port: number;
  from: string;
  user?: string;
  password?: string;
  secure?: boolean;
};

const isLocalHost = (host: string) => ["localhost", "127.0.0.1"].includes(host);

/** Monta a configuração do transporte (EN-006). Em produção exige provedor real com usuário e senha. */
export function buildSmtpConfig(s: SmtpSettings, isProd: boolean): SMTPTransport.Options {
  if (isProd) {
    const missing = [
      isLocalHost(s.host) ? "SMTP_HOST" : null,
      s.user ? null : "SMTP_USER",
      s.password ? null : "SMTP_PASSWORD",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`Configuração SMTP ausente ou inválida em produção: ${missing.join(", ")}`);
    }
  }
  const timeouts = { connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000 };
  if (isLocalHost(s.host) && !isProd) {
    return { host: s.host, port: s.port, secure: false, ignoreTLS: true, ...timeouts };
  }
  const secure = s.secure === true || s.port === 465;
  return {
    host: s.host,
    port: s.port,
    secure,
    ...(!secure && s.port === 587 ? { requireTLS: true } : {}),
    ...(s.user && s.password ? { auth: { user: s.user, pass: s.password } } : {}),
    ...timeouts,
  };
}

export class SmtpMailer implements MailPort {
  constructor(private readonly opts: SmtpSettings & { isProd: boolean }) {}

  async send(message: MailMessage): Promise<void> {
    const transport = nodemailer.createTransport(buildSmtpConfig(this.opts, this.opts.isProd));
    try {
      await transport.sendMail({ from: this.opts.from, ...message });
    } catch (e) {
      // Nunca propaga a mensagem original: pode ecoar credenciais ou resposta do servidor.
      const code = (e as { code?: string }).code;
      throw new Error(`Falha ao enviar e-mail via SMTP${code ? ` (${code})` : ""}`);
    }
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
  return new SmtpMailer({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    from: env.MAIL_FROM,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    secure: env.SMTP_SECURE,
    isProd: isProdDeploy(),
  });
}
