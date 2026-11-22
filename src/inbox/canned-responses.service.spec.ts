import { ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CannedResponsesService } from './canned-responses.service';
import {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from './dto/canned-response.dto';

function uniqueError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function buildPrismaMock() {
  return {
    cannedResponse: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      findUnique: jest.fn<any, any>().mockResolvedValue({ id: 'c-1' }),
      create: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 'c-1', ...data }),
      ),
      update: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 'c-1', ...data }),
      ),
      delete: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

async function errorsOf(value: object, cls: new () => object) {
  return validate(plainToInstance(cls, value));
}

describe('CannedResponsesService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: CannedResponsesService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    service = new CannedResponsesService(prisma as unknown as PrismaService);
  });

  describe('DTO doğrulama', () => {
    it('başlık 80 karakteri aşarsa hata verir', async () => {
      const errors = await errorsOf(
        { title: 'a'.repeat(81), content: 'x' },
        CreateCannedResponseDto,
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it('içerik 2000 karakteri aşarsa hata verir', async () => {
      const errors = await errorsOf(
        { title: 'Selam', content: 'a'.repeat(2001) },
        CreateCannedResponseDto,
      );
      expect(errors.length).toBeGreaterThan(0);
    });

    it.each(['Büyük', 'a_b', 'a b', 'a'.repeat(31), ''])(
      'geçersiz kısayol %p reddedilir',
      async (shortcut) => {
        const errors = await errorsOf(
          { title: 'T', content: 'C', shortcut },
          CreateCannedResponseDto,
        );
        expect(errors.length).toBeGreaterThan(0);
      },
    );

    it('küçük harf, rakam ve tire içeren kısayol kabul edilir', async () => {
      const errors = await errorsOf(
        { title: 'T', content: 'C', shortcut: 'fiyat-2' },
        CreateCannedResponseDto,
      );
      expect(errors).toHaveLength(0);
    });

    it('güncellemede shortcut null kabul edilir (kaldırma)', async () => {
      const errors = await errorsOf(
        { shortcut: null },
        UpdateCannedResponseDto,
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('list (arama)', () => {
    it('q verilmezse filtre uygulamaz ve updatedAt desc sıralar', async () => {
      await service.list();
      const args = prisma.cannedResponse.findMany.mock.calls[0][0];
      expect(args.where).toEqual({});
      expect(args.orderBy).toEqual({ updatedAt: 'desc' });
    });

    it('q title, content ve shortcut içinde duyarsız arar', async () => {
      await service.list('  fiyat ');
      const args = prisma.cannedResponse.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        OR: [
          { title: { contains: 'fiyat', mode: 'insensitive' } },
          { content: { contains: 'fiyat', mode: 'insensitive' } },
          { shortcut: { contains: 'fiyat', mode: 'insensitive' } },
        ],
      });
    });
  });

  describe('create', () => {
    it('createdById isteği yapan kullanıcı olur', async () => {
      await service.create({ title: 'Selam', content: 'Merhaba' }, 'u-1');
      expect(prisma.cannedResponse.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            title: 'Selam',
            content: 'Merhaba',
            shortcut: null,
            createdById: 'u-1',
          },
        }),
      );
    });

    it('kısayol çakışırsa 409 döner ve kayıt yapmaz', async () => {
      prisma.cannedResponse.findFirst.mockResolvedValueOnce({ id: 'c-2' });
      await expect(
        service.create(
          {
            title: 'T',
            content: 'C',
            shortcut: 'fiyat',
          },
          'u-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.cannedResponse.create).not.toHaveBeenCalled();
    });

    it('yarış durumunda P2002 gelirse 409 döner', async () => {
      prisma.cannedResponse.create.mockRejectedValueOnce(uniqueError());
      await expect(
        service.create({ title: 'T', content: 'C' }, 'u-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('bulunamayan kayıt için 404 döner', async () => {
      prisma.cannedResponse.findUnique.mockResolvedValueOnce(null);
      await expect(service.update('c-9', { title: 'Yeni' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('kendi kısayolunu çakışma saymaz', async () => {
      await service.update('c-1', { shortcut: 'fiyat' });
      const args = prisma.cannedResponse.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({
        shortcut: 'fiyat',
        id: { not: 'c-1' },
      });
    });

    it('başka kayıtla çakışan kısayol için 409 döner', async () => {
      prisma.cannedResponse.findFirst.mockResolvedValueOnce({ id: 'c-2' });
      await expect(service.update('c-1', { shortcut: 'dolu' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.cannedResponse.update).not.toHaveBeenCalled();
    });

    it('shortcut null gönderilirse kısayolu temizler', async () => {
      await service.update('c-1', { shortcut: null });
      expect(prisma.cannedResponse.findFirst).not.toHaveBeenCalled();
      expect(prisma.cannedResponse.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { shortcut: null } }),
      );
    });

    it('shortcut hiç gönderilmezse dokunmaz', async () => {
      await service.update('c-1', { title: 'Yeni başlık' });
      expect(prisma.cannedResponse.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { title: 'Yeni başlık' } }),
      );
    });
  });

  describe('remove', () => {
    it('bulunamayan kayıt için 404 döner', async () => {
      prisma.cannedResponse.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove('c-9')).rejects.toThrow(NotFoundException);
    });

    it('kaydı siler ve ok döner', async () => {
      await expect(service.remove('c-1')).resolves.toEqual({ ok: true });
      expect(prisma.cannedResponse.delete).toHaveBeenCalledWith({
        where: { id: 'c-1' },
      });
    });
  });
});
