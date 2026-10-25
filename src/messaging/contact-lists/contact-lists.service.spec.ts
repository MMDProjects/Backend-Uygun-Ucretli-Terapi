import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactListsService } from './contact-lists.service';

function buildPrisma() {
  return {
    contactList: {
      findUnique: jest.fn().mockResolvedValue({ id: 'l-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'l-1', ...data }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'l-1', ...data }),
      ),
    },
    contactListMember: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    contact: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('ContactListsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: ContactListsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new ContactListsService(prisma as unknown as PrismaService);
  });

  it('liste adı büyük-küçük harf duyarsız tekrarda 409 döner', async () => {
    prisma.contactList.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.create({ name: 'Mart Grubu' }, 'u-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.contactList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { equals: 'Mart Grubu', mode: 'insensitive' } },
      }),
    );
    expect(prisma.contactList.create).not.toHaveBeenCalled();
  });

  it('güncellemede kendi adı tekrar sayılmaz', async () => {
    await service.update('l-1', { name: 'Yeni' });

    expect(prisma.contactList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          name: { equals: 'Yeni', mode: 'insensitive' },
          id: { not: 'l-1' },
        },
      }),
    );
  });

  it('filtre 5000 kişiden fazla eşleşirse 400 döner ve kimseyi eklemez', async () => {
    prisma.contact.findMany.mockResolvedValue(
      Array.from({ length: 5001 }, (_, i) => ({ id: `k-${i}` })),
    );

    await expect(service.addByFilter('l-1', { filter: {} })).rejects.toThrow(
      'Filtre 5000 kişiden fazla',
    );
    expect(prisma.contactListMember.createMany).not.toHaveBeenCalled();
  });

  it('filtreyle eklemede eşleşen kişileri tekilleştirerek ekler', async () => {
    prisma.contact.findMany.mockResolvedValue([{ id: 'k-1' }, { id: 'k-2' }]);
    prisma.contactListMember.createMany.mockResolvedValue({ count: 2 });

    const result = await service.addByFilter('l-1', { filter: {} });

    expect(result).toEqual({ matched: 2, added: 2 });
    expect(prisma.contactListMember.createMany).toHaveBeenCalledWith({
      data: [
        { listId: 'l-1', contactId: 'k-1' },
        { listId: 'l-1', contactId: 'k-2' },
      ],
      skipDuplicates: true,
    });
  });

  it('kişi eklerken aynı id tekrarlanırsa tek kayıt yazar', async () => {
    prisma.contact.findMany.mockResolvedValue([{ id: 'k-1' }]);
    prisma.contactListMember.createMany.mockResolvedValue({ count: 1 });

    await service.addContacts('l-1', { contactIds: ['k-1', 'k-1'] });

    expect(prisma.contactListMember.createMany).toHaveBeenCalledWith({
      data: [{ listId: 'l-1', contactId: 'k-1' }],
      skipDuplicates: true,
    });
  });

  it('var olmayan kişi id gelirse 400 döner ve kimseyi eklemez', async () => {
    prisma.contact.findMany.mockResolvedValue([{ id: 'k-1' }]);

    await expect(
      service.addContacts('l-1', { contactIds: ['k-1', 'k-2', 'k-3'] }),
    ).rejects.toThrow('2 kişi bulunamadı');
    expect(prisma.contactListMember.createMany).not.toHaveBeenCalled();
  });

  it('olmayan liste için 404 benzeri hata döner', async () => {
    prisma.contactList.findUnique.mockResolvedValue(null);
    await expect(service.remove('yok')).rejects.toThrow('Liste bulunamadı.');
    expect(BadRequestException).toBeDefined();
  });
});
