import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  private getClient(): BrevoClient | null {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey || apiKey === 'your-brevo-api-key') return null;
    return new BrevoClient({ apiKey });
  }

  async sendPasswordReset(email: string, name: string, token: string) {
    const frontendUrl = this.config.get('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/sifre-sifirla?token=${token}`;
    const client = this.getClient();

    if (!client) {
      this.logger.warn(`[DEV] Şifre sıfırlama linki: ${resetUrl}`);
      return;
    }

    try {
      await client.transactionalEmails.sendTransacEmail({
        subject: 'Şifre Sıfırlama Talebi',
        htmlContent: `
          <h2>Merhaba ${name},</h2>
          <p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>
          <a href="${resetUrl}" style="padding:12px 24px;background:#4F46E5;color:white;text-decoration:none;border-radius:6px;">
            Şifremi Sıfırla
          </a>
          <p>Bu bağlantı 30 dakika geçerlidir.</p>
        `,
        sender: {
          name: this.config.get('BREVO_SENDER_NAME') as string,
          email: this.config.get('BREVO_SENDER_EMAIL') as string,
        },
        to: [{ email, name }],
      });
    } catch (err) {
      this.logger.error('Mail gönderilemedi', err);
    }
  }

  async sendContactConfirmation(email: string, name: string) {
    const client = this.getClient();

    if (!client) {
      this.logger.warn(`[DEV] İletişim formu onayı: ${email}`);
      return;
    }

    try {
      await client.transactionalEmails.sendTransacEmail({
        subject: 'Mesajınız Alındı',
        htmlContent: `<h2>Merhaba ${name},</h2><p>Mesajınızı aldık, en kısa sürede size geri döneceğiz.</p>`,
        sender: {
          name: this.config.get('BREVO_SENDER_NAME') as string,
          email: this.config.get('BREVO_SENDER_EMAIL') as string,
        },
        to: [{ email, name }],
      });
    } catch (err) {
      this.logger.error('Mail gönderilemedi', err);
    }
  }
}
