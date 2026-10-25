import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CrisisAlertService } from './crisis-alert.service';

function buildPrisma(conversation: any) {
  return {
    conversation: {
      findUnique: jest.fn<any, any>().mockResolvedValue(conversation),
    },
  };
}

function buildMail() {
  return {
    sendCrisisAlert: jest.fn<any, any>().mockResolvedValue(undefined),
  };
}

function buildConfig(values: Record<string, string>) {
  return {
    get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
  };
}

function build(
  prisma: unknown,
  mail: ReturnType<typeof buildMail>,
  config: Record<string, string>,
) {
  return new CrisisAlertService(
    prisma as PrismaService,
    mail as unknown as MailService,
    buildConfig(config) as unknown as ConfigService,
  );
}

describe('CrisisAlertService', () => {
  const conversation = {
    channel: 'WHATSAPP',
    contact: { fullName: null, phone: '+90 532 123 4567' },
  };

  it('alıcıyı CRISIS_ALERT_EMAILS listesinden alır ve adı telefon sonu ile gizler', async () => {
    const mail = buildMail();
    const service = build(buildPrisma(conversation), mail, {
      CRISIS_ALERT_EMAILS: 'a@x.com, b@x.com ,',
      ADMIN_NOTIFICATION_EMAIL: 'admin@x.com',
      FRONTEND_URL: 'https://panel.example.com/',
    });

    await service.alert('conv-1', 'detected');

    expect(mail.sendCrisisAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@x.com', 'b@x.com'],
        contactLabel: '•••• 4567',
        channel: 'WhatsApp',
        link: 'https://panel.example.com/admin/mesajlar?c=conv-1',
      }),
    );
  });

  it('CRISIS_ALERT_EMAILS boşsa ADMIN_NOTIFICATION_EMAIL kullanır', async () => {
    const mail = buildMail();
    const service = build(buildPrisma(conversation), mail, {
      ADMIN_NOTIFICATION_EMAIL: 'admin@x.com',
    });
    await service.alert('conv-2', 'repeat');
    expect(mail.sendCrisisAlert.mock.calls[0][0].to).toEqual(['admin@x.com']);
  });

  it('isim varsa etiket olarak ismi kullanır', async () => {
    const mail = buildMail();
    const service = build(
      buildPrisma({
        channel: 'WHATSAPP',
        contact: { fullName: 'Ayşe Yılmaz', phone: '905321234567' },
      }),
      mail,
      { ADMIN_NOTIFICATION_EMAIL: 'admin@x.com' },
    );
    await service.alert('conv-3', 'handoff');
    expect(mail.sendCrisisAlert.mock.calls[0][0].contactLabel).toBe(
      'Ayşe Yılmaz',
    );
  });

  it('telefonsuz Instagram danışanında "Instagram danışanı" etiketini kullanır', async () => {
    const mail = buildMail();
    const service = build(
      buildPrisma({
        channel: 'INSTAGRAM',
        contact: { fullName: null, phone: null },
      }),
      mail,
      { ADMIN_NOTIFICATION_EMAIL: 'admin@x.com' },
    );
    await service.alert('conv-4', 'detected');
    expect(mail.sendCrisisAlert.mock.calls[0][0].contactLabel).toBe(
      'Instagram danışanı',
    );
  });

  it('aynı konuşma için 10 dakika içinde tekrar göndermez', async () => {
    const mail = buildMail();
    const service = build(buildPrisma(conversation), mail, {
      ADMIN_NOTIFICATION_EMAIL: 'admin@x.com',
    });
    await service.alert('conv-5', 'detected');
    await service.alert('conv-5', 'repeat');
    expect(mail.sendCrisisAlert).toHaveBeenCalledTimes(1);
  });

  it('alıcı yoksa göndermez ve hata fırlatmaz', async () => {
    const mail = buildMail();
    const service = build(buildPrisma(conversation), mail, {});
    await expect(service.alert('conv-6', 'detected')).resolves.toBeUndefined();
    expect(mail.sendCrisisAlert).not.toHaveBeenCalled();
  });

  it('mail hatasını yutar ve çağırana hata vermez', async () => {
    const mail = buildMail();
    mail.sendCrisisAlert.mockRejectedValue(new Error('smtp down'));
    const service = build(buildPrisma(conversation), mail, {
      ADMIN_NOTIFICATION_EMAIL: 'admin@x.com',
    });
    await expect(service.alert('conv-7', 'detected')).resolves.toBeUndefined();
  });
});
