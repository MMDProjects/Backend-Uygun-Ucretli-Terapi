import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { AssistantSettingsService } from '../assistant/assistant-settings.service';
import { InstagramProfileService } from './instagram-profile.service';
import { MetaWebhookBody } from './dto/meta-webhook-payload.dto';

function buildPrismaMock() {
  return {
    contact: {
      findFirst: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
      updateMany: jest.fn<any, any>(),
    },
    user: {
      findMany: jest.fn<any, any>().mockResolvedValue([]),
    },
    conversation: {
      findFirst: jest.fn<any, any>(),
      create: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
    message: {
      create: jest.fn<any, any>(),
      findUnique: jest.fn<any, any>(),
      findFirst: jest.fn<any, any>(),
      update: jest.fn<any, any>(),
    },
  };
}

function buildConfigMock(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const P2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('WebhooksService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let service: WebhooksService;
  let inboxEvents: { emit: jest.Mock };
  let settings: { getEffectiveMode: jest.Mock };
  let instagramProfile: { fetchName: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    inboxEvents = { emit: jest.fn<any, any>() };
    settings = {
      getEffectiveMode: jest.fn<any, any>().mockResolvedValue('LIVE'),
    };
    instagramProfile = {
      fetchName: jest.fn<any, any>().mockResolvedValue(null),
    };
    service = new WebhooksService(
      prisma as unknown as PrismaService,
      inboxEvents as unknown as InboxEventsService,
      buildConfigMock(),
      settings as unknown as AssistantSettingsService,
      instagramProfile as unknown as InstagramProfileService,
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
        kind: 'text',
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
      expect(result[0].kind).toBe('unsupported');
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
        kind: 'text',
      });
    });

    it('Instagram metin dışı mesajı unsupported olarak işaretler', () => {
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
                message: { mid: 'mid.img' },
              },
            ],
          },
        ],
      };

      const result = service.extractMessages(body);

      expect(result[0]).toMatchObject({
        kind: 'unsupported',
        content: '[desteklenmeyen mesaj tipi]',
      });
    });

    it('is_echo: true olan Instagram mesajını gelen mesaj olarak atlar', () => {
      const body: MetaWebhookBody = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-1',
            messaging: [
              {
                sender: { id: 'ig-page-1' },
                recipient: { id: 'ig-user-1' },
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

      expect(service.extractMessages(body)).toHaveLength(0);
    });
  });

  describe('extractInstagramEchoes', () => {
    it('echo mesajlarını danışan (recipient) kimliğiyle çıkarır', () => {
      const body: MetaWebhookBody = {
        object: 'instagram',
        entry: [
          {
            id: 'entry-1',
            messaging: [
              {
                sender: { id: 'ig-page-1' },
                recipient: { id: 'ig-user-1' },
                timestamp: 1700000000000,
                message: { mid: 'mid.echo', text: 'Merhaba', is_echo: true },
              },
              {
                sender: { id: 'ig-user-1' },
                recipient: { id: 'ig-page-1' },
                timestamp: 1700000000000,
                message: { mid: 'mid.in', text: 'Selam' },
              },
            ],
          },
        ],
      };

      expect(service.extractInstagramEchoes(body)).toEqual([
        {
          externalContactId: 'ig-user-1',
          metaMessageId: 'mid.echo',
          content: 'Merhaba',
        },
      ]);
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
      kind: 'text' as const,
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

    it('yeni mesajın id’sini ve kind’ını sonuçta döner', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-9' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await expect(
        service.processIncomingMessage({ ...baseMsg, kind: 'unsupported' }),
      ).resolves.toMatchObject({
        isNew: true,
        messageId: 'msg-9',
        kind: 'unsupported',
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

    it('PENDING_AGENT konuşma kapanmamış sayılır ve yeniden kullanılır', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-pending',
        status: 'PENDING_AGENT',
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-pending' });

      await service.processIncomingMessage(baseMsg);

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: 'contact-1',
            channel: 'WHATSAPP',
            status: { in: ['OPEN', 'PENDING_AGENT'] },
          }),
        }),
      );
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId: 'conv-pending' }),
        }),
      );
    });

    it('CLOSED konuşmadan sonra yeni konuşma açılır', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      // Kapanmış konuşma sorguya girmez; aktif arama boş döner.
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-new' });

      await service.processIncomingMessage(baseMsg);

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { contactId: 'contact-1', channel: 'WHATSAPP' },
      });
    });

    it('son 30 gün içinde kriz işaretli konuşma varsa yeni konuşma bot kapalı açılır', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst
        .mockResolvedValueOnce(null) // aktif konuşma yok
        .mockResolvedValueOnce({ id: 'conv-old' }); // kilit: kriz işaretli
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-new' });

      const before = Date.now();
      await service.processIncomingMessage(baseMsg);
      const after = Date.now();

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          channel: 'WHATSAPP',
          isBotActive: false,
          status: 'PENDING_AGENT',
          flaggedCrisis: true,
          handoffReason: 'acil_durum',
          handoffSummary: 'Önceki konuşmada kriz işareti vardı',
          handedOffAt: expect.any(Date),
        },
      });
      const lockQuery = prisma.conversation.findFirst.mock.calls[1][0];
      const dayMs = 24 * 60 * 60 * 1000;
      const since = lockQuery.where.lastMessageAt.gte as Date;
      expect(since.getTime()).toBeGreaterThanOrEqual(before - 30 * dayMs);
      expect(since.getTime()).toBeLessThanOrEqual(after - 30 * dayMs);
    });

    it('kilit süresi ASSISTANT_CRISIS_LOCK_DAYS ile değiştirilebilir', async () => {
      service = new WebhooksService(
        prisma as unknown as PrismaService,
        inboxEvents as unknown as InboxEventsService,
        buildConfigMock({ ASSISTANT_CRISIS_LOCK_DAYS: '7' }),
        settings as unknown as AssistantSettingsService,
        instagramProfile as unknown as InstagramProfileService,
      );
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-new' });

      const before = Date.now();
      await service.processIncomingMessage(baseMsg);

      const lockQuery = prisma.conversation.findFirst.mock.calls[1][0];
      const since = lockQuery.where.lastMessageAt.gte as Date;
      const dayMs = 24 * 60 * 60 * 1000;
      expect(since.getTime()).toBeGreaterThanOrEqual(before - 7 * dayMs);
      expect(since.getTime()).toBeLessThanOrEqual(Date.now() - 7 * dayMs);
    });

    it('duplicate metaMessageId geldiğinde sessizce döner, hata fırlatmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockRejectedValue(P2002());

      await expect(
        service.processIncomingMessage(baseMsg),
      ).resolves.toMatchObject({
        conversationId: 'conv-1',
        isNew: false,
        crisis: false,
        crisisNew: false,
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

    it('kriz kelimesi içeren mesajda konuşmayı devreder ve işaretler', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        flaggedCrisis: false,
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      const result = await service.processIncomingMessage({
        ...baseMsg,
        content: 'artık yaşamak istemiyorum',
      });

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          lastMessageAt: expect.any(Date),
          isBotActive: false,
          status: 'PENDING_AGENT',
          flaggedCrisis: true,
          handoffReason: 'acil_durum',
          handoffSummary: 'Mesajda kriz ifadesi tespit edildi',
          handedOffAt: expect.any(Date),
        },
      });
      expect(result).toMatchObject({
        conversationId: 'conv-1',
        isNew: true,
        crisis: true,
        crisisNew: true,
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-1',
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('konuşma zaten kriz işaretliyse crisisNew false döner', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({
        id: 'conv-1',
        flaggedCrisis: true,
      });
      prisma.message.create.mockResolvedValue({ id: 'msg-2' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await expect(
        service.processIncomingMessage({
          ...baseMsg,
          content: 'yine kendimi öldürmek istiyorum',
        }),
      ).resolves.toMatchObject({ crisis: true, crisisNew: false });
    });

    it('kriz olmayan mesajda konuşma devralınmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      const result = await service.processIncomingMessage(baseMsg);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lastMessageAt: expect.any(Date) },
      });
      expect(result).toMatchObject({ crisis: false, crisisNew: false });
    });
  });

  describe('processInstagramEcho', () => {
    const echo = {
      externalContactId: 'ig-user-1',
      metaMessageId: 'mid.echo',
      content: 'Merhaba, randevunuz onaylandı',
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // Bekleme süresini sahte zamanlayıcıyla ilerletip işlemi tamamlar.
    async function runEcho(value = echo) {
      const pending = service.processInstagramEcho(value);
      await jest.advanceTimersByTimeAsync(5000);
      await pending;
    }

    it('kimliği bizde kayıtlıysa bekleme yapmadan atlar', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-bot' });

      await service.processInstagramEcho(echo);

      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.contact.findFirst).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });

    it('kayıt 5 sn sonra gelirse ikinci kontrolde atlar', async () => {
      prisma.message.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'msg-late' });

      await runEcho();

      expect(prisma.message.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('aynı metinli, kimliksiz bot mesajı varsa kimliği ona bağlar', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.findFirst.mockResolvedValue({ id: 'msg-bot' });
      prisma.message.update.mockResolvedValue({ id: 'msg-bot' });

      await runEcho();

      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: 'conv-1',
            senderType: { in: ['BOT', 'AGENT'] },
            content: echo.content,
            metaMessageId: null,
          }),
        }),
      );
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-bot' },
        data: { metaMessageId: 'mid.echo' },
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });

    it('eşleşme yoksa sistem dışı gönderimi personel mesajı olarak kaydeder ve devralır', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-2' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-2' });
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.message.create.mockResolvedValue({ id: 'msg-agent' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-2' });

      await runEcho();

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          instagramId: 'ig-user-1',
          fullName: undefined,
          channel: 'INSTAGRAM',
        },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-2',
          senderType: 'AGENT',
          agentUserId: null,
          externalSource: 'instagram_app',
          content: echo.content,
          metaMessageId: 'mid.echo',
        },
      });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-2' },
        data: {
          lastMessageAt: expect.any(Date),
          isBotActive: false,
          status: 'PENDING_AGENT',
        },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('message.created', {
        conversationId: 'conv-2',
        message: { id: 'msg-agent' },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-2',
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('eşzamanlı kayıt P2002 verirse sessizce döner', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.message.create.mockRejectedValue(P2002());

      await expect(runEcho()).resolves.toBeUndefined();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalled();
    });
  });
  describe('bekleme (standby) ve kişi tipi', () => {
    const standbyBody: MetaWebhookBody = {
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          standby: [
            {
              sender: { id: 'ig-user-1' },
              recipient: { id: 'ig-page-1' },
              timestamp: 1700000000000,
              message: { mid: 'mid.sb', text: 'Bekleme mesajı' },
            },
            {
              sender: { id: 'ig-page-1' },
              recipient: { id: 'ig-user-1' },
              timestamp: 1700000000000,
              message: { mid: 'mid.sb-echo', text: 'Eski bot', is_echo: true },
            },
          ],
        },
      ],
    };

    it('standby mesajlarını standby: true ile çıkarır, echo’yu mesaj saymaz', () => {
      const result = service.extractMessages(standbyBody);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        externalContactId: 'ig-user-1',
        metaMessageId: 'mid.sb',
        standby: true,
      });
    });

    it('standby içindeki is_echo olaylarını echo olarak standby: true ile çıkarır', () => {
      expect(service.extractInstagramEchoes(standbyBody)).toEqual([
        {
          externalContactId: 'ig-user-1',
          metaMessageId: 'mid.sb-echo',
          content: 'Eski bot',
          standby: true,
        },
      ]);
    });

    it('processIncomingMessage standby bilgisini sonuçta iletir', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      const result = await service.processIncomingMessage({
        channel: 'INSTAGRAM' as const,
        externalContactId: 'ig-user-1',
        metaMessageId: 'mid.sb',
        content: 'Merhaba',
        kind: 'text' as const,
        timestamp: new Date(),
        standby: true,
      });

      expect(result).toMatchObject({ isNew: true, standby: true });
    });

    it('yeni WhatsApp kişisinde detectContactType ile tip atanır (UZMAN)', async () => {
      prisma.user.findMany.mockResolvedValue([
        { role: 'UZMAN', phone: '+90 555 000 11 22' },
      ]);
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.processIncomingMessage({
        channel: 'WHATSAPP' as const,
        externalContactId: '905550001122',
        metaMessageId: 'wamid.X',
        content: 'Merhaba',
        kind: 'text' as const,
        timestamp: new Date(),
      });

      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: '905550001122',
          contactType: 'UZMAN',
        }),
      });
    });

    it('mevcut WhatsApp kişisinde tip yeniden hesaplanmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });

      await service.processIncomingMessage({
        channel: 'WHATSAPP' as const,
        externalContactId: '905550001122',
        metaMessageId: 'wamid.Y',
        content: 'Merhaba',
        kind: 'text' as const,
        timestamp: new Date(),
      });

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it('yeni Instagram kişisinde profil adı yazılır ve conversation.updated yayınlanır', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-9' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-9' });
      prisma.message.create.mockResolvedValue({ id: 'msg-9' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-9' });
      prisma.contact.updateMany.mockResolvedValue({ count: 1 });
      instagramProfile.fetchName.mockResolvedValue('Ayşe Yılmaz');

      await service.processIncomingMessage({
        channel: 'INSTAGRAM' as const,
        externalContactId: 'ig-user-9',
        metaMessageId: 'mid.9',
        content: 'Merhaba',
        kind: 'text' as const,
        timestamp: new Date(),
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(instagramProfile.fetchName).toHaveBeenCalledWith('ig-user-9');
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: 'contact-9', fullName: null },
        data: { fullName: 'Ayşe Yılmaz' },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('conversation.updated', {
        conversationId: 'conv-9',
      });
    });

    it('profil adı alınamazsa kişi güncellenmez ve hata fırlatılmaz', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'contact-9' });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-9' });
      prisma.message.create.mockResolvedValue({ id: 'msg-9' });
      instagramProfile.fetchName.mockRejectedValue(new Error('ağ hatası'));

      const result = await service.processIncomingMessage({
        channel: 'INSTAGRAM' as const,
        externalContactId: 'ig-user-9',
        metaMessageId: 'mid.9',
        content: 'Merhaba',
        kind: 'text' as const,
        timestamp: new Date(),
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toMatchObject({ isNew: true });
      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
      expect(inboxEvents.emit).not.toHaveBeenCalledWith(
        'conversation.updated',
        expect.anything(),
      );
    });
  });

  describe('Instagram echo kipleri (gölge mod ve standby)', () => {
    const echo = {
      externalContactId: 'ig-user-1',
      metaMessageId: 'mid.echo',
      content: 'Merhaba, randevunuz onaylandı',
    };

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function runEcho(value: unknown) {
      const pending = service.processInstagramEcho(value as any);
      await jest.advanceTimersByTimeAsync(5000);
      await pending;
    }

    function arrangeKnownContact() {
      prisma.message.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
      prisma.contact.update.mockResolvedValue({ id: 'contact-1' });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.message.create.mockResolvedValue({ id: 'msg-agent' });
      prisma.conversation.update.mockResolvedValue({ id: 'conv-1' });
    }

    it('SHADOW modunda mesajı kaydeder ama konuşmayı devralmaz', async () => {
      settings.getEffectiveMode.mockResolvedValue('SHADOW');
      arrangeKnownContact();

      await runEcho(echo);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          senderType: 'AGENT',
          externalSource: 'instagram_app',
          metaMessageId: 'mid.echo',
        }),
      });
      const updateData = prisma.conversation.update.mock.calls[0][0].data;
      expect(updateData).toEqual({ lastMessageAt: expect.any(Date) });
      expect(inboxEvents.emit).toHaveBeenCalledWith('message.created', {
        conversationId: 'conv-1',
        message: { id: 'msg-agent' },
      });
      expect(inboxEvents.emit).not.toHaveBeenCalledWith(
        'counts.changed',
        expect.anything(),
      );
    });

    it('LIVE modunda ana akıştaki gibi konuşmayı devralır', async () => {
      settings.getEffectiveMode.mockResolvedValue('LIVE');
      arrangeKnownContact();

      await runEcho(echo);

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          lastMessageAt: expect.any(Date),
          isBotActive: false,
          status: 'PENDING_AGENT',
        },
      });
      expect(inboxEvents.emit).toHaveBeenCalledWith('counts.changed', {});
    });

    it('standby echo’su LIVE modunda bile konuşmayı devralmaz', async () => {
      settings.getEffectiveMode.mockResolvedValue('LIVE');
      arrangeKnownContact();

      await runEcho({ ...echo, standby: true });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ externalSource: 'instagram_app' }),
      });
      const updateData = prisma.conversation.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('status');
      expect(updateData).not.toHaveProperty('isBotActive');
      expect(inboxEvents.emit).not.toHaveBeenCalledWith(
        'counts.changed',
        expect.anything(),
      );
    });
  });
});
