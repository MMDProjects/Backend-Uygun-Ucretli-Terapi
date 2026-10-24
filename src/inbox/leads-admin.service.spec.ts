import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { LeadsAdminService } from './leads-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

function buildPrismaMock() {
  return {
    $transaction: jest.fn<any, any>((ops: Promise<unknown>[]) => Promise.all(ops)),
    lead: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      count: jest.fn<any, any>().mockResolvedValue(0),
      findUnique: jest.fn<any, any>().mockResolvedValue({ id: 'lead-1' }),
      update: jest.fn<any, any>().mockResolvedValue({ id: 'lead-1', status: LeadStatus.ARANDI }),
    },
  };
}

describe('LeadsAdminService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let inboxEvents: { emit: jest.Mock };
  let service: LeadsAdminService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    inboxEvents = { emit: jest.fn<any, any>() };
    service = new LeadsAdminService(
      prisma as unknown as PrismaService,
      inboxEvents as unknown as InboxEventsService,
    );
  });

  describe('list', () => {
    it('createdAt desc sıralar ve {data,total,page,limit} döner', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([{ id: 'lead-1' }]);
      prisma.lead.count.mockResolvedValueOnce(1);

      const result = await service.list({ page: 2, limit: 10 });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual({ data: [{ id: 'lead-1' }], total: 1, page: 2, limit: 10 });
    });

    it('geçerli durum filtresini where koşuluna ekler', async () => {
      await service.list({ status: 'YENI', page: 1, limit: 20 });

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'YENI' } }),
      );
    });

    it('geçersiz durum filtresinde 400 döner', async () => {
      await expect(
        service.list({ status: 'GECERSIZ', page: 1, limit: 20 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('sayfa ve limit geçersizse varsayılana çeker', async () => {
      const result = await service.list({ page: Number.NaN, limit: Number.NaN });
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('updateStatus', () => {
    it('durumu günceller ve counts.changed yayar', async () => {
      const result = await service.updateStatus('lead-1', { status: LeadStatus.ARANDI });

      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { status: LeadStatus.ARANDI },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
      expect(result).toEqual({ id: 'lead-1', status: LeadStatus.ARANDI });
    });

    it('lead yoksa 404 döner ve güncelleme yapmaz', async () => {
      prisma.lead.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateStatus('yok', { status: LeadStatus.VAZGECTI }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });
  });
});
