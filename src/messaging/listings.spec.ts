// Listeleme ve güncelleme servis testleri: şablon, kişi, kişi listesi ve
// kampanya. Veritabanı yerine sahte (mock) Prisma kullanılır.
import {
  CampaignStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetaTemplatesClient } from './templates/meta-templates.client';
import { TemplatesService } from './templates/templates.service';
import { ContactsAdminService } from './contacts/contacts-admin.service';
import { ContactListsService } from './contact-lists/contact-lists.service';
import { CampaignsService } from './campaigns/campaigns.service';
import { buildContactWhere } from './contacts/contact-filter';

const TEMPLATE = {
  id: 'tpl-1',
  name: 'hatirlatma',
  language: 'tr',
  category: TemplateCategory.UTILITY,
  status: TemplateStatus.APPROVED,
  bodyText: 'Merhaba {{1}}',
  variableCount: 1,
};

describe('TemplatesService.list', () => {
  it('durum ve kategori filtresini where koşuluna taşır', async () => {
    const prisma = {
      whatsAppTemplate: {
        findMany: jest.fn().mockResolvedValue([TEMPLATE]),
      },
    };
    const service = new TemplatesService(
      prisma as unknown as PrismaService,
      {} as unknown as MetaTemplatesClient,
    );

    const rows = await service.list({
      status: TemplateStatus.APPROVED,
      category: TemplateCategory.UTILITY,
    });

    expect(prisma.whatsAppTemplate.findMany).toHaveBeenCalledWith({
      where: {
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.UTILITY,
      },
      orderBy: { updatedAt: 'desc' },
    });
    expect(rows).toEqual([TEMPLATE]);
  });

  it('filtre yoksa where alanları tanımsız kalır (tümü listelenir)', async () => {
    const prisma = {
      whatsAppTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TemplatesService(
      prisma as unknown as PrismaService,
      {} as unknown as MetaTemplatesClient,
    );

    await service.list({});

    expect(prisma.whatsAppTemplate.findMany).toHaveBeenCalledWith({
      where: { status: undefined, category: undefined },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('ContactsAdminService.list', () => {
  it('sayfalama ve sıralamayı uygular, toplamı aynı where ile sayar', async () => {
    const prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([{ id: 'k-1' }]),
        count: jest.fn().mockResolvedValue(25),
      },
    };
    const service = new ContactsAdminService(
      prisma as unknown as PrismaService,
    );
    const query = { q: 'ayse' };

    const result = await service.list(query);

    const where = buildContactWhere(query);
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: { lastActiveAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.contact.count).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({ data: [{ id: 'k-1' }], total: 25 });
  });

  it('ikinci sayfada skip değerini sayfa boyutuyla hesaplar', async () => {
    const prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ContactsAdminService(
      prisma as unknown as PrismaService,
    );

    await service.list({ page: 2, limit: 10 });

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});

describe('ContactListsService list ve members', () => {
  it('listeleri ada göre sıralar ve üye sayısını memberCount olarak döner', async () => {
    const prisma = {
      contactList: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'l-1',
            name: 'Aktif',
            description: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            _count: { members: 3 },
          },
        ]),
      },
    };
    const service = new ContactListsService(prisma as unknown as PrismaService);

    const lists = await service.list();

    expect(prisma.contactList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
    expect(lists[0]).toMatchObject({ id: 'l-1', memberCount: 3 });
    expect(lists[0]).not.toHaveProperty('_count');
  });

  it('üyeleri sayfalı döner ve her kişiye addedAt ekler', async () => {
    const addedAt = new Date('2026-10-20T10:00:00Z');
    const prisma = {
      contactList: { findUnique: jest.fn().mockResolvedValue({ id: 'l-1' }) },
      contactListMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            addedAt,
            contact: { id: 'k-1', fullName: 'Ayşe', phone: '905551112233' },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new ContactListsService(prisma as unknown as PrismaService);

    const result = await service.members('l-1', { page: 1, limit: 20 });

    expect(prisma.contactListMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listId: 'l-1' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toMatchObject({
      total: 1,
      data: [{ id: 'k-1', fullName: 'Ayşe', addedAt }],
    });
  });

  it('olmayan listenin üyelerini 404 ile döner', async () => {
    const prisma = {
      contactList: { findUnique: jest.fn().mockResolvedValue(null) },
      contactListMember: { findMany: jest.fn(), count: jest.fn() },
    };
    const service = new ContactListsService(prisma as unknown as PrismaService);

    await expect(
      service.members('yok', { page: 1, limit: 20 }),
    ).rejects.toThrow('Liste bulunamadı');
    expect(prisma.contactListMember.findMany).not.toHaveBeenCalled();
  });
});

describe('CampaignsService listeleme ve güncelleme', () => {
  const ROW = {
    id: 'c-1',
    templateId: TEMPLATE.id,
    template: TEMPLATE,
    paramMapping: [{ source: 'firstName' }],
    listIds: ['l-1'],
    audienceFilter: null,
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
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 's-1',
            campaignsEnabled: false,
            campaignUnitPrice: null,
            reminderQuietStart: 21,
            reminderQuietEnd: 9,
            ...args.data,
          }),
        ),
      },
      campaign: {
        findUnique: jest.fn().mockResolvedValue({
          ...ROW,
          status: CampaignStatus.READY,
        }),
        findMany: jest.fn().mockResolvedValue([ROW]),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({}),
      },
      whatsAppTemplate: { findUnique: jest.fn().mockResolvedValue(TEMPLATE) },
      contactList: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
  }

  it('ayar güncellemesi yalnız gönderilen alanları yazar', async () => {
    const prisma = buildPrisma();
    const service = new CampaignsService(prisma as unknown as PrismaService);

    await service.updateSettings({ campaignUnitPrice: 1.5 });

    expect(prisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: { campaignUnitPrice: 1.5 },
    });
  });

  it('listede durum filtresini hem sorguya hem toplam sayıma taşır', async () => {
    const prisma = buildPrisma();
    const service = new CampaignsService(prisma as unknown as PrismaService);

    const result = await service.list({ status: CampaignStatus.READY });

    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: CampaignStatus.READY } }),
    );
    expect(prisma.campaign.count).toHaveBeenCalledWith({
      where: { status: CampaignStatus.READY },
    });
    expect(result).toMatchObject({ total: 1, data: [ROW] });
  });

  it("hazır kampanyada hedef kitle değişince DRAFT'a döner", async () => {
    const prisma = buildPrisma();
    const service = new CampaignsService(prisma as unknown as PrismaService);

    await service.update('c-1', { listIds: ['l-2'] });

    expect(prisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c-1' },
        data: expect.objectContaining({ status: CampaignStatus.DRAFT }),
      }),
    );
  });

  it('hazır kampanyada yalnız ad değişince READY kalır', async () => {
    const prisma = buildPrisma();
    const service = new CampaignsService(prisma as unknown as PrismaService);

    await service.update('c-1', { name: 'Yeni ad' });

    const data = prisma.campaign.update.mock.calls[0][0].data;
    expect(data.name).toBe('Yeni ad');
    expect(data.status).toBe(CampaignStatus.READY);
  });
});
