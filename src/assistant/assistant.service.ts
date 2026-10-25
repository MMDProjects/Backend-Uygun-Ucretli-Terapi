import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, Contact, Conversation, SenderType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { KnowledgeService } from './knowledge.service';
import { OpenAiClient, OpenAiMessage, OpenAiToolSchema } from './openai.client';
import { PromptBuilder } from './prompt-builder';
import {
  ASSISTANT_TOOLS,
  PERSONEL_SEBEP_VALUES,
  PersonelSebep,
} from './assistant-tools';
import { LeadsService, LeadToolArgs } from './leads.service';
import { HandoffService } from './handoff.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CRISIS_MESSAGE } from './crisis-message';

const MAX_TOOL_TURNS = 3;
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_DEBOUNCE_MS = 5000;
const DEFAULT_MAX_REPLIES_PER_HOUR = 20;
const DEFAULT_INSTAGRAM_MAX_CHARS = 1000;
const WHATSAPP_MAX_CHARS = 4096;
const REPLY_WINDOW_MS = 60 * 60 * 1000;
const UNSUPPORTED_PREFIX = '[desteklenmeyen mesaj tipi';
export const MEDIA_REPLY =
  'Sesli mesaj ve görselleri şu an açamıyorum. Yazılı olarak iletirseniz hemen yardımcı olayım; dilerseniz sizi ekibimize de aktarabilirim.';
const MEDIA_HANDOFF_SUMMARY =
  'Danışan medya mesajı gönderiyor (sesli mesaj/görsel)';

type ConversationWithContact = Conversation & { contact: Contact };
type MessageKind = 'text' | 'unsupported';
interface PendingTurn {
  timer: NodeJS.Timeout;
  hasText: boolean;
}

const isUnsupported = (content: string): boolean =>
  content.startsWith(UNSUPPORTED_PREFIX);

// Uzun metni kanal sınırına göre parçalar: önce boş satır, sonra cümle sonu,
// en son boşluk. Hiçbir parça sınırı aşmaz.
export function splitForChannel(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }
  const parts: string[] = [];
  let rest = text.replace(/\r\n/g, '\n').trim();
  while (rest.length > maxChars) {
    const cut = cutPoint(rest, maxChars);
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) {
    parts.push(rest);
  }
  return parts;
}

function cutPoint(text: string, max: number): number {
  const paragraph = text.lastIndexOf('\n\n', max);
  if (paragraph > 0) {
    return paragraph;
  }
  for (let i = Math.min(max - 1, text.length - 2); i > 0; i--) {
    if ('.!?'.includes(text[i]) && /\s/.test(text[i + 1])) {
      return i + 1;
    }
  }
  const space = text.lastIndexOf(' ', max);
  if (space > 0) {
    return space;
  }
  return max;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pendingTurns = new Map<string, PendingTurn>();

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

  // Cevabı hemen üretmez; süre dolunca tek tur çalıştırır.
  handleIncoming(
    conversationId: string,
    latestText: string,
    opts?: { kind?: MessageKind },
  ): Promise<void> {
    if (!this.isEnabled()) {
      return Promise.resolve();
    }
    const kind = opts?.kind ?? 'text';
    const delay = this.debounceMs();
    if (delay <= 0) {
      return this.enqueue(conversationId, () =>
        this.runIncoming(conversationId, latestText, kind),
      );
    }

    const previous = this.pendingTurns.get(conversationId);
    if (previous) {
      clearTimeout(previous.timer);
    }
    const hasText = previous?.hasText === true || kind === 'text';
    const timer = setTimeout(() => {
      this.pendingTurns.delete(conversationId);
      void this.enqueue(conversationId, () =>
        this.runIncoming(
          conversationId,
          latestText,
          hasText ? 'text' : 'unsupported',
        ),
      );
    }, delay);
    this.pendingTurns.set(conversationId, { timer, hasText });
    return Promise.resolve();
  }

  handleCrisis(
    conversationId: string,
    opts?: { repeat?: boolean },
  ): Promise<void> {
    const pending = this.pendingTurns.get(conversationId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingTurns.delete(conversationId);
    }
    return this.enqueue(conversationId, () =>
      this.runCrisis(conversationId, opts?.repeat === true),
    );
  }

  private enqueue(
    conversationId: string,
    task: () => Promise<void>,
  ): Promise<void> {
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

  private async runCrisis(
    conversationId: string,
    repeat: boolean,
  ): Promise<void> {
    if (!repeat) {
      await this.sendCrisisMessage(conversationId);
    }
    const text = repeat
      ? `Kriz konuşmasında yeni kriz ifadesi, konuşma: ${conversationId}`
      : `Kriz ifadesi tespit edildi, konuşma: ${conversationId}`;
    await this.notifications.notifyAdmins('DANGER_PANIC', text).catch(() => {});
  }

  private async sendCrisisMessage(conversationId: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    const conversation = await this.loadConversation(conversationId);
    if (!conversation) {
      return;
    }
    if (!(await this.deliver(conversation, CRISIS_MESSAGE))) {
      this.logger.warn(`Kriz mesajı gönderilemedi (${conversationId})`);
    }
  }

  private async runIncoming(
    conversationId: string,
    latestText: string,
    kind: MessageKind,
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const conversation = await this.loadConversation(conversationId);
      if (
        !conversation ||
        !conversation.isBotActive ||
        conversation.flaggedCrisis
      ) {
        return;
      }
      if (await this.reachedReplyLimit(conversationId)) {
        return;
      }
      if (kind === 'unsupported') {
        await this.runUnsupported(conversation);
        return;
      }

      const query = await this.buildSearchQuery(conversationId, latestText);
      const history = await this.loadHistory(conversationId);
      const search = await this.knowledge.search(query);
      if (search.items.length === 0) {
        await this.knowledge.recordUnanswered(
          conversationId,
          query,
          search.topScore,
        );
      }

      const priceTable = await this.promptBuilder.buildPriceTable();
      const knowledgeBlock = this.promptBuilder.buildKnowledgeContext(
        search.items,
      );
      const systemContent = knowledgeBlock
        ? `${this.promptBuilder.buildSystemPrompt(priceTable)}\n\n${knowledgeBlock}`
        : this.promptBuilder.buildSystemPrompt(priceTable);

      const messages: OpenAiMessage[] = [
        { role: 'system', content: systemContent },
        ...history,
      ];
      const tags = `${this.promptBuilder.buildChannelTag(conversation.channel, conversation.contact.phone)} ${this.promptBuilder.buildNowTag(new Date())}`;
      this.appendToLastUser(messages, latestText, tags);

      const { text: finalText, handedOffByTool } = await this.runToolLoop(
        conversation,
        messages,
      );
      // LLM çalışırken personel panelden devraldıysa bot cevabı gönderilmez.
      if (!handedOffByTool && !(await this.isStillBotActive(conversationId))) {
        this.logger.log(
          `Personel devraldı, bot yanıtı gönderilmedi (${conversationId})`,
        );
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

      if (!(await this.deliver(conversation, finalText))) {
        this.logger.warn(
          `Yanıt gönderilemedi, personele devrediliyor (${conversationId})`,
        );
        await this.handoffService.handoff(
          conversationId,
          'bilinmeyen_konu',
          'Asistan yanıtı danışana gönderilemedi',
        );
      }
    } catch (err) {
      this.logger.error(
        `Asistan yanıtı üretilemedi (${conversationId})`,
        err as Error,
      );
      await this.handoffService
        .handoff(conversationId, 'bilinmeyen_konu', 'Asistan hata verdi')
        .catch((handoffErr) =>
          this.logger.error(
            `Asistan devri başarısız (${conversationId})`,
            handoffErr,
          ),
        );
    }
  }

  // Medya mesajına LLM ya da bilgi bankası karışmadan yanıt verir.
  private async runUnsupported(
    conversation: ConversationWithContact,
  ): Promise<void> {
    const conversationId = conversation.id;
    if (!(await this.isStillBotActive(conversationId))) {
      return;
    }
    const replied = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderType: SenderType.BOT,
        content: MEDIA_REPLY,
      },
      select: { id: true },
    });
    if (replied) {
      await this.handoffService.handoff(
        conversationId,
        'bilinmeyen_konu',
        MEDIA_HANDOFF_SUMMARY,
      );
      return;
    }
    if (!(await this.deliver(conversation, MEDIA_REPLY))) {
      await this.handoffService.handoff(
        conversationId,
        'bilinmeyen_konu',
        'Asistan yanıtı danışana gönderilemedi',
      );
    }
  }

  // Son BOT/AGENT mesajından sonraki danışan mesajlarının birleşimi.
  private async buildSearchQuery(
    conversationId: string,
    latestText: string,
  ): Promise<string> {
    const lastReply = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderType: { in: [SenderType.BOT, SenderType.AGENT] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        senderType: SenderType.CLIENT,
        ...(lastReply ? { createdAt: { gt: lastReply.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { content: true },
    });
    const texts = rows
      .map((row) => row.content)
      .filter((content) => !isUnsupported(content));
    return texts.length > 0 ? texts.join('\n') : latestText;
  }

  // Son saatte gönderilen BOT cevabı sınıra ulaştıysa personele devreder.
  private async reachedReplyLimit(conversationId: string): Promise<boolean> {
    const count = await this.prisma.message.count({
      where: {
        conversationId,
        senderType: SenderType.BOT,
        createdAt: { gte: new Date(Date.now() - REPLY_WINDOW_MS) },
      },
    });
    if (count < this.maxRepliesPerHour()) {
      return false;
    }
    await this.handoffService.handoff(
      conversationId,
      'bilinmeyen_konu',
      'Saatlik bot cevap sınırı aşıldı',
    );
    return true;
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
      if (
        result.toolCalls.some((call) => call.name === 'personel_aktar_tool')
      ) {
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
        const output = await this.runTool(
          conversation,
          call.name,
          call.arguments,
        );
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
      await this.handoffService.handoff(
        conversation.id,
        sebep,
        typeof args.ozet === 'string' ? args.ozet : '',
      );
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
    });
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
        if (!isUnsupported(row.content)) {
          messages.push({ role: 'user', content: row.content });
        }
      } else {
        messages.push({ role: 'assistant', content: row.content });
      }
    }
    return messages;
  }

  private appendToLastUser(
    messages: OpenAiMessage[],
    latestText: string,
    tags: string,
  ): void {
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

  // Metni kanal sınırına göre bölüp sırayla gönderir. Bir parça başarısız
  // olursa kalanlar gönderilmez ve false döner.
  private async deliver(
    conversation: ConversationWithContact,
    text: string,
  ): Promise<boolean> {
    const recipientId = this.recipientId(conversation);
    if (!recipientId) {
      return false;
    }
    const parts = splitForChannel(text, this.maxCharsFor(conversation.channel));
    for (const part of parts) {
      const res = await this.metaSender.sendText(
        conversation.channel,
        recipientId,
        part,
      );
      if (!res.ok) {
        return false;
      }
      await this.saveBotMessage(conversation.id, part, res.messageId);
    }
    return true;
  }

  private async saveBotMessage(
    conversationId: string,
    content: string,
    metaMessageId?: string,
  ): Promise<void> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.BOT,
        content,
        metaMessageId: metaMessageId ?? null,
      },
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

  private maxCharsFor(channel: Channel): number {
    return channel === Channel.INSTAGRAM
      ? this.intSetting('INSTAGRAM_MAX_CHARS', DEFAULT_INSTAGRAM_MAX_CHARS, 1)
      : WHATSAPP_MAX_CHARS;
  }

  private debounceMs(): number {
    return this.intSetting('ASSISTANT_DEBOUNCE_MS', DEFAULT_DEBOUNCE_MS, 0);
  }

  private maxRepliesPerHour(): number {
    return this.intSetting(
      'ASSISTANT_MAX_REPLIES_PER_HOUR',
      DEFAULT_MAX_REPLIES_PER_HOUR,
      1,
    );
  }

  private historyLimit(): number {
    return this.intSetting('ASSISTANT_HISTORY_LIMIT', DEFAULT_HISTORY_LIMIT, 1);
  }

  private intSetting(key: string, fallback: number, min: number): number {
    const raw = Number(this.config.get<string>(key, String(fallback)));
    return Number.isInteger(raw) && raw >= min ? raw : fallback;
  }
}
