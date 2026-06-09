import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

type KvkkSection = { id: string; title: string; html: string };

const DEFAULT_KVKK_VERSION = '2026-06';

const DEFAULT_KVKK_SECTIONS: KvkkSection[] = [
  {
    id: 'veri-sorumlusu',
    title: '1. Veri Sorumlusu',
    html: '<p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında kişisel verileriniz; veri sorumlusu sıfatıyla <strong>Uygun Ücretli Terapi</strong> (bundan böyle "Platform" olarak anılacaktır) tarafından aşağıda açıklanan amaçlar doğrultusunda işlenmektedir.</p>',
  },
  {
    id: 'islenen-veriler',
    title: '2. İşlenen Kişisel Veriler',
    html: '<p>Platform tarafından aşağıdaki kişisel veri kategorileri işlenmektedir:</p><ul><li><strong>Kimlik Verileri:</strong> Ad, soyad, kullanıcı adı.</li><li><strong>İletişim Verileri:</strong> E-posta adresi, telefon numarası.</li><li><strong>İşlem Güvenliği Verileri:</strong> Şifrelenmiş parola, giriş zamanı, IP adresi log kayıtları.</li><li><strong>Özel Nitelikli Kişisel Veriler:</strong> Psikolojik değerlendirme testi sonuçları ve danışmanlık talep içerikleri (yalnızca açık rızanıza dayanılarak işlenir).</li><li><strong>Pazarlama Verileri:</strong> Bülten aboneliği tercihi (isteğe bağlı, ayrı onaya tabidir).</li></ul>',
  },
  {
    id: 'isleme-amaclari',
    title: '3. Kişisel Verilerin İşlenme Amaçları',
    html: '<p>Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:</p><ul><li>Üyelik kaydının oluşturulması ve hesap güvenliğinin sağlanması</li><li>Uzman ile danışan arasındaki eşleşme sürecinin yürütülmesi</li><li>Ücretsiz ön görüşme talebinin iletilmesi ve takibi</li><li>Psikolojik değerlendirme testlerinin uygulanması ve sonuçların arşivlenmesi</li><li>Platform ile ilgili teknik destek, bilgilendirme ve iletişim faaliyetlerinin yürütülmesi</li><li>Yasal yükümlülüklerin yerine getirilmesi ve mevzuata uyum</li><li>İzin vermeniz hâlinde elektronik ticari ileti (bülten) gönderilmesi</li></ul>',
  },
  {
    id: 'hukuki-sebepler',
    title: '4. Hukuki Sebepler',
    html: '<p>Kişisel verileriniz KVKK\'nın 5. ve 6. maddeleri kapsamında aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:</p><ul><li>Açık rızanızın varlığı (özel nitelikli veriler ve pazarlama iletişimi için)</li><li>Sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması</li><li>Veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi</li><li>İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaat</li></ul>',
  },
  {
    id: 'veri-aktarimi',
    title: '5. Kişisel Verilerin Aktarılması',
    html: '<p>Kişisel verileriniz; KVKK\'nın 8. ve 9. maddeleri çerçevesinde aşağıdaki taraflarla paylaşılabilir:</p><ul><li>Onaylı uzmanlar — yalnızca talep gönderdiğiniz veya eşleştiğiniz uzmanlarla sınırlı bilgi paylaşımı</li><li>Altyapı hizmet sağlayıcıları — barındırma, e-posta (Brevo/Sendinblue) ve depolama (AWS S3 / Cloudinary) hizmetleri</li><li>Yasal zorunluluk hâlinde ilgili kamu kurum ve kuruluşları</li></ul><p>Kişisel verileriniz, yukarıda sayılanlar dışında üçüncü taraflarla paylaşılmaz; ticari amaçla satılmaz, kiralanmaz veya başka şekilde kullanıma sunulmaz.</p>',
  },
  {
    id: 'veri-toplama-yontemi',
    title: '6. Veri Toplama Yöntemi',
    html: '<p>Kişisel verileriniz; kayıt ve giriş formları, iletişim ve talep formları, test çözme ekranları ile çerezler (cookies) aracılığıyla elektronik ortamda toplanmaktadır. Psikolojik değerlendirme testi sonuçları gibi özel nitelikli veriler yalnızca açık rızanıza dayanılarak ve AES-256 şifreleme yöntemiyle güvenli biçimde saklanmaktadır.</p>',
  },
  {
    id: 'haklariniz',
    title: '7. Haklarınız (KVKK Madde 11)',
    html: '<p>KVKK\'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p><ul><li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li><li>İşlenmişse buna ilişkin bilgi talep etme</li><li>İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme</li><li>Yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme</li><li>Eksik veya yanlış işlenmiş kişisel verilerin düzeltilmesini isteme</li><li>KVKK\'nın 7. maddesinde öngörülen şartlar çerçevesinde kişisel verilerin silinmesini veya yok edilmesini isteme</li><li>Otomatik sistemler vasıtasıyla aleyhinize bir sonucun ortaya çıkmasına itiraz etme</li><li>Kanuna aykırı işleme nedeniyle zararın giderilmesini talep etme</li></ul><p>Bu haklarınızı kullanmak için <a href="mailto:uygunucretliterapi@gmail.com">uygunucretliterapi@gmail.com</a> adresine yazılı olarak başvurabilirsiniz. Başvurularınız en geç <strong>30 gün</strong> içinde yanıtlanacaktır.</p>',
  },
  {
    id: 'cerezler',
    title: '8. Çerez (Cookie) Politikası',
    html: '<p>Platform, oturum yönetimi ve kullanıcı deneyimini iyileştirmek amacıyla zorunlu çerezler kullanmaktadır. Bu çerezler kişisel kimliğinizi doğrudan tanımlamaz; yalnızca oturum güvenliğini sağlar. Tarayıcı ayarlarından çerez tercihlerinizi yönetebilirsiniz; ancak bazı işlevlerin bu durumda kısıtlanabileceğini hatırlatırız.</p>',
  },
  {
    id: 'guncelleme',
    title: '9. Güncelleme ve İletişim',
    html: '<p>Bu aydınlatma metni yasal düzenlemelere veya platform uygulamalarındaki değişikliklere bağlı olarak güncellenebilir. Güncel metin her zaman bu sayfada yayımlanır. Sorularınız için <a href="mailto:uygunucretliterapi@gmail.com">uygunucretliterapi@gmail.com</a> adresinden bize ulaşabilirsiniz.</p>',
  },
];

const DEFAULT_ANNOUNCEMENT_ITEMS = [
  'Admin onaylı, sertifikalı uzman profilleri',
  'Ücretsiz ön görüşme imkânı — WhatsApp üzerinden hemen başla',
  'KVKK uyumlu, güvenli ve gizli platformdur',
  'Her uzman belgelerini danışanlarıyla şeffaf paylaşır',
];

const DEFAULT_LOGIN_POPUP_SETTINGS = {
  title: "Ücretsiz Ön Görüşme\nHakkınız Hazır",
  description: "Platforma hoş geldiniz. Size özel ücretsiz ön görüşme hakkınızı kullanarak doğru uzmanı bulmanıza yardımcı olalım.",
  benefits: ["30 dakikalık tanışma seansı", "Uzmanla birebir değerlendirme", "Hiçbir ücret talep edilmez"],
  buttonText: "Uzmanları İncele",
  buttonUrl: "/uzmanlar",
};

const DEFAULT_WHEEL_SEGMENTS = [
  { label: 'Ön Görüş.', description: 'Ücretsiz ön görüşme hakkı — 20 dk WhatsApp görüşmesi' },
  { label: '%10 İnd.', description: 'İlk seansta %10 indirim fırsatı' },
  { label: 'Tekrar!', description: 'Bu sefer olmadı — bir daha dene!' },
  { label: 'Bedava!', description: 'Ücretsiz ilk seans hakkı kazandın' },
  { label: '%20 İnd.', description: 'İlk seansta %20 indirim fırsatı' },
  { label: 'Sürpriz!', description: 'Özel sürpriz ödül — WhatsApp\'tan talep et' },
];

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getPublicSettings() {
    const s = await this.prisma.systemSetting.findFirst();
    const raw = (s?.announcementItems as string[] | null) ?? [];
    const items = raw.length > 0 ? raw : DEFAULT_ANNOUNCEMENT_ITEMS;

    const rawSegments = (s?.wheelSegments as { label: string; description: string }[] | null) ?? [];
    const segments = rawSegments.length >= 2 ? rawSegments : DEFAULT_WHEEL_SEGMENTS;

    const rawWinners = (s?.wheelWinnerIndices as number[] | null) ?? [];
    const winnerIndices = rawWinners.filter((i) => i >= 0 && i < segments.length);

    if (s && raw.length === 0) {
      await this.prisma.systemSetting.update({
        where: { id: s.id },
        data: { announcementItems: DEFAULT_ANNOUNCEMENT_ITEMS },
      }).catch(() => {});
    }

    const rawPopup = (s?.loginPopupSettings as Record<string, unknown> | null) ?? {};
    const loginPopupSettings = Object.keys(rawPopup).length > 0
      ? rawPopup
      : DEFAULT_LOGIN_POPUP_SETTINGS;

    return {
      standardPrice: Number(s?.standardPrice ?? 1500),
      discountedPrice: Number(s?.discountedPrice ?? 1000),
      whatsappNumber: s?.whatsappNumber ?? '',
      videoUrl: s?.videoUrl ?? null,
      announcementItems: items,
      wheelSegments: segments,
      wheelWinnerIndices: winnerIndices,
      loginPopupSettings,
    };
  }

  async getPublicKvkk() {
    const active = await this.prisma.kvkkVersion.findFirst({ where: { isActive: true } });
    if (active) {
      return { id: active.id, version: active.version, sections: active.sections as KvkkSection[] };
    }
    return { id: null, version: DEFAULT_KVKK_VERSION, sections: DEFAULT_KVKK_SECTIONS };
  }

  async getKvkkContent() {
    const versions = await this.prisma.kvkkVersion.findMany({
      orderBy: { publishedAt: 'desc' },
      select: { id: true, version: true, publishedAt: true, isActive: true },
    });
    const active = versions.find((v) => v.isActive);
    const activeDetail = active
      ? await this.prisma.kvkkVersion.findUnique({ where: { id: active.id } })
      : null;
    const defaultSections = DEFAULT_KVKK_SECTIONS;
    return {
      success: true,
      data: {
        active: activeDetail
          ? { id: activeDetail.id, version: activeDetail.version, sections: activeDetail.sections as KvkkSection[], publishedAt: activeDetail.publishedAt }
          : { id: null, version: DEFAULT_KVKK_VERSION, sections: defaultSections, publishedAt: null },
        history: versions,
      },
    };
  }

  async publishKvkkVersion(version: string, sections: KvkkSection[]) {
    const jsonSections = sections as unknown as import('@prisma/client').Prisma.InputJsonValue;
    await this.prisma.kvkkVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const created = await this.prisma.kvkkVersion.create({
      data: { version, sections: jsonSections, isActive: true },
    });
    return { success: true, data: { id: created.id, version: created.version, publishedAt: created.publishedAt }, message: 'Yeni KVKK versiyonu yayınlandı.' };
  }
}
