import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TemplateCategory, TemplateStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaTemplatesClient } from './meta-templates.client';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

type Row = {
  id: string;
  name: string;
  language: string;
  status: TemplateStatus;
};

function buildPrisma(rows: Row[] = []) {
  const whatsAppTemplate = {
    findMany: jest.fn().mockResolvedValue(rows),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new', ...data }),
      ),
    update: jest
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ id: 'x', ...data })),
  };
  const prisma = {
    whatsAppTemplate,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

function buildMeta() {
  return {
    assertConfigured: jest.fn(),
    listAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'meta-1', status: 'PENDING' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

function build(rows: Row[] = []) {
  const prisma = buildPrisma(rows);
  const meta = buildMeta();
  const service = new TemplatesService(
    prisma as unknown as PrismaService,
    meta as unknown as MetaTemplatesClient,
  );
  return { service, prisma, meta };
}

function dto(overrides: Partial<CreateTemplateDto> = {}): CreateTemplateDto {
  return {
    name: 'randevu_hatirlatma',
    category: TemplateCategory.UTILITY,
    bodyText: 'Merhaba {{1}}, randevunuz {{2}}',
    examples: ['Ayşe', 'yarın'],
    ...overrides,
  };
}

describe('TemplatesService.sync', () => {
  it('Meta şablonlarını upsert eder ve Meta’da olmayanları DISABLED yapar', async () => {
    const { service, prisma, meta } = build([
      {
        id: 'local-1',
        name: 'eski',
        language: 'tr',
        status: TemplateStatus.APPROVED,
      },
      {
        id: 'local-2',
        name: 'a',
        language: 'tr',
        status: TemplateStatus.APPROVED,
      },
    ]);
    meta.listAll.mockResolvedValue([
      {
        id: 'm-a',
        name: 'a',
        language: 'tr',
        status: 'APPROVED',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Merhaba {{1}}' }],
        rejected_reason: 'NONE',
      },
      {
        id: 'm-b',
        name: 'b',
        language: 'tr',
        status: 'REJECTED',
        category: 'MARKETING',
        components: [{ type: 'BODY', text: 'Düz' }],
        rejected_reason: 'INVALID_FORMAT',
      },
    ]);

    const result = await service.sync();

    expect(result).toEqual({ synced: 2, disabled: 1 });
    expect(prisma.whatsAppTemplate.upsert).toHaveBeenCalledTimes(2);
    const first = prisma.whatsAppTemplate.upsert.mock.calls[0][0];
    expect(first.where).toEqual({
      name_language: { name: 'a', language: 'tr' },
    });
    expect(first.create).toMatchObject({
      metaId: 'm-a',
      status: TemplateStatus.APPROVED,
      category: TemplateCategory.UTILITY,
      bodyText: 'Merhaba {{1}}',
      variableCount: 1,
      rejectedReason: null,
    });
    const second = prisma.whatsAppTemplate.upsert.mock.calls[1][0];
    expect(second.update).toMatchObject({
      status: TemplateStatus.REJECTED,
      rejectedReason: 'INVALID_FORMAT',
    });
    expect(prisma.whatsAppTemplate.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['local-1'] } },
      data: expect.objectContaining({ status: TemplateStatus.DISABLED }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('WABA tanımlı değilse Meta çağrısı yapmadan hata verir', async () => {
    const { service, meta } = build();
    meta.assertConfigured.mockImplementation(() => {
      throw new Error('WABA kimliği tanımlı değil');
    });

    await expect(service.sync()).rejects.toThrow('WABA kimliği tanımlı değil');
    expect(meta.listAll).not.toHaveBeenCalled();
  });
});

describe('TemplatesService.create', () => {
  it('geçerli girdiyi Meta’ya gönderir ve PENDING kayıt oluşturur', async () => {
    const { service, prisma, meta } = build();

    const created = await service.create(dto());

    expect(meta.create).toHaveBeenCalledWith({
      name: 'randevu_hatirlatma',
      language: 'tr',
      category: TemplateCategory.UTILITY,
      bodyText: 'Merhaba {{1}}, randevunuz {{2}}',
      examples: ['Ayşe', 'yarın'],
    });
    expect(created).toMatchObject({
      metaId: 'meta-1',
      status: TemplateStatus.PENDING,
      variableCount: 2,
      language: 'tr',
    });
    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledTimes(1);
  });

  it('sırası bozuk değişkenli metni reddeder ve Meta’ya gitmez', async () => {
    const { service, meta } = build();

    await expect(
      service.create(dto({ bodyText: 'Merhaba {{2}}', examples: ['x'] })),
    ).rejects.toThrow(BadRequestException);
    expect(meta.create).not.toHaveBeenCalled();
  });

  it('1024 karakteri aşan metni reddeder', async () => {
    const { service, meta } = build();

    await expect(
      service.create(dto({ bodyText: 'a'.repeat(1025), examples: [] })),
    ).rejects.toThrow(BadRequestException);
    expect(meta.create).not.toHaveBeenCalled();
  });

  it('örnek sayısı değişken sayısıyla eşleşmezse reddeder', async () => {
    const { service, meta } = build();

    await expect(service.create(dto({ examples: ['tek'] }))).rejects.toThrow(
      'Örnek sayısı değişken sayısıyla (2) eşleşmeli',
    );
    expect(meta.create).not.toHaveBeenCalled();
  });

  it('aynı ad ve dilde şablon varsa çakışma döner', async () => {
    const { service, prisma, meta } = build();
    prisma.whatsAppTemplate.findUnique.mockResolvedValueOnce({ id: 'var' });

    await expect(service.create(dto())).rejects.toThrow(ConflictException);
    expect(meta.create).not.toHaveBeenCalled();
  });
});

describe('TemplatesService.delete', () => {
  it('Meta’dan siler ve kaydı DISABLED yapar', async () => {
    const { service, prisma, meta } = build();
    prisma.whatsAppTemplate.findUnique.mockResolvedValueOnce({
      id: 't1',
      name: 'a',
      language: 'tr',
    });

    const result = await service.delete('t1');

    expect(meta.delete).toHaveBeenCalledWith('a');
    expect(result.status).toBe(TemplateStatus.DISABLED);
  });

  it('kayıt yoksa 404 döner', async () => {
    const { service, meta } = build();

    await expect(service.delete('yok')).rejects.toThrow(NotFoundException);
    expect(meta.delete).not.toHaveBeenCalled();
  });
});

describe('TemplatesService.getApproved', () => {
  it('onaylı şablonu döndürür', async () => {
    const { service, prisma } = build();
    prisma.whatsAppTemplate.findUnique.mockResolvedValueOnce({
      id: 't1',
      status: TemplateStatus.APPROVED,
    });

    await expect(service.getApproved('t1')).resolves.toMatchObject({
      id: 't1',
    });
  });

  it('onaylı olmayan ya da olmayan şablonda BadRequest fırlatır', async () => {
    const { service, prisma } = build();
    prisma.whatsAppTemplate.findUnique.mockResolvedValueOnce({
      id: 't1',
      status: TemplateStatus.PENDING,
    });

    await expect(service.getApproved('t1')).rejects.toThrow(
      BadRequestException,
    );
    prisma.whatsAppTemplate.findUnique.mockResolvedValueOnce(null);
    await expect(service.getApproved('t2')).rejects.toThrow(
      BadRequestException,
    );
  });
});
