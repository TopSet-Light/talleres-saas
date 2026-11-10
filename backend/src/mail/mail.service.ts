import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface MailMessage { to: string; subject: string; text: string }

/**
 * Opciones del transporte SMTP. En local apunta a Mailpit sin credenciales. Con un proveedor
 * real (comentario 8 de la revisión del PR #4) usa usuario y contraseña, y si la conexión no
 * es TLS desde el inicio exige STARTTLS para no enviar las credenciales sin cifrar.
 */
export function smtpTransportOptions(config: AppConfig): SMTPTransport.Options {
  const auth = config.smtpUser && config.smtpPassword ? { user: config.smtpUser, pass: config.smtpPassword } : undefined;
  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    ...(auth ? { auth, requireTLS: !config.smtpSecure } : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Devuelve `false` si no se pudo enviar; nunca registra el contenido ni los enlaces. */
  async send(message: MailMessage): Promise<boolean> {
    try {
      this.transport ??= createTransport(smtpTransportOptions(this.config));
      await this.transport.sendMail({ from: this.config.mailFrom, ...message });
      return true;
    } catch {
      this.logger.warn(`No se pudo enviar el email «${message.subject}».`);
      return false;
    }
  }
}
