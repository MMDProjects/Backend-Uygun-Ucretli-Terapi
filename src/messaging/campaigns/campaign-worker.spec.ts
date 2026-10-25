import { ConfigService } from '@nestjs/config';
import {
  ContactType,
  RecipientStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaSenderService } from '../../webhooks/meta-sender.service';
import { CampaignsService } from './campaigns.service';
import { CampaignWorker } from './campaign-worker';

// İstanbul 23:00 (sessiz saat içinde) ve 12:00 (gönderim saati).
const DAYTIME = new Date('2026-10-25T09:00:00.000Z');
const QUIET_NIGHT = new Date('2026-10-25T20:00:00.000Z');

const TEMPLATE = {
  id: 'tpl-1',
  name: 'hatirlatma',
  language: 'tr',
  category: TemplateCategory.UTILITY,
  status: TemplateStatus.APPROVED,
  bodyText: 'Merhaba {{1}}',
  variableCount: 1,
};

function buildPrisma() {
  return {
    campaign: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    campaignRecipient: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
    },
    whatsAppTemplate: {
      findUnique: jest.fn().mockResolvedValue(TEMPLATE),
    },
    contact: {
      findUnique: jest.fn().mockResolvedValue({
        fullName: 'Ayşe Demir',
        phone: '905551112233',
        contactType: ContactType.DANISAN,
        marketingOptOut: false,
        reminderOptOut: false,
      }),
    },
  };
}

function buildWorker(
  prisma: ReturnType<typeof buildPrisma>,
  opts: { enabled?: boolean; rate?: string } = {},
) {
  const env: Record<string, string> = {
    CAMPAIGN_RATE_PER_MINUTE: opts.rate ?? '60',
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const meta = {
    sendTemplate: jest.fn().mockResolvedValue({
      ok: true,
      messageId: 'wamid.1',
    }),
  };
  const campaigns = {
    loadSettings: jest.fn().mockResolvedValue({
      id: 's-1',
      campaignsEnabled: opts.enabled ?? true,
      campaignUnitPrice: null,
      reminderQuietStart: 21,
      reminderQuietEnd: 9,
    }),
    recountFor: jest.fn().mockResolvedValue(undefined),
  };
  const worker = new CampaignWorker(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    meta as unknown as MetaSenderService,
    campaigns as unknown as CampaignsService,
  );
  return { worker, meta, campaigns };
}

describe('CampaignWorker', () => {
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'c-1',
        templateId: TEMPLATE.id,
        paramMapping: [{ source: 'firstName' }],
      },
    ]);
  });

  it('kampanya kapalıyken hiçbir şey göndermez ve durumu korur', async () => {
    const { worker, meta } = buildWorker(prisma, { enabled: false });

    expect(await worker.tick(DAYTIME)).toBe('paused');
    expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('sessiz saatte gönderim yapmaz', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);

    expect(await worker.tick(QUIET_NIGHT)).toBe('quiet');
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('sessiz saatte de açık alıcısı kalmayan SENDING kampanyayı sayar', async () => {
    const { worker, meta, campaigns } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([]);

    expect(await worker.tick(QUIET_NIGHT)).toBe('quiet');
    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(campaigns.recountFor).toHaveBeenCalledWith('c-1');
  });

  it('SCHEDULED kampanya yalnızca scheduledAt geldiğinde SENDING olur', async () => {
    const scheduledAt = new Date(DAYTIME.getTime() + 60 * 60 * 1000);
    let status: string = 'SCHEDULED';
    // Koşulu bellekte uygular: scheduledAt <= now ise durum değişir.
    prisma.campaign.updateMany.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { status: string; scheduledAt: { lte: Date } };
        data: { status: string };
      }) => {
        const due = scheduledAt.getTime() <= where.scheduledAt.lte.getTime();
        if (where.status === status && due) {
          status = data.status;
          return Promise.resolve({ count: 1 });
        }
        return Promise.resolve({ count: 0 });
      },
    );
    prisma.campaign.findMany.mockImplementation(
      ({ where }: { where: { status: string } }) =>
        Promise.resolve(
          where.status === status
            ? [
                {
                  id: 'c-1',
                  templateId: TEMPLATE.id,
                  paramMapping: [{ source: 'firstName' }],
                },
              ]
            : [],
        ),
    );
    const { worker } = buildWorker(prisma);

    await worker.tick(DAYTIME);
    expect(status).toBe('SCHEDULED');

    await worker.tick(scheduledAt);
    expect(status).toBe('SENDING');
    expect(prisma.campaign.updateMany).toHaveBeenLastCalledWith({
      where: { status: 'SCHEDULED', scheduledAt: { lte: scheduledAt } },
      data: { status: 'SENDING', startedAt: scheduledAt },
    });
  });

  it('dakikalık hız sınırını aşmaz', async () => {
    const { worker, meta } = buildWorker(prisma, { rate: '2' });
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
      { id: 'r-2', contactId: 'k-2', attempts: 0 },
      { id: 'r-3', contactId: 'k-3', attempts: 0 },
    ]);

    expect(await worker.tick(DAYTIME)).toBe('ran');
    expect(meta.sendTemplate).toHaveBeenCalledTimes(2);
  });

  it('son bir dakikada gönderilenler bütçeden düşülür', async () => {
    const { worker, meta } = buildWorker(prisma, { rate: '5' });
    prisma.campaignRecipient.count.mockResolvedValue(5);

    expect(await worker.tick(DAYTIME)).toBe('rate_limited');
    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('hız sınırına takılan turda da SENDING kampanyaların sayıları yenilenir', async () => {
    const { worker, meta, campaigns } = buildWorker(prisma, { rate: '5' });
    prisma.campaignRecipient.count.mockResolvedValue(5);

    expect(await worker.tick(DAYTIME)).toBe('rate_limited');
    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(campaigns.recountFor).toHaveBeenCalledWith('c-1');
  });

  it('gönderimden hemen önce DUR diyeni SKIPPED yapar, göndermez', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);
    prisma.contact.findUnique.mockResolvedValue({
      fullName: 'Ayşe',
      phone: '905551112233',
      contactType: ContactType.DANISAN,
      marketingOptOut: true,
      reminderOptOut: false,
    });

    await worker.tick(DAYTIME);

    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: RecipientStatus.SKIPPED, skipReason: 'opt_out' },
    });
  });

  it('gönderim başarılıysa SENT, messageId ve sentAt yazar', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);

    await worker.tick(DAYTIME);

    expect(meta.sendTemplate).toHaveBeenCalledWith('905551112233', {
      name: 'hatirlatma',
      language: 'tr',
      params: ['Ayşe'],
    });
    expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: expect.objectContaining({
        status: RecipientStatus.SENT,
        messageId: 'wamid.1',
      }),
    });
  });

  it('ilk hatada alıcıyı bekleyene alır, ikinci hatada FAILED yapar', async () => {
    const { worker, meta } = buildWorker(prisma);
    meta.sendTemplate.mockResolvedValue({ ok: false, error: 'HTTP 500' });
    prisma.campaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);

    await worker.tick(DAYTIME);
    expect(prisma.campaignRecipient.update).toHaveBeenLastCalledWith({
      where: { id: 'r-1' },
      data: { status: RecipientStatus.PENDING, error: 'HTTP 500' },
    });

    prisma.campaignRecipient.findMany.mockResolvedValueOnce([
      { id: 'r-1', contactId: 'k-1', attempts: 1 },
    ]);
    await worker.tick(DAYTIME);
    expect(prisma.campaignRecipient.update).toHaveBeenLastCalledWith({
      where: { id: 'r-1' },
      data: { status: RecipientStatus.FAILED, error: 'HTTP 500' },
    });
  });

  it('koşullu güncelleme başarısızsa aynı alıcıyı göndermez', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);
    prisma.campaignRecipient.updateMany.mockResolvedValue({ count: 0 });

    await worker.tick(DAYTIME);

    expect(meta.sendTemplate).not.toHaveBeenCalled();
  });

  it('şablon kullanılamazsa kampanyayı READY yapar ve göndermez', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.whatsAppTemplate.findUnique.mockResolvedValue({
      ...TEMPLATE,
      status: TemplateStatus.PAUSED,
    });
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);

    await worker.tick(DAYTIME);

    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', status: 'SENDING' },
      data: { status: 'READY' },
    });
  });

  it('Meta kabul ettikten sonra alıcı kaydı yazılamazsa yeniden göndermez', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);
    prisma.campaignRecipient.update.mockRejectedValueOnce(new Error('db'));

    await worker.tick(DAYTIME);

    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(prisma.campaignRecipient.update).toHaveBeenLastCalledWith({
      where: { id: 'r-1' },
      data: expect.objectContaining({
        status: RecipientStatus.FAILED,
        messageId: 'wamid.1',
      }),
    });
  });

  it('test ortamında zamanlayıcı başlamaz', () => {
    const { worker } = buildWorker(prisma);
    const spy = jest.spyOn(global, 'setInterval');
    worker.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('CampaignWorker kurtarma ve devam', () => {
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: 'c-1',
        templateId: TEMPLATE.id,
        paramMapping: [{ source: 'firstName' }],
      },
    ]);
  });

  it('10 dakikadan uzun SENDING alıcıları bekleyene geri alır', async () => {
    const { worker } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([]);

    await worker.tick(DAYTIME);

    expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        campaignId: { in: ['c-1'] },
        status: RecipientStatus.SENDING,
        updatedAt: { lt: new Date(DAYTIME.getTime() - 10 * 60 * 1000) },
      },
      data: { status: RecipientStatus.PENDING },
    });
  });

  it('Meta çağrısı fırlatırsa alıcı SENDING de kalmaz, bekleyene alınır', async () => {
    const { worker, meta } = buildWorker(prisma);
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-1', contactId: 'k-1', attempts: 0 },
    ]);
    meta.sendTemplate.mockRejectedValue(new Error('ağ hatası'));

    await worker.tick(DAYTIME);

    expect(prisma.campaignRecipient.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { status: RecipientStatus.PENDING, error: 'ağ hatası' },
    });
  });

  it('yeniden başlatmadan sonra yeni işçi kalan PENDING alıcılarla devam eder', async () => {
    // Önceki süreçte SENT olan alıcılar tekrar gelmez; kalan alıcılar gider.
    prisma.campaignRecipient.findMany.mockResolvedValue([
      { id: 'r-2', contactId: 'k-2', attempts: 0 },
    ]);
    const restarted = buildWorker(prisma);

    expect(await restarted.worker.tick(DAYTIME)).toBe('ran');
    expect(restarted.meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(prisma.campaignRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          campaignId: 'c-1',
          included: true,
          status: RecipientStatus.PENDING,
        },
      }),
    );
  });
});
