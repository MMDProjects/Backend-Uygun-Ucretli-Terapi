import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, Contact, Conversation, SenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { KnowledgeService } from './knowledge.service';
import { OpenAiClient, OpenAiMessage, OpenAiToolSchema } from './openai.client';
import { PromptBuilder } from './prompt-builder';
import { ASSISTANT_TOOLS, PERSONEL_SEBEP_VALUES, PersonelSebep } from './assistant-tools';
import { LeadsService, LeadToolArgs } from './leads.service';
import { HandoffService } from './handoff.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CRISIS_MESSAGE } from './crisis-message';

const MAX_TOOL_TURNS = 3;
const DEFAULT_HISTORY_LIMIT = 20;

type ConversationWithContact = Conversation & { contact: Contact };

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly openai: OpenAiClient,
    private readonly knowledge: KnowledgeService,
    private readonly promptBuilder: PromptBuilder,
    private readonly leads: LeadsService,
    private readonly handoffService: HandoffService,
    private readonly metaSender: MetaSenderService,
    private readonly notifications: NotificationsService,
    private readonly inboxEvents: InboxEventsService,
  ) {}

  handleIncoming(conversationId: string, latestText: string): Promise<void> {
    return this.enqueue(conversationId, () =>
      this.runIncoming(conversationId, latestText),
    );
  }

  handleCrisis(conversationId: string): Promise<void> {
    return this.enqueue(conversationId, () => this.runCrisis(conversationId));
  }

  private enqueue(conversationId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(conversationId) ?? Promise.resolve();
    const next = previous
      .then(task)
      .catch((err) =>
        this.logger.error(`Asistan görevi başarısız (${conversationId})`, err),
      );
    this.queues.set(conversationId, next);
    void next.finally(() => {
      if (this.queues.get(conversationId) === next) {
        this.queues.delete(conversationId);
      }
    });
    return next;
  }

  private async isStillBotActive(conversationId: string): Promise<boolean> {
    const current = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isBotActive: true },
    });
    return !!current?.isBotActive;
  }

  private isEnabled(): boolean {
    return this.config.get<string>('ASSISTANT_ENABLED') === 'true';
  }

  private async runCrisis(conversationId: string): Promise<void> {
    if (this.isEnabled()) {
      const conversation = await this.loadConversation(conversationId);
      if (conversation) {
        const recipientId = this.recipientId(conversation);
        if (recipientId) {
          const sent = await this.metaSender.sendText(
            conversation.channel,
            recipientId,
            CRISIS_MESSAGE,
          );
          if (sent) {
            await this.saveBotMessage(conversationId, CRISIS_MESSAGE);
          }
        }
      }
    }

    await this.notifications
      .notifyAdmins(
        'DANGER_PANIC',
        `Kriz ifadesi tespit edildi, konuşma: ${conversationId}`,
      )
      .catch(() => {});
  }

  private async runIncoming(conversationId: string, latestText: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const conversation = await this.loadConversation(conversationId);
      if (!conversation || !conversation.isBotActive || conversation.flaggedCrisis) {
        return;
      }

      const history = await this.loadHistory(conversationId);
      const search = await this.knowledge.search(latestText);
      if (search.items.length === 0) {
        await this.knowledge.recordUnanswered(conversationId, latestText, search.topScore);
      }

      const priceTable = await this.promptBuilder.buildPriceTable();
      const knowledgeBlock = this.promptBuilder.buildKnowledgeContext(search.items);
      const systemContent = knowledgeBlock
        ? `${this.promptBuilder.buildSystemPrompt(priceTable)}\n\n${knowledgeBlock}`
        : this.promptBuilder.buildSystemPrompt(priceTable);

      const messages: OpenAiMessage[] = [{ role: 'system', content: systemContent }, ...history];
      const tags = `${this.promptBuilder.buildChannelTag(conversation.channel, conversation.contact.phone)} ${this.promptBuilder.buildNowTag(new Date())}`;
      this.appendToLastUser(messages, latestText, tags);

      const { text: finalText, handedOffByTool } = await this.runToolLoop(
        conversation,
        messages,
      );
      // LLM çalışırken personel panelden devraldıysa bot cevabı gönderilmez.
      if (!handedOffByTool && !(await this.isStillBotActive(conversationId))) {
        this.logger.log(`Personel devraldı, bot yanıtı gönderilmedi (${conversationId})`);
        return;
      }
      if (!finalText) {
        await this.handoffService.handoff(
          conversationId,
          'bilinmeyen_konu',
          'Asistan geçerli bir yanıt üretemedi',
        );
        return;
      }

      const recipientId = this.recipientId(conversation);
      const sent = recipientId
        ? await this.metaSender.sendText(conversation.channel, recipientId, finalText)
        : false;
      if (!sent) {
        this.logger.warn(`Yanıt gönderilemedi, personele devrediliyor (${conversationId})`);
        await this.handoffService.handoff(
          conversationId,
          'bilinmeyen_konu',
          'Asistan yanıtı danışana gönderilemedi',
        );
        return;
      }
      await this.saveBotMessage(conversationId, finalText);
    } catch (err) {
      this.logger.error(`Asistan yanıtı üretilemedi (${conversationId})`, err as Error);
      await this.handoffService
        .handoff(conversationId, 'bilinmeyen_konu', 'Asistan hata verdi')
        .catch((handoffErr) =>
          this.logger.error(`Asistan devri başarısız (${conversationId})`, handoffErr),
        );
    }
  }

  private async runToolLoop(
    conversation: ConversationWithContact,
    messages: OpenAiMessage[],
  ): Promise<{ text: string | null; handedOffByTool: boolean }> {
    const tools = ASSISTANT_TOOLS as OpenAiToolSchema[];
    let handedOffByTool = false;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const result = await this.openai.chat({ messages, tools });
      if (result.toolCalls.length === 0) {
        return { text: result.content?.trim() || null, handedOffByTool };
      }
      if (result.toolCalls.some((call) => call.name === 'personel_aktar_tool')) {
        handedOffByTool = true;
      }

      messages.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      for (const call of result.toolCalls) {
        const output = await this.runTool(conversation, call.name, call.arguments);
        messages.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
    }

    const last = await this.openai.chat({ messages });
    return { text: last.content?.trim() || null, handedOffByTool };
  }

  private async runTool(
    conversation: ConversationWithContact,
    name: string,
    rawArguments: string,
  ): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
      return 'Araç argümanları geçersiz JSON. Bilgileri düzeltip tekrar deneyin.';
    }

    if (name === 'lead_tool') {
      const result = await this.leads.createFromTool(
        conversation,
        conversation.contact,
        args as unknown as LeadToolArgs,
      );
      return result.message;
    }

    if (name === 'personel_aktar_tool') {
      const sebep = args.sebep as PersonelSebep;
      if (!PERSONEL_SEBEP_VALUES.includes(sebep)) {
        return 'Geçersiz devir sebebi.';
      }
      await this.handoffService.handoff(conversation.id, sebep, String(args.ozet ?? ''));
      return 'Konuşma ekip personeline devredildi. Danışana kısa bir bilgilendirme mesajı yazın.';
    }

    return `Bilinmeyen araç: ${name}`;
  }

  private async loadConversation(
    conversationId: string,
  ): Promise<ConversationWithContact | null> {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    }) as Promise<ConversationWithContact | null>;
  }

  private async loadHistory(conversationId: string): Promise<OpenAiMessage[]> {
    const limit = this.historyLimit();
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const messages: OpenAiMessage[] = [];
    for (const row of [...rows].reverse()) {
      if (row.senderType === SenderType.CLIENT) {
        messages.push({ role: 'user', content: row.content });
      } else {
        messages.push({ role: 'assistant', content: row.content });
      }
    }
    return messages;
  }

  private appendToLastUser(messages: OpenAiMessage[], latestText: string, tags: string): void {
    const suffix = `\n\n${tags}`;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        messages[i] = { role: 'user', content: `${message.content}${suffix}` };
        return;
      }
    }
    messages.push({ role: 'user', content: `${latestText}${suffix}` });
  }

  private async saveBotMessage(conversationId: string, content: string): Promise<void> {
    const message = await this.prisma.message.create({
      data: { conversationId, senderType: SenderType.BOT, content },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    this.inboxEvents.emit('message.created', { conversationId, message });
  }

  private recipientId(conversation: ConversationWithContact): string | null {
    if (conversation.channel === Channel.WHATSAPP) {
      return conversation.contact.phone ?? null;
    }
    if (conversation.channel === Channel.INSTAGRAM) {
      return conversation.contact.instagramId ?? null;
    }
    return null;
  }

  private historyLimit(): number {
    const raw = Number(this.config.get<string>('ASSISTANT_HISTORY_LIMIT', String(DEFAULT_HISTORY_LIMIT)));
    return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_HISTORY_LIMIT;
  }
}
