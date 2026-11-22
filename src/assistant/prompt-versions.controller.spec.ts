import { BadRequestException } from '@nestjs/common';
import { Channel } from '@prisma/client';
import { AssistantService } from './assistant.service';
import { OpenAiUnavailableError } from './openai.client';
import { PromptVersionsController } from './prompt-versions.controller';
import { PromptVersionsService } from './prompt-versions.service';

const PLACEHOLDER = '{{FIYAT_TABLOSU}}';
const VALID_CONTENT = `${PLACEHOLDER}\n${'a'.repeat(600)}`;

describe('PromptVersionsController test uç noktası', () => {
  function build() {
    const prompts = new PromptVersionsService({} as never);
    const validate = jest.spyOn(prompts, 'validateContent');
    const assistant = {
      previewReply: jest.fn<any, any>().mockResolvedValue({
        reply: 'Önizleme',
        tools: [],
        retrieval: { query: 'q', topScore: null, threshold: 0.4, items: [] },
      }),
    };
    const controller = new PromptVersionsController(
      prompts,
      assistant as unknown as AssistantService,
    );
    return { controller, assistant, validate };
  }

  it('geçici prompt ile previewReply çağırır ve sonucu döner', async () => {
    const { controller, assistant } = build();

    const result = await controller.test({
      content: VALID_CONTENT,
      message: 'Merhaba',
    });

    expect(assistant.previewReply).toHaveBeenCalledWith('Merhaba', {
      promptOverride: VALID_CONTENT,
      addendaOverride: {
        whatsappAddendum: undefined,
        instagramAddendum: undefined,
      },
      channel: Channel.WHATSAPP,
    });
    expect(result.reply).toBe('Önizleme');
  });

  it('kanal INSTAGRAM seçilirse ve ekler verilirse önizlemeye iletilir', async () => {
    const { controller, assistant } = build();

    await controller.test({
      content: VALID_CONTENT,
      message: 'Merhaba',
      whatsappAddendum: 'WA',
      instagramAddendum: 'IG',
      channel: 'INSTAGRAM',
    });

    expect(assistant.previewReply).toHaveBeenCalledWith('Merhaba', {
      promptOverride: VALID_CONTENT,
      addendaOverride: { whatsappAddendum: 'WA', instagramAddendum: 'IG' },
      channel: Channel.INSTAGRAM,
    });
  });

  it('geçersiz içerikte 400 döner ve önizleme çalışmaz', async () => {
    const { controller, assistant } = build();

    await expect(
      controller.test({ content: `${PLACEHOLDER} kısa`, message: 'Merhaba' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(assistant.previewReply).not.toHaveBeenCalled();
  });

  it('OpenAI yoksa 503 benzeri hata fırlatır', async () => {
    const { controller, assistant } = build();
    assistant.previewReply.mockRejectedValue(new OpenAiUnavailableError());

    await expect(
      controller.test({ content: VALID_CONTENT, message: 'Merhaba' }),
    ).rejects.toThrow('OpenAI anahtarı tanımlı değil');
  });
});
