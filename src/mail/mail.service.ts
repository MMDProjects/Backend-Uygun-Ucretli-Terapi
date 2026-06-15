import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  private getClient(): BrevoClient | null {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    if (!apiKey || apiKey === 'your-brevo-api-key' || apiKey === '') return null;
    return new BrevoClient({ apiKey });
  }

  private get sender() {
    return {
      name: this.config.get('BREVO_SENDER_NAME') as string,
      email: this.config.get('BREVO_SENDER_EMAIL') as string,
    };
  }

  private get adminEmail(): string {
    return this.config.get('ADMIN_NOTIFICATION_EMAIL') ?? this.config.get('BREVO_SENDER_EMAIL') ?? '';
  }

  private get frontendUrl(): string {
    return (this.config.get('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  }

  private buildEmailHtml(title: string, body: string): string {
    return `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">
        <div style="background:#016a59;padding:28px 32px;text-align:center">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:600;letter-spacing:-0.3px">
            Uygun Ücretli Terapi
          </h1>
        </div>
        <div style="padding:36px 32px">
          <h2 style="color:#014a3e;margin:0 0 16px;font-size:18px;font-weight:600">${title}</h2>
          ${body}
        </div>
        <div style="background:#e6f0ee;padding:18px 32px;text-align:center;font-size:12px;color:#4a4a4a;line-height:1.6">
          Bu mail otomatik gönderilmiştir. Lütfen yanıtlamayın.<br/>
          Kişisel verileriniz KVKK kapsamında korunmaktadır.
        </div>
      </div>
    `;
  }

  private ctaButton(text: string, href: string): string {
    return `
      <a href="${href}"
        style="display:inline-block;margin:20px 0;padding:13px 28px;background:#016a59;color:#ffffff;
               text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">
        ${text}
      </a>
    `;
  }

  private async send(to: string, toName: string, subject: string, html: string) {
    const client = this.getClient();
    if (!client) {
      this.logger.warn(`[DEV-MAIL] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await client.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent: html,
        sender: this.sender,
        to: [{ email: to, name: toName }],
      });
    } catch (err) {
      this.logger.error(`Mail gönderilemedi (${to}): ${subject}`, err);
    }
  }

  // ─── Şifre Sıfırlama ──────────────────────────────────────────────────────

  async sendPasswordReset(email: string, name: string, token: string) {
    const resetUrl = `${this.frontendUrl}/sifre-sifirla?token=${token}`;
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Şifrenizi sıfırlamak için bir talep aldık. Aşağıdaki bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz.
      </p>
      ${this.ctaButton('Şifremi Sıfırla', resetUrl)}
      <p style="color:#4a4a4a;font-size:13px;margin-top:24px">
        Bu bağlantı <strong>30 dakika</strong> geçerlidir. Eğer bu talebi siz yapmadıysanız bu maili görmezden gelebilirsiniz.
      </p>
    `;
    await this.send(email, name, 'Şifre Sıfırlama Talebi', this.buildEmailHtml('Şifrenizi Sıfırlayın', body));
  }

  // ─── İletişim Formu Onayı ─────────────────────────────────────────────────

  async sendContactConfirmation(email: string, name: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Mesajınız başarıyla alındı. Ekibimiz en kısa sürede sizinle iletişime geçecek.
      </p>
      ${this.ctaButton('Uzmanları İncele', `${this.frontendUrl}/uzmanlar`)}
    `;
    await this.send(email, name, 'Mesajınız Alındı', this.buildEmailHtml('Mesajınız Alındı', body));
  }

  // ─── Admin: Yeni İletişim Formu Bildirimi ─────────────────────────────────

  async sendNewContactFormAdmin(data: { fullName: string; email: string; subject: string; message: string }) {
    const adminMail = this.adminEmail;
    if (!adminMail) return;
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Yeni bir iletişim formu gönderildi.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600;width:120px">Gönderen</td><td style="padding:8px">${data.fullName}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">E-posta</td><td style="padding:8px">${data.email}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Konu</td><td style="padding:8px">${data.subject}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Mesaj</td><td style="padding:8px">${data.message}</td></tr>
      </table>
      ${this.ctaButton('Admin Paneline Git', `${this.frontendUrl}/admin/formlar/talepler`)}
    `;
    await this.send(adminMail, 'Admin', `Yeni İletişim Formu: ${data.subject}`, this.buildEmailHtml('Yeni İletişim Formu', body));
  }

  // ─── Danışan Hoş Geldiniz ─────────────────────────────────────────────────

  async sendWelcomeDanisan(email: string, name: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Platforma hoş geldiniz! Hesabınız başarıyla oluşturuldu.
        Şimdi size en uygun uzmanı bulabilir, ücretsiz ön görüşme talep edebilirsiniz.
      </p>
      ${this.ctaButton('Uzman Bul', `${this.frontendUrl}/uzmanlar`)}
    `;
    await this.send(email, name, 'Platforma Hoş Geldiniz!', this.buildEmailHtml('Hoş Geldiniz 🎉', body));
  }

  // ─── Admin: Yeni Uzman Başvurusu ──────────────────────────────────────────

  async sendNewExpertApplicationAdmin(expertName: string, expertEmail: string) {
    const adminMail = this.adminEmail;
    if (!adminMail) return;
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Yeni bir uzman başvurusu yapıldı.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px">
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600;width:120px">Ad Soyad</td><td style="padding:8px">${expertName}</td></tr>
        <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">E-posta</td><td style="padding:8px">${expertEmail}</td></tr>
      </table>
      ${this.ctaButton('Başvuruyu İncele', `${this.frontendUrl}/admin/uzman-onay/basvurular`)}
    `;
    await this.send(adminMail, 'Admin', 'Yeni Uzman Başvurusu', this.buildEmailHtml('Yeni Uzman Başvurusu', body));
  }

  // ─── Uzman Profil Onay ────────────────────────────────────────────────────

  async sendExpertProfileApproved(email: string, name: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Profiliniz incelendi ve yayına alındı. Artık danışanlar sizi bulabilir ve görüşme talep edebilir.
      </p>
      ${this.ctaButton('Profilimi Görüntüle', `${this.frontendUrl}/uzman/profil`)}
    `;
    await this.send(email, name, 'Profiliniz Onaylandı!', this.buildEmailHtml('Profiliniz Yayında 🎉', body));
  }

  // ─── Blog Onay ─────────────────────────────────────────────────────────────

  async sendBlogApproved(email: string, name: string, blogTitle: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        <strong>"${blogTitle}"</strong> başlıklı blog yazınız onaylandı ve yayına alındı.
      </p>
      ${this.ctaButton('Blog Yazımı Görüntüle', `${this.frontendUrl}/uzman/blog`)}
    `;
    await this.send(email, name, `Blog yazınız yayında: "${blogTitle}"`, this.buildEmailHtml('Blog Yazınız Onaylandı 🎉', body));
  }

  // ─── Blog Red ──────────────────────────────────────────────────────────────

  async sendBlogRejected(email: string, name: string, blogTitle: string, adminNote: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        <strong>"${blogTitle}"</strong> başlıklı blog yazınız incelendi ancak yayına alınamadı.
      </p>
      <div style="background:#fff3f3;border-left:4px solid #dc2626;padding:14px 18px;margin:20px 0;border-radius:4px">
        <strong style="color:#dc2626">Admin Notu:</strong>
        <p style="color:#1a1a1a;margin:8px 0 0">${adminNote}</p>
      </div>
      <p style="color:#4a4a4a;line-height:1.7">Düzeltip tekrar gönderebilirsiniz.</p>
      ${this.ctaButton('Blog Yazımı Düzenle', `${this.frontendUrl}/uzman/blog`)}
    `;
    await this.send(email, name, `Blog yazınız hakkında bilgi: "${blogTitle}"`, this.buildEmailHtml('Blog Yazısı Güncellemesi Gerekli', body));
  }

  // ─── Admin Uyarı → Uzman (R18) ─────────────────────────────────────────────

  async sendAdminWarningToExpert(email: string, name: string, message: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:14px 18px;margin:20px 0;border-radius:4px">
        <strong style="color:#b45309">Admin Mesajı:</strong>
        <p style="color:#1a1a1a;margin:8px 0 0">${message}</p>
      </div>
      ${this.ctaButton('Bildirimlerime Git', `${this.frontendUrl}/uzman/bildirimler`)}
    `;
    await this.send(email, name, 'Platform Yönetiminden Bildirim', this.buildEmailHtml('Yönetimden Mesajınız Var', body));
  }

  // ─── Admin Tarafından Oluşturulan Uzman Hoş Geldiniz ─────────────────────

  async sendWelcomeExpertByAdmin(email: string, name: string, password: string) {
    const loginUrl = `${this.frontendUrl}/uzman/giris`;
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Platform yönetimi tarafından uzman hesabınız oluşturuldu.
        Aşağıdaki bilgilerle giriş yapabilir ve profilinizi tamamlayabilirsiniz.
      </p>
      <div style="background:#e6f0ee;border-radius:8px;padding:16px 20px;margin:20px 0">
        <p style="margin:0 0 8px;font-size:13px;color:#4a4a4a">Giriş bilgileriniz:</p>
        <p style="margin:0 0 4px"><strong>E-posta:</strong> ${email}</p>
        <p style="margin:0"><strong>Şifre:</strong> ${password}</p>
      </div>
      <p style="color:#4a4a4a;font-size:13px;line-height:1.7">
        Güvenliğiniz için giriş yaptıktan sonra şifrenizi değiştirmenizi öneririz.
        Profilinizi tamamladıktan sonra inceleme için admin onayına gönderilecektir.
      </p>
      ${this.ctaButton('Giriş Yap ve Profilimi Tamamla', loginUrl)}
    `;
    await this.send(email, name, 'Uzman hesabınız oluşturuldu — Platforma hoş geldiniz!', this.buildEmailHtml('Hesabınız Hazır', body));
  }

  // ─── Uzman Profil Red ─────────────────────────────────────────────────────

  async sendExpertProfileRejected(email: string, name: string, adminNote: string) {
    const body = `
      <p style="color:#1a1a1a;line-height:1.7">Merhaba <strong>${name}</strong>,</p>
      <p style="color:#4a4a4a;line-height:1.7">
        Profiliniz incelendi ancak bazı eksiklikler nedeniyle yayına alınamadı.
      </p>
      <div style="background:#fff3f3;border-left:4px solid #dc2626;padding:14px 18px;margin:20px 0;border-radius:4px">
        <strong style="color:#dc2626">Admin Notu:</strong>
        <p style="color:#1a1a1a;margin:8px 0 0">${adminNote}</p>
      </div>
      <p style="color:#4a4a4a;line-height:1.7">
        Belirtilen eksiklikleri giderdikten sonra profilinizi tekrar gönderebilirsiniz.
      </p>
      ${this.ctaButton('Profili Düzenle', `${this.frontendUrl}/uzman/profil`)}
    `;
    await this.send(email, name, 'Profiliniz Hakkında Bilgi', this.buildEmailHtml('Profil Güncellemesi Gerekli', body));
  }
}
