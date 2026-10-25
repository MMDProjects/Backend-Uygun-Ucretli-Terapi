import { ConfigService } from '@nestjs/config';
import { SenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { OpenAiClient } from './openai.client';

function build(flag: string | undefined) {
  const prisma = {
    conversation: {
      findUnique: jest.fn<any, any>().mockResolvedValue({ contactId: 'ct1' }),
    },
    message: {
      findMany: jest.fn<any, any>().mockResolvedValue([
        { senderType: SenderType.AGENT, content: 'Yarın 14:00 uygun' },
        { senderType: SenderType.CLIENT, content: 'Bireysel terapi istiyorum' },
      ]),
    },
    contact: { update: jest.fn<any, any>().mockResolvedValue({}) },
  };
  const openai = {
    chat: jest.fn<any, any>().mockResolvedValue({
      content: '  Bireysel terapi, yarın uygun.  ',
      toolCalls: [],
    }),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'ASSISTANT_CONVERSATION_SUMMARY' ? flag : undefined,
    ),
  };
  const service = new ConversationSummaryService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    openai as unknown as OpenAiClient,
  );
  return { service, prisma, openai };
}

describe('ConversationSummaryService', () => {
  it('bayrak kapalıysa hiçbir şey yapmaz', async () => {
    const { service, prisma, openai } = build('false');

    await service.summarize('conv-1');

    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(openai.chat).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('bayrak tanımsızsa da hiçbir şey yapmaz', async () => {
    const { service, openai } = build(undefined);

    await service.summarize('conv-1');

    expect(openai.chat).not.toHaveBeenCalled();
  });

  it('bayrak açıksa taslaksız son mesajları okur, özeti kişiye yazar', async () => {
    const { service, prisma, openai } = build('true');

    await service.summarize('conv-1');

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'conv-1', isDraft: false },
        take: 30,
      }),
    );
    expect(openai.chat).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 200, temperature: 0.2 }),
    );
    const sent = openai.chat.mock.calls[0][0];
    expect(sent.messages[0].content).toContain(
      'Teşhis, şikâyet ayrıntısı, sağlık bilgisi, kişisel ilişki bilgisi YAZMA',
    );
    expect(sent.messages[1].content).toContain('Danışan: Bireysel terapi');
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'ct1' },
      data: {
        lastSummary: 'Bireysel terapi, yarın uygun.',
        lastSummaryAt: expect.any(Date),
      },
    });
  });

  it('model hatasını yutar ve kişiye yazmaz', async () => {
    const { service, prisma, openai } = build('true');
    openai.chat.mockRejectedValue(new Error('timeout'));

    await expect(service.summarize('conv-1')).resolves.toBeUndefined();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});
