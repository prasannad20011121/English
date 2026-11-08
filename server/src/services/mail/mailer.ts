import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/** Development default: prints emails (e.g. password reset links) to the server log. */
class ConsoleTransport implements MailTransport {
  async send(message: MailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject }, `[email]\n${message.text}`);
  }
}

class SmtpTransport implements MailTransport {
  private readonly transporter;

  constructor(url: string) {
    this.transporter = nodemailer.createTransport(url);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: env.MAIL_FROM, ...message });
  }
}

let transport: MailTransport = env.SMTP_URL
  ? new SmtpTransport(env.SMTP_URL)
  : new ConsoleTransport();

export const mailer = {
  send: (message: MailMessage) => transport.send(message),
};

/** Replace the transport (used by tests). */
export function setMailTransport(next: MailTransport): void {
  transport = next;
}
