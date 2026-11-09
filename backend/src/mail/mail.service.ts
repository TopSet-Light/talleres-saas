import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface MailMessage { to: string; subject: string; text: string }

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Devuelve `false` si no se pudo enviar; nunca registra el contenido ni los enlaces. */
  async send(message: MailMessage): Promise<boolean> {
    try {
      this.transport ??= createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });
      await this.transport.sendMail({ from: this.config.mailFrom, ...message });
      return true;
    } catch {
      this.logger.warn(`No se pudo enviar el email «${message.subject}».`);
      return false;
    }
  }
}
