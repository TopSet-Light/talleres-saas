import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface MailMessage { to: string; subject: string; text: string }
export const RESEND_TIMEOUT_MS = 10_000;

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
      if (this.config.mailTransport === 'resend') return await this.sendWithResend(message);
      this.transport ??= createTransport(smtpTransportOptions(this.config));
      await this.transport.sendMail({ from: this.config.mailFrom, ...message });
      return true;
    } catch {
      // El asunto de una invitación puede contener datos del taller. No registrar datos
      // del mensaje ni errores del proveedor (pueden incluir destinatarios o credenciales).
      this.logger.warn('No se pudo enviar el email transaccional.');
      return false;
    }
  }

  private async sendWithResend(message: MailMessage): Promise<boolean> {
    // Node 22 ya incluye fetch; no hace falta otro SDK para este endpoint.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.config.mailFrom, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Resend rechazó el envío');
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) {
      throw new Error('Respuesta inválida de Resend');
    }
    // Aceptado por el proveedor; la entrega final se consulta en Resend.
    return true;
  }
}
