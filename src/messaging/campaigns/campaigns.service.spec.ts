import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  ContactType,
  RecipientStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

const TEMPLATE = {
  id: 'tpl-1',
  name: 'hatirlatma',
  language: 'tr',
  category: TemplateCategory.UTILITY,
  status: TemplateStatus.APPROVED,
  bodyText: 'Merhaba {{1}}, saat {{2}}',
  variableCount: 2,
};

function buildPrisma() {
  return {
    systemSetting: {
      findFirst: jest.fn().mockResolvedValue({
        id: 's-1',
        campaignsEnabled: true,
        campaignUnitPrice: null,
        reminderQuietStart: 21,
        reminderQuietEnd: 9,
      }),
      create: jest.fn(),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data),
      ),
    },
    campaign: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    campaignRecipient: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
    whatsAppTemplate: {
      findUnique: jest.fn().mockResolvedValue(TEMPLATE),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    contactListMember: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    contactList: {
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((ops: unknown) =>
      Promise.all(ops as Promise<unknown>[]),
    ),
  };
}

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    templateId: TEMPLATE.id,
    template: TEMPLATE,
    paramMapping: [
      { source: 'firstName' },
      { source: 'static', value: '14:00' },
    ],
    listIds: ['l-1'],
    audienceFilter: null,
    status: CampaignStatus.DRAFT,
    ...overrides,
  };
}

describe('CampaignsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new CampaignsService(prisma as unknown as PrismaService);
  });

  describe('prepare', () => {
    it('atlama sebeplerini sayar ve uygun alıcıyı PENDING yapar', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.contactListMember.findMany.mockResolvedValue([
        { contactId: 'a' },
        { contactId: 'b' },
        { contactId: 'c' },
        { contactId: 'd' },
        { contactId: 'e' },
      ]);
      prisma.contact.findMany.mockResolvedValue([
        ctc('a', '905551112233'),
        ctc('b', null),
        ctc('c', '905551112244', { marketingOptOut: true }),
        ctc('d', '905551112255', { contactType: ContactType.UZMAN }),
        ctc('e', '12345'),
      ]);

      const result = await service.prepare('c-1');

      expect(result).toEqual({
        campaignId: 'c-1',
        total: 5,
        eligible: 1,
        skipped: { no_phone: 1, not_client: 1, opt_out: 1, invalid_phone: 1 },
      });
      const a = upsertFor(prisma, 'a');
      expect(a.create).toEqual(
        expect.objectContaining({
          status: RecipientStatus.PENDING,
          included: true,
        }),
      );
      const b = upsertFor(prisma, 'b');
      expect(b.update).toEqual(
        expect.objectContaining({
          status: RecipientStatus.SKIPPED,
          skipReason: 'no_phone',
          included: false,
        }),
      );
      expect(prisma.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: CampaignStatus.READY } }),
      );
    });

    it('kişinin elle kaldırdığı seçimi (included=false) korur', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.contactListMember.findMany.mockResolvedValue([{ contactId: 'a' }]);
      prisma.contact.findMany.mockResolvedValue([ctc('a', '905551112233')]);
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { contactId: 'a', included: false, status: RecipientStatus.PENDING },
      ]);

      await service.prepare('c-1');

      const a = upsertFor(prisma, 'a');
      expect(a.update).toEqual({
        status: RecipientStatus.PENDING,
        skipReason: null,
      });
      expect(a.update).not.toHaveProperty('included');
    });

    it('daha önce atlanan ve artık uygun olan kişiyi yeniden dahil eder', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.contactListMember.findMany.mockResolvedValue([{ contactId: 'a' }]);
      prisma.contact.findMany.mockResolvedValue([ctc('a', '905551112233')]);
      prisma.campaignRecipient.findMany.mockResolvedValue([
        { contactId: 'a', included: false, status: RecipientStatus.SKIPPED },
      ]);

      await service.prepare('c-1');

      expect(upsertFor(prisma, 'a').update).toEqual(
        expect.objectContaining({
          included: true,
          status: RecipientStatus.PENDING,
        }),
      );
    });

    it('hedefteki liste silinmişse 400 döner ve alıcı üretmez', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ listIds: ['l-silinmis'] }),
      );
      prisma.contactList.count.mockResolvedValue(0);

      await expect(service.prepare('c-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.campaignRecipient.upsert).not.toHaveBeenCalled();
      expect(prisma.contactListMember.findMany).not.toHaveBeenCalled();
    });

    it('hedef kitle yoksa 400 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ listIds: [], audienceFilter: null }),
      );
      await expect(service.prepare('c-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('şablon onaylı değilse 400 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.whatsAppTemplate.findUnique.mockResolvedValue({
        ...TEMPLATE,
        status: TemplateStatus.PENDING,
      });
      await expect(service.prepare('c-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('updateRecipients', () => {
    it('yalnızca bekleyen alıcıların included değerini değiştirir', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.READY }),
      );
      prisma.campaignRecipient.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.updateRecipients('c-1', {
        contactIds: ['a', 'b'],
        included: false,
      });

      expect(result).toEqual({ updated: 2 });
      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: {
          campaignId: 'c-1',
          contactId: { in: ['a', 'b'] },
          status: RecipientStatus.PENDING,
        },
        data: { included: false },
      });
    });

    it('gönderim başladıysa 409 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.SENDING }),
      );
      await expect(
        service.updateRecipients('c-1', { contactIds: ['a'], included: false }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('send ve schedule kuralları', () => {
    it('kampanya ayarlardan kapalıysa 400 döner', async () => {
      prisma.systemSetting.findFirst.mockResolvedValue({
        id: 's-1',
        campaignsEnabled: false,
        campaignUnitPrice: null,
        reminderQuietStart: 21,
        reminderQuietEnd: 9,
      });
      await expect(service.send('c-1')).rejects.toThrow(
        'Toplu mesaj ayarlardan kapalı',
      );
    });

    it('READY değilse 400 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.DRAFT }),
      );
      await expect(service.send('c-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('gönderilecek alıcı yoksa 400 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.READY }),
      );
      prisma.campaignRecipient.count.mockResolvedValue(0);
      await expect(service.send('c-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('hemen gönderimde SENDING, zamanlamada SCHEDULED yapar', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.READY }),
      );
      prisma.campaignRecipient.count.mockResolvedValue(3);

      await service.send('c-1');
      expect(prisma.campaign.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CampaignStatus.SENDING }),
        }),
      );

      const future = new Date(Date.now() + 60 * 60 * 1000);
      await service.schedule('c-1', future);
      expect(prisma.campaign.updateMany).toHaveBeenLastCalledWith({
        where: { id: 'c-1', status: CampaignStatus.READY },
        data: { status: CampaignStatus.SCHEDULED, scheduledAt: future },
      });
    });

    it('geçmiş bir zamanı 400 ile reddeder', async () => {
      await expect(
        service.schedule('c-1', new Date(Date.now() - 1000)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('bekleyenleri SKIPPED (cancelled) yapar ve kampanyayı iptal eder', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.SCHEDULED }),
      );

      await service.cancel('c-1');

      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { campaignId: 'c-1', status: RecipientStatus.PENDING },
        data: { status: RecipientStatus.SKIPPED, skipReason: 'cancelled' },
      });
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: CampaignStatus.CANCELLED },
      });
    });

    it('tamamlanmış kampanya için 409 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: CampaignStatus.COMPLETED }),
      );
      await expect(service.cancel('c-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('recountFor', () => {
    it('sayaçları durumlardan hesaplar; yalnız dahil alıcılar recipientCount olur', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.SENDING,
      });
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        { status: RecipientStatus.SENT, included: true, _count: { _all: 2 } },
        {
          status: RecipientStatus.DELIVERED,
          included: true,
          _count: { _all: 1 },
        },
        { status: RecipientStatus.READ, included: true, _count: { _all: 1 } },
        { status: RecipientStatus.FAILED, included: true, _count: { _all: 1 } },
        {
          status: RecipientStatus.SKIPPED,
          included: false,
          _count: { _all: 3 },
        },
        {
          status: RecipientStatus.PENDING,
          included: true,
          _count: { _all: 1 },
        },
      ]);

      await service.recountFor('c-1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: {
          recipientCount: 6,
          sentCount: 4,
          deliveredCount: 2,
          readCount: 1,
          failedCount: 1,
          repliedCount: 0,
          skippedCount: 3,
        },
      });
      expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    });

    it('açık alıcı kalmazsa gönderilen kampanyayı COMPLETED yapar', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.SENDING,
      });
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        { status: RecipientStatus.SENT, included: true, _count: { _all: 2 } },
        {
          status: RecipientStatus.SKIPPED,
          included: false,
          _count: { _all: 1 },
        },
      ]);

      await service.recountFor('c-1');

      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'c-1', status: CampaignStatus.SENDING },
        data: expect.objectContaining({ status: CampaignStatus.COMPLETED }),
      });
    });

    it('bekleyen ya da gönderilen alıcı varken tamamlamaz', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'c-1',
        status: CampaignStatus.SENDING,
      });
      prisma.campaignRecipient.groupBy.mockResolvedValue([
        {
          status: RecipientStatus.SENDING,
          included: true,
          _count: { _all: 1 },
        },
      ]);

      await service.recountFor('c-1');

      expect(prisma.campaign.updateMany).not.toHaveBeenCalled();
    });
  });
});

function ctc(
  id: string,
  phone: string | null,
  overrides: Partial<{
    contactType: ContactType;
    marketingOptOut: boolean;
    reminderOptOut: boolean;
  }> = {},
) {
  return {
    id,
    phone,
    contactType: ContactType.DANISAN,
    marketingOptOut: false,
    reminderOptOut: false,
    ...overrides,
  };
}

function upsertFor(
  prisma: ReturnType<typeof buildPrisma>,
  contactId: string,
): { create: Record<string, unknown>; update: Record<string, unknown> } {
  const call = prisma.campaignRecipient.upsert.mock.calls.find(
    ([args]: [any]) => args.where.campaignId_contactId.contactId === contactId,
  );
  if (!call) throw new Error(`upsert bulunamadı: ${contactId}`);
  return call[0];
}

describe('CampaignsService önizleme, tahmin, rapor ve alıcı listesi', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new CampaignsService(prisma as unknown as PrismaService);
  });

  describe('preview', () => {
    it('ilk dahil ve bekleyen alıcı için doldurulmuş metni döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.campaignRecipient.findFirst.mockResolvedValue({
        contact: { fullName: 'Ayşe Demir' },
      });

      const result = await service.preview('c-1');

      expect(prisma.campaignRecipient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            campaignId: 'c-1',
            included: true,
            status: RecipientStatus.PENDING,
          },
        }),
      );
      expect(result).toEqual({
        text: 'Merhaba Ayşe, saat 14:00',
        recipientName: 'Ayşe Demir',
      });
    });

    it('alıcı yoksa metin null döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.campaignRecipient.findFirst.mockResolvedValue(null);

      expect(await service.preview('c-1')).toEqual({
        text: null,
        recipientName: null,
      });
    });

    it('kampanya yoksa 404 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.preview('yok')).rejects.toThrow(NotFoundException);
    });
  });

  describe('estimate', () => {
    it('gönderilecek sayı çarpı birim fiyat ile tahmini maliyet üretir', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.systemSetting.findFirst.mockResolvedValue({
        id: 's-1',
        campaignsEnabled: true,
        campaignUnitPrice: '0.5',
        reminderQuietStart: 21,
        reminderQuietEnd: 9,
      });
      prisma.campaignRecipient.count.mockResolvedValue(7);

      expect(await service.estimate('c-1')).toEqual({
        sendCount: 7,
        unitPrice: 0.5,
        estimatedCost: 3.5,
        currency: 'TRY',
      });
    });

    it('birim fiyat girilmemişse maliyet null döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.campaignRecipient.count.mockResolvedValue(4);

      expect(await service.estimate('c-1')).toEqual({
        sendCount: 4,
        unitPrice: null,
        estimatedCost: null,
        currency: 'TRY',
      });
    });
  });

  describe('report', () => {
    it('oranları, hata ve atlama nedenlerini gruplayarak döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({
          status: CampaignStatus.COMPLETED,
          recipientCount: 10,
          sentCount: 8,
          deliveredCount: 6,
          readCount: 3,
          repliedCount: 2,
          failedCount: 2,
          skippedCount: 1,
        }),
      );
      prisma.campaignRecipient.findMany.mockResolvedValue([
        {
          error: 'Meta hatası',
          attempts: 2,
          contact: { id: 'k-9', fullName: 'Ali', phone: '905550000009' },
        },
      ]);
      prisma.campaignRecipient.groupBy
        .mockResolvedValueOnce([{ error: 'Meta hatası', _count: { _all: 2 } }])
        .mockResolvedValueOnce([
          { skipReason: 'no_phone', _count: { _all: 1 } },
        ]);

      const report = await service.report('c-1');

      expect(report.rates).toEqual({
        delivery: 0.75,
        read: 0.5,
        reply: 0.25,
        failure: 0.2,
      });
      expect(report.failedRecipients).toEqual([
        {
          contact: { id: 'k-9', fullName: 'Ali', phone: '905550000009' },
          attempts: 2,
          error: 'Meta hatası',
        },
      ]);
      expect(report.errorReasons).toEqual([{ error: 'Meta hatası', count: 2 }]);
      expect(report.skipReasons).toEqual([{ reason: 'no_phone', count: 1 }]);
    });

    it('gönderim yoksa oranlar 0 olur', async () => {
      prisma.campaign.findUnique.mockResolvedValue(
        campaignRow({
          recipientCount: 0,
          sentCount: 0,
          deliveredCount: 0,
          readCount: 0,
          repliedCount: 0,
          failedCount: 0,
        }),
      );
      const report = await service.report('c-1');
      expect(report.rates).toEqual({
        delivery: 0,
        read: 0,
        reply: 0,
        failure: 0,
      });
    });
  });

  describe('listRecipients', () => {
    it('durum, dahil ve arama filtrelerini sorguya taşır', async () => {
      prisma.campaign.findUnique.mockResolvedValue(campaignRow());
      prisma.campaignRecipient.findMany.mockResolvedValue([{ id: 'r-1' }]);
      prisma.campaignRecipient.count.mockResolvedValue(1);

      const result = await service.listRecipients('c-1', {
        status: RecipientStatus.SKIPPED,
        included: false,
        q: 'Ayşe',
      });

      expect(prisma.campaignRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId: 'c-1',
            status: RecipientStatus.SKIPPED,
            included: false,
            contact: {
              OR: [
                { fullName: { contains: 'Ayşe', mode: 'insensitive' } },
                { phone: { contains: 'Ayşe' } },
              ],
            },
          }),
        }),
      );
      expect(result).toEqual({
        data: [{ id: 'r-1' }],
        total: 1,
        page: expect.any(Number),
        limit: expect.any(Number),
      });
    });

    it('kampanya yoksa 404 döner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.listRecipients('yok', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
