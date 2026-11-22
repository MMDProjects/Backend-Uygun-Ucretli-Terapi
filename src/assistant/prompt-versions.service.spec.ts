import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PromptVersionsService } from './prompt-versions.service';
import { ELIF_SYSTEM_PROMPT } from './prompts/elif-system-prompt';

const PLACEHOLDER = '{{FIYAT_TABLOSU}}';
const VALID_CONTENT = `${PLACEHOLDER}\n${'a'.repeat(600)}`;

function buildPrismaMock() {
  const prisma: any = {
    assistantPrompt: {
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      findUnique: jest.fn<any, any>().mockResolvedValue(null),
      aggregate: jest
        .fn<any, any>()
        .mockResolvedValue({ _max: { version: null } }),
      create: jest.fn<any, any>().mockResolvedValue({ id: 'new', version: 1 }),
      updateMany: jest.fn<any, any>().mockResolvedValue({ count: 1 }),
      update: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
  prisma.$transaction = jest.fn<any, any>((arg: unknown) =>
    typeof arg === 'function'
      ? arg(prisma)
      : Promise.all(arg as Promise<any>[]),
  );
  return prisma;
}

describe('PromptVersionsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: PromptVersionsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new PromptVersionsService(prisma);
  });

  describe('validateContent', () => {
    it('500 karakterden kısa içeriği 400 ile reddeder', () => {
      expect(() => service.validateContent(`${PLACEHOLDER} kısa`)).toThrow(
        BadRequestException,
      );
    });

    it('fiyat tablosu yer tutucusu yoksa 400 ile reddeder', () => {
      expect(() => service.validateContent('a'.repeat(600))).toThrow(
        BadRequestException,
      );
    });

    it('60000 karakterden uzun içeriği 400 ile reddeder', () => {
      expect(() =>
        service.validateContent(`${PLACEHOLDER}${'a'.repeat(60000)}`),
      ).toThrow(BadRequestException);
    });

    it('geçerli içeriği kabul eder', () => {
      expect(() => service.validateContent(VALID_CONTENT)).not.toThrow();
    });
  });

  describe('getActiveContent', () => {
    it('aktif DB sürümü yoksa kod içi varsayılanı döner', async () => {
      const content = await service.getActiveContent();

      expect(content).toBe(ELIF_SYSTEM_PROMPT);
      expect(await service.getActive()).toEqual({
        source: 'code',
        content: ELIF_SYSTEM_PROMPT,
        whatsappAddendum: null,
        instagramAddendum: null,
      });
    });

    it('aktif DB sürümü varsa onun içeriğini döner ve 30 sn önbellekte tutar', async () => {
      prisma.assistantPrompt.findFirst.mockResolvedValue({
        id: 'p1',
        version: 3,
        content: VALID_CONTENT,
        whatsappAddendum: 'WA eki',
        instagramAddendum: 'IG eki',
      });

      expect(await service.getActiveContent()).toBe(VALID_CONTENT);
      expect(await service.getActiveContent()).toBe(VALID_CONTENT);
      expect(prisma.assistantPrompt.findFirst).toHaveBeenCalledTimes(1);
    });

    it('aktif DB sürümünün ekleri getActive ve getActivePrompt çıktısında taşınır ve önbellekten gelir', async () => {
      prisma.assistantPrompt.findFirst.mockResolvedValue({
        id: 'p1',
        version: 3,
        content: VALID_CONTENT,
        whatsappAddendum: 'WA eki',
        instagramAddendum: null,
      });

      expect(await service.getActive()).toEqual({
        source: 'db',
        id: 'p1',
        version: 3,
        content: VALID_CONTENT,
        whatsappAddendum: 'WA eki',
        instagramAddendum: null,
      });
      expect(await service.getActivePrompt()).toEqual({
        content: VALID_CONTENT,
        whatsappAddendum: 'WA eki',
        instagramAddendum: null,
      });
      expect(prisma.assistantPrompt.findFirst).toHaveBeenCalledTimes(1);
    });

    it('DB okunamazsa kod içi varsayılana düşer', async () => {
      prisma.assistantPrompt.findFirst.mockRejectedValue(new Error('db'));

      expect(await service.getActiveContent()).toBe(ELIF_SYSTEM_PROMPT);
    });

    it('etkinleştirme önbelleği temizler', async () => {
      prisma.assistantPrompt.findFirst.mockResolvedValue({
        id: 'p1',
        version: 1,
        content: VALID_CONTENT,
      });
      await service.getActiveContent();
      prisma.assistantPrompt.findUnique.mockResolvedValue({
        id: 'p2',
        version: 2,
      });
      await service.activate('p2', 'u1');

      await service.getActiveContent();
      expect(prisma.assistantPrompt.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('yeni sürüm numarasını en yüksek + 1 olarak verir ve etkinleştirmez', async () => {
      prisma.assistantPrompt.aggregate.mockResolvedValue({
        _max: { version: 4 },
      });

      await service.create({ content: VALID_CONTENT, note: ' Not ' }, 'u1');

      expect(prisma.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: 5,
            note: 'Not',
            isActive: false,
            createdById: 'u1',
          }),
        }),
      );
      expect(prisma.assistantPrompt.updateMany).not.toHaveBeenCalled();
    });

    it('activate true ise önceki aktif sürümü kapatır', async () => {
      await service.create({ content: VALID_CONTENT, activate: true }, 'u1');

      expect(prisma.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prisma.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('geçersiz içerikte kayıt yapmaz', async () => {
      await expect(
        service.create({ content: 'kısa' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.assistantPrompt.create).not.toHaveBeenCalled();
    });

    it('sürüm numarası çakışırsa 409 döner', async () => {
      prisma.assistantPrompt.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '6.19.0',
        }),
      );

      await expect(
        service.create({ content: VALID_CONTENT }, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('activate ve deactivate', () => {
    it('var olmayan sürümü 404 ile reddeder', async () => {
      await expect(service.activate('yok', 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('etkinleştirmede tek aktif kalacak şekilde önce tümünü kapatır, sonra hedefi açar', async () => {
      prisma.assistantPrompt.findUnique.mockResolvedValue({
        id: 'p2',
        version: 2,
      });

      await service.activate('p2', 'u1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
      expect(prisma.assistantPrompt.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: { isActive: true },
      });
    });

    it('deactivate tüm aktif sürümleri kapatır ve kod içi varsayılanı döner', async () => {
      const result = await service.deactivate('u1');

      expect(result).toEqual({ source: 'code' });
      expect(prisma.assistantPrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
    });
  });

  describe('kanal ekleri', () => {
    const ADDENDUM = 'Kanal kuralı metni';

    it('aktif DB sürümünün iki ekini döner ve getActivePrompt üçlüyü verir', async () => {
      prisma.assistantPrompt.findFirst.mockResolvedValue({
        id: 'p1',
        version: 2,
        content: VALID_CONTENT,
        whatsappAddendum: ADDENDUM,
        instagramAddendum: null,
      });

      expect(await service.getActivePrompt()).toEqual({
        content: VALID_CONTENT,
        whatsappAddendum: ADDENDUM,
        instagramAddendum: null,
      });
      expect(prisma.assistantPrompt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            whatsappAddendum: true,
            instagramAddendum: true,
          }),
        }),
      );
    });

    it('create ekleri kaydeder; boş ek null olarak saklanır', async () => {
      await service.create(
        {
          content: VALID_CONTENT,
          whatsappAddendum: ADDENDUM,
          instagramAddendum: '   ',
        },
        'u1',
      );

      expect(prisma.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            whatsappAddendum: ADDENDUM,
            instagramAddendum: null,
          }),
        }),
      );
    });

    it('create ek vermezse iki ek de null kaydedilir', async () => {
      await service.create({ content: VALID_CONTENT }, 'u1');

      expect(prisma.assistantPrompt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            whatsappAddendum: null,
            instagramAddendum: null,
          }),
        }),
      );
    });

    it('5000 karakterden uzun ek 400 ile reddedilir ve kayıt yapılmaz', async () => {
      await expect(
        service.create(
          {
            content: VALID_CONTENT,
            instagramAddendum: 'a'.repeat(5001),
          },
          'u1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.assistantPrompt.create).not.toHaveBeenCalled();
    });

    it('5000 karakterlik ek kabul edilir', () => {
      expect(() =>
        service.validateAddenda({ whatsappAddendum: 'a'.repeat(5000) }),
      ).not.toThrow();
    });

    it('findOne ekleri içerikle birlikte döner', async () => {
      prisma.assistantPrompt.findUnique.mockResolvedValue({
        id: 'p1',
        version: 1,
        content: VALID_CONTENT,
        whatsappAddendum: ADDENDUM,
        instagramAddendum: null,
      });

      expect(await service.findOne('p1')).toEqual(
        expect.objectContaining({
          whatsappAddendum: ADDENDUM,
          instagramAddendum: null,
        }),
      );
    });

    it('list ek metinlerini taşımadan dolu olup olmadığını döner', async () => {
      prisma.assistantPrompt.findMany.mockResolvedValue([
        {
          id: 'p2',
          version: 2,
          isActive: true,
          whatsappAddendum: ADDENDUM,
          instagramAddendum: null,
        },
      ]);

      const result = await service.list();

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          hasWhatsappAddendum: true,
          hasInstagramAddendum: false,
        }),
      );
      expect(result.items[0]).not.toHaveProperty('whatsappAddendum');
      expect(result.items[0]).not.toHaveProperty('instagramAddendum');
    });
  });

  describe('list', () => {
    it('içerik olmadan sürümleri ve aktif sürüm bilgisini döner', async () => {
      prisma.assistantPrompt.findMany.mockResolvedValue([
        { id: 'p2', version: 2, isActive: true },
        { id: 'p1', version: 1, isActive: false },
      ]);

      const result = await service.list();

      expect(result.active).toEqual({ source: 'db', id: 'p2', version: 2 });
      expect(result.items).toHaveLength(2);
      expect(prisma.assistantPrompt.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({
          select: expect.objectContaining({ content: true }),
        }),
      );
    });
  });

  // Denetim: her oluşturma, etkinleştirme ve kod içi varsayılana dönüş loglanır
  describe('denetim logu', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it('yeni sürüm oluşturulunca kullanıcı kimliğiyle loglar', async () => {
      await service.create({ content: VALID_CONTENT }, 'u1');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('oluşturuldu (kullanıcı: u1)'),
      );
    });

    it('oluşturma ile birlikte etkinleştirilirse bunu loglar', async () => {
      await service.create({ content: VALID_CONTENT, activate: true }, 'u2');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'oluşturuldu ve etkinleştirildi (kullanıcı: u2)',
        ),
      );
    });

    it('etkinleştirme sürüm numarası ve kullanıcıyla loglanır', async () => {
      prisma.assistantPrompt.findUnique.mockResolvedValue({
        id: 'p2',
        version: 2,
      });

      await service.activate('p2', 'u3');

      expect(logSpy).toHaveBeenCalledWith(
        'Elif prompt sürümü 2 etkinleştirildi (kullanıcı: u3)',
      );
    });

    it('kod içi varsayılana dönüş kullanıcıyla loglanır', async () => {
      await service.deactivate('u4');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'kod içi varsayılana döndürüldü (kullanıcı: u4)',
        ),
      );
    });
  });
});
