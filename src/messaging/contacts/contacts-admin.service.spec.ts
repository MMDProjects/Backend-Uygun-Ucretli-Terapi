import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsAdminService } from './contacts-admin.service';

describe('ContactsAdminService.updateOptOut', () => {
  let prisma: {
    contact: { findUnique: jest.Mock; update: jest.Mock };
  };
  let service: ContactsAdminService;

  beforeEach(() => {
    prisma = {
      contact: {
        findUnique: jest.fn(),
        update: jest.fn((args: { data: unknown }) =>
          Promise.resolve({ id: 'k-1', ...(args.data as object) }),
        ),
      },
    };
    service = new ContactsAdminService(prisma as unknown as PrismaService);
  });

  it('hiçbir alan gönderilmezse 400 döner', async () => {
    await expect(service.updateOptOut('k-1', {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it('kişi yoksa 404 döner', async () => {
    prisma.contact.findUnique.mockResolvedValue(null);
    await expect(
      service.updateOptOut('yok', { reminderOptOut: false }),
    ).rejects.toThrow(NotFoundException);
  });

  it('personel DUR işaretini elle kaldırır ve optOutAt temizlenir', async () => {
    prisma.contact.findUnique.mockResolvedValue({
      id: 'k-1',
      marketingOptOut: true,
      reminderOptOut: true,
    });

    await service.updateOptOut('k-1', {
      marketingOptOut: false,
      reminderOptOut: false,
    });

    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'k-1' },
        data: {
          marketingOptOut: false,
          reminderOptOut: false,
          optOutAt: null,
        },
      }),
    );
  });

  it('yalnız verilen bayrak değişir, diğeri korunur', async () => {
    prisma.contact.findUnique.mockResolvedValue({
      id: 'k-1',
      marketingOptOut: true,
      reminderOptOut: false,
    });

    await service.updateOptOut('k-1', { reminderOptOut: true });

    const data = prisma.contact.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.marketingOptOut).toBe(true);
    expect(data.reminderOptOut).toBe(true);
    expect(data.optOutAt).toBeInstanceOf(Date);
  });
});
