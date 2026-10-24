import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KnowledgeCategory,
  KnowledgeSource,
  UnansweredStatus,
} from '@prisma/client';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { KnowledgeService } from '../assistant/knowledge.service';
import { OpenAiClient } from '../assistant/openai.client';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

const PII_MESSAGE =
  'Bilgi bankasına eklemeden önce kişisel bilgilerin çıkarıldığını onaylayın.';

function buildPrismaMock() {
  return {
    $transaction: jest.fn<any, any>((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    ),
    unansweredQuestion: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      count: jest.fn<any, any>().mockResolvedValue(0),
      findUnique: jest.fn<any, any>().mockResolvedValue({ id: 'q-1' }),
      update: jest
        .fn<any, any>()
        .mockResolvedValue({ id: 'q-1', status: UnansweredStatus.RESOLVED }),
    },
    knowledgeBase: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
      count: jest.fn<any, any>().mockResolvedValue(0),
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
      findUnique: jest.fn<any, any>().mockResolvedValue(null),
      create: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 'kb-1', ...data }),
      ),
      update: jest.fn<any, any>(({ data }: any) =>
        Promise.resolve({ id: 'kb-1', ...data }),
      ),
      delete: jest.fn<any, any>().mockResolvedValue({}),
    },
  };
}

describe('KnowledgeAdminService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let openai: { embed: jest.Mock };
  let inboxEvents: { emit: jest.Mock };
  let service: KnowledgeAdminService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    openai = { embed: jest.fn<any, any>().mockResolvedValue([[0.1, 0.2]]) };
    inboxEvents = { emit: jest.fn<any, any>() };
    const config = {
      get: jest.fn((_k: string, def?: string) => def),
    } as unknown as ConfigService;
    const knowledge = new KnowledgeService(
      prisma as unknown as PrismaService,
      openai as unknown as OpenAiClient,
      config,
      inboxEvents as unknown as InboxEventsService,
    );
    service = new KnowledgeAdminService(
      prisma as unknown as PrismaService,
      knowledge,
      inboxEvents as unknown as InboxEventsService,
    );
  });

  describe('POST knowledge (createKnowledge)', () => {
    it('piiConfirmed true değilse kaydetmez ve 400 döner', async () => {
      await expect(
        service.createKnowledge({
          category: KnowledgeCategory.FIYAT,
          title: 'Fiyat',
          content: 'Seans 1000 TL',
          piiConfirmed: false,
        }),
      ).rejects.toThrow(new BadRequestException(PII_MESSAGE));
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
    });

    it('piiConfirmed true ise MANUAL kaynaklı kayıt oluşturur ve embedding döndürmez', async () => {
      const result = await service.createKnowledge({
        category: KnowledgeCategory.FIYAT,
        title: 'Fiyat',
        content: 'Seans 1000 TL',
        piiConfirmed: true,
      });

      expect(prisma.knowledgeBase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: KnowledgeSource.MANUAL,
            sourceRefId: null,
          }),
        }),
      );
      expect(result).not.toHaveProperty('embedding');
      expect(result).toEqual(expect.objectContaining({ hasEmbedding: true }));
    });
  });

  describe('POST unanswered/:id/resolve', () => {
    it('addToKnowledge true ve piiConfirmed yoksa 400 döner, soruyu çözmez', async () => {
      await expect(
        service.resolveUnanswered('q-1', {
          addToKnowledge: true,
          category: KnowledgeCategory.HIZMET,
          title: 'Başlık',
          content: 'İçerik',
        }),
      ).rejects.toThrow(new BadRequestException(PII_MESSAGE));
      expect(prisma.unansweredQuestion.update).not.toHaveBeenCalled();
      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
    });

    it('addToKnowledge true iken CONVERSATION kaynaklı kayıt yazar, soruyu RESOLVED yapar ve counts.changed yayar', async () => {
      await service.resolveUnanswered('q-1', {
        addToKnowledge: true,
        category: KnowledgeCategory.HIZMET,
        title: 'Başlık',
        content: 'İçerik',
        piiConfirmed: true,
      });

      expect(prisma.knowledgeBase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: KnowledgeSource.CONVERSATION,
            sourceRefId: 'q-1',
          }),
        }),
      );
      expect(prisma.unansweredQuestion.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: UnansweredStatus.RESOLVED },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('addToKnowledge true iken başlık eksikse 400 döner', async () => {
      await expect(
        service.resolveUnanswered('q-1', {
          addToKnowledge: true,
          category: KnowledgeCategory.HIZMET,
          content: 'İçerik',
          piiConfirmed: true,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.unansweredQuestion.update).not.toHaveBeenCalled();
    });

    it('soru yoksa 404 döner', async () => {
      prisma.unansweredQuestion.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.resolveUnanswered('yok', { addToKnowledge: false }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST unanswered/:id/dismiss', () => {
    it('sadece RESOLVED yapar, bilgi bankasına yazmaz', async () => {
      await service.dismissUnanswered('q-1');

      expect(prisma.knowledgeBase.create).not.toHaveBeenCalled();
      expect(prisma.unansweredQuestion.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: UnansweredStatus.RESOLVED },
      });
    });
  });

  describe('GET knowledge (listKnowledge)', () => {
    it('embedding alanını dönmez, hasEmbedding bayrağını üretir', async () => {
      prisma.knowledgeBase.findMany.mockResolvedValueOnce([
        { id: 'a', title: 'A', embedding: [0.1, 0.2] },
        { id: 'b', title: 'B', embedding: [] },
      ]);
      prisma.knowledgeBase.count.mockResolvedValueOnce(2);

      const result = await service.listKnowledge({ page: 1, limit: 20 });

      expect(result.total).toBe(2);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'a', hasEmbedding: true }),
      );
      expect(result.data[1]).toEqual(
        expect.objectContaining({ id: 'b', hasEmbedding: false }),
      );
      for (const row of result.data) {
        expect(row).not.toHaveProperty('embedding');
      }
    });

    it('geçersiz kaynak filtresinde 400 döner', async () => {
      await expect(
        service.listKnowledge({ source: 'BILINMEYEN', page: 1, limit: 20 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PATCH / DELETE knowledge', () => {
    it('SSS kaynaklı kayıt güncellenirken 409 yukarı taşınır', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValueOnce({
        id: 'sss-kb',
        source: KnowledgeSource.SSS,
        title: 'S',
        content: 'C',
        embedding: [],
      });

      await expect(
        service.updateKnowledge('sss-kb', { title: 'Yeni' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.knowledgeBase.update).not.toHaveBeenCalled();
    });

    it('SSS kaynaklı kayıt silinirken 409 yukarı taşınır', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValueOnce({
        id: 'sss-kb',
        source: KnowledgeSource.SSS,
        embedding: [],
      });

      await expect(service.deleteKnowledge('sss-kb')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.knowledgeBase.delete).not.toHaveBeenCalled();
    });
  });
});
