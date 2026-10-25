import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto, UpdateTagDto } from './dto/contact-tag.dto';
import { TagsService } from './tags.service';

function uniqueError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function buildPrismaMock() {
  return {
    contactTag: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      findUnique: jest.fn<any, any>().mockResolvedValue({ id: 't-1' }),
      create: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 't-1', ...data }),
      ),
      update: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 't-1', ...data }),
      ),
      delete: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

async function errorsOf(value: object, cls: new () => object) {
  const instance = plainToInstance(cls, value);
  return validate(instance);
}

describe('TagsService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: TagsService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new TagsService(prisma as unknown as PrismaService);
  });

  describe('DTO doğrulama', () => {
    it('ad 40 karakteri aşarsa hata verir', async () => {
      const errors = await errorsOf({ name: 'a'.repeat(41) }, CreateTagDto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('boş ad (yalnızca boşluk) hata verir', async () => {
      const errors = await errorsOf({ name: '   ' }, CreateTagDto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('geçersiz renk hata verir', async () => {
      const errors = await errorsOf(
        { name: 'VIP', color: 'pink' },
        CreateTagDto,
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('geçerli ad ve renk kabul edilir', async () => {
      const errors = await errorsOf(
        { name: '  VIP  ', color: 'purple' },
        CreateTagDto,
      );
      expect(errors).toHaveLength(0);
    });

    it('güncellemede tüm alanlar isteğe bağlıdır', async () => {
      const errors = await errorsOf({}, UpdateTagDto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('adı kırpar ve varsayılan rengi gray yapar', async () => {
      await service.create({ name: '  Yeni  ' });
      expect(prisma.contactTag.create).toHaveBeenCalledWith({
        data: { name: 'Yeni', color: 'gray' },
      });
    });

    it('büyük-küçük harf duyarsız aynı ad varsa 409 döner', async () => {
      prisma.contactTag.findFirst.mockResolvedValueOnce({ id: 'x' });
      await expect(service.create({ name: 'vıp' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.contactTag.create).not.toHaveBeenCalled();
      const args = prisma.contactTag.findFirst.mock.calls[0][0];
      expect(args.where.name).toEqual({
        equals: 'vıp',
        mode: 'insensitive',
      });
    });

    it('yarış durumunda P2002 gelirse 409 döner', async () => {
      prisma.contactTag.create.mockRejectedValueOnce(uniqueError());
      await expect(service.create({ name: 'Yeni' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('update', () => {
    it('bulunamayan etiket için 404 döner', async () => {
      prisma.contactTag.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('t-9', { color: 'red' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('kendi adını koruyarak güncelleyebilir', async () => {
      await service.update('t-1', { name: 'Aynı' });
      const args = prisma.contactTag.findFirst.mock.calls[0][0];
      expect(args.where.id).toEqual({ not: 't-1' });
    });

    it('başka etiketle çakışan ad için 409 döner', async () => {
      prisma.contactTag.findFirst.mockResolvedValueOnce({ id: 't-2' });
      await expect(service.update('t-1', { name: 'Dolu' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.contactTag.update).not.toHaveBeenCalled();
    });

    it('yalnızca renk gönderilirse ad kontrolü yapılmaz', async () => {
      await service.update('t-1', { color: 'green' });
      expect(prisma.contactTag.findFirst).not.toHaveBeenCalled();
      expect(prisma.contactTag.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { color: 'green' },
      });
    });
  });

  describe('list', () => {
    it('ad sırasına göre ve contactCount ile döner', async () => {
      prisma.contactTag.findMany.mockResolvedValueOnce([
        { id: 't-1', name: 'A', color: 'gray', _count: { contacts: 3 } },
      ]);
      const result = await service.list();
      expect(prisma.contactTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
      expect(result).toEqual([
        { id: 't-1', name: 'A', color: 'gray', contactCount: 3 },
      ]);
    });
  });

  describe('remove', () => {
    it('bulunamayan etiket için 404 döner', async () => {
      prisma.contactTag.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove('t-9')).rejects.toThrow(NotFoundException);
      expect(prisma.contactTag.delete).not.toHaveBeenCalled();
    });

    it('etiketi siler ve ok döner', async () => {
      await expect(service.remove('t-1')).resolves.toEqual({ ok: true });
      expect(prisma.contactTag.delete).toHaveBeenCalledWith({
        where: { id: 't-1' },
      });
    });
  });
});
