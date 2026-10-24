import { Prisma } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { MetaWebhookBody } from './dto/meta-webhook-payload.dto';

function buildPrismaMock() {
  return {
    contact: {
      findFirst: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    conversation: {
      findFirst: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    message: {
      create: jest.fn<any, any>(),
    },
  };
}

describe('WebhooksService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: WebhooksService;
  let inboxEvents: { emit: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    inboxEvents = { emit: jest.fn<any, any>() };
    service = new WebhooksService(
      prisma as unknown as PrismaService,
      inboxEvents as unknown as InboxEventsService,
    );
  });

  describe('extractMessages', () => {
    it('WhatsApp changes payload’ından mesajları doğru çıkarır', () => {
      const body: MetaWebhookBody = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: '123',
                    display_phone_number: '+905551112233',
                  },
                  contacts: [
                    { profile: { name: 'Ayşe' }, wa_id: '905550001122' },
                  ],
                  messages: [
                    {
                      id: 'wamid.ABC',
                      from: '905550001122',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'Merhaba' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = service.extractMessages(body);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        channel: 'WHATSAPP',
        externalContactId: '905550001122',
        contactName: 'Ayşe',
        metaMessageId: 'wamid.ABC',
        content: 'Merhaba',
      });
    });

    it('metin olmayan WhatsApp mesaj tiplerini placeholder ile işler', () => {
      const body: MetaWebhookBody = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-1',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: '123',
                    display_phone_number: '+905551112233',
                  },
                  messages: [
                    {
                      id: 'wamid.IMG',
                      from: '905550001122',
                      timestamp: '1700000000',
                      type: 'image',
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = service.extractMessages(body);

      expect(result[0].content).toBe('[desteklenmeyen mesaj tipi: image]');
    });

    it('Instagram messaging payload’ından mesajları doğru çıkarır', () => {
      const body: MetaWebhookBody = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-1',
            messaging: [
              {
                sender: { id: 'ig-user-1' },
                recipient: { id: 'ig-page-1' },
                timestamp: 1700000000000,
                message: { mid: 'mid.123', text: 'Merhaba Instagram' },
              },
            ],
          },
        ],
      };

      const result = service.extractMessages(body);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        channel: 'INSTAGRAM',
        externalContactId: 'ig-user-1',
        metaMessageId: 'mid.123',
        content: 'Merhaba Instagram',
      });
    });

    it('is_echo: true olan Instagram mesajını atlar', () => {
      const body: MetaWebhookBody = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-1',
            messaging: [
              {
                sender: { id: 'ig-user-1' },
                recipient: { id: 'ig-page-1' },
                timestamp: 1700000000000,
                message: {
                  mid: 'mid.echo',
                  text: 'Botun kendi mesajı',
                  is_echo: true,
                },
              },
            ],
          },
        ],
      };

      const result = service.extractMessages(body);

      expect(result).toHaveLength(0);
    });
  });

  describe('detectCrisis', () => {
    it.each([
      'kendimi öldürmek istiyorum',
      'İNTİHAR etmeyi düşünüyorum',
      'artık yaşamak istemiyorum',
      'kendime zarar vermek istiyorum',
      // "ö"/"ç" ile başlayan kalıplar (eski \b hatası)
      'ölmek istiyorum',
      'Bazen özkıyım aklıma geliyor',
      'ÖLMEK İSTİYORUM',
      'ölsem daha iyi olacak',
      // Türkçe karakter kullanılmadan yazım
      'artik yasamak istemiyorum',
      'kendimi oldurecegim',
      'hayatima son vermek istiyorum',
      'ozkiyimi dusunuyorum',
      'olmek istiyorum',
      'bicakla kendimi kestim',
    ])('pozitif örnek tespit edilir: "%s"', (text) => {
      expect(service.detectCrisis(text)).toBe(true);
    });

    it.each([
      'bugün çok yorgunluktan öldüm',
      'bugun cok yorgunluktan oldum',
      'bu iş sonunda bitti, rahatladım',
      'merhaba, randevu almak istiyorum',
      'fiyatlar nedir acaba',
      'öğrenciyim, indirim var mı?',
      'çocuğum için destek almak istiyorum',
      'gülmekten öldüm',
    ])('negatif örnek (yanlış-pozitif değil): "%s"', (text) => {
      expect(service.detectCrisis(text)).toBe(false);
    });
  });

  describe('processIncomingMessage', () => {
    const baseMsg = {
      channel: 'WHATSAPP' as const,
      externalContactId: '905550001122',
      contactName: 'Ayşe',
      metaMessageId: 'wamid.ABC',
      content: 'Merhaba',
      timestamp: new Date(),
    };

    it('yeni contact + yeni conversation + mesaj oluşturur', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.processIncomingMessage(baseMsg);

      expect(prisma.contact.create).toHaveBeenCalled();
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { contactId: 'contact-1', channel: 'WHATSAPP' },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          senderType: 'CLIENT',
          content: 'Merhaba',
          metaMessageId: 'wamid.ABC',
        },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('message.created', {
        conversationId: 'conv-1',
        message: { id: 'msg-1' },
      });
    });

    it('yeni mesajın id’sini sonuçta döner', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-9' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await expect(
        service.processIncomingMessage(baseMsg),
      ).resolves.toMatchObject({
        isNew: true,
        messageId: 'msg-9',
      });
    });

    it('var olan açık conversation’a mesaj ekler, yenisini oluşturmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-existing' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-existing' });

      await service.processIncomingMessage(baseMsg);

      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId: 'conv-existing' }),
        }),
      );
    });

    it('duplicate metaMessageId geldiğinde sessizce döner, hata fırlatmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.processIncomingMessage(baseMsg),
      ).resolves.toMatchObject({
        conversationId: 'conv-1',
        isNew: false,
        crisis: false,
        messageId: null,
      });
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });

    it('idempotency dışı hatalarda exception’ı yukarı fırlatır', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockRejectedValue(new Error('DB kesintisi'));

      await expect(service.processIncomingMessage(baseMsg)).rejects.toThrow(
        'DB kesintisi',
      );
    });

    it('kriz kelimesi içeren mesajda botu durdurur ve işaretler', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      const result = await service.processIncomingMessage({
        ...baseMsg,
        content: 'artık yaşamak istemiyorum',
      });

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { isBotActive: false, flaggedCrisis: true },
      });
      expect(result).toMatchObject({
        conversationId: 'conv-1',
        isNew: true,
        crisis: true,
      });
    });
  });
});
