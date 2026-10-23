import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(mail: Mail): Promise<void>;
  /** Most recent messages (console mailer only) — used by tests. */
  readonly outbox: Mail[];
}

/**
 * Sends email through SMTP when configured. Without SMTP settings, messages are
 * written to the server log so verification/reset links can still be used in
 * development.
 */
export async function createMailer(config: Config, log: FastifyBaseLogger): Promise<Mailer> {
  const outbox: Mail[] = [];
  if (!config.emailEnabled) {
    return {
      enabled: false,
      outbox,
      async send(mail) {
        outbox.push(mail);
        if (outbox.length > 50) outbox.shift();
        log.info({ to: mail.to, subject: mail.subject }, `[mail:console]\n${mail.text}`);
      },
    };
  }
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return {
    enabled: true,
    outbox,
    async send(mail) {
      await transport.sendMail({
        from: config.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
    },
  };
}
