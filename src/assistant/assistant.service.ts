import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssistantMode,
  Channel,
  Contact,
  ContactType,
  Conversation,
  Prisma,
  SenderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MetaSenderService } from '../webhooks/meta-sender.service';
import { KnowledgeSearchResult, KnowledgeService } from './knowledge.service';
import { OpenAiClient, OpenAiMessage, OpenAiToolSchema } from './openai.client';
import { PromptBuilder } from './prompt-builder';
import { buildContactContext } from './contact-context';
import { RewriteOptions, rewriteQuery } from './query-rewriter';
import {
  ASSISTANT_TOOLS,
  PERSONEL_SEBEP_VALUES,
  PersonelSebep,
} from './assistant-tools';
import { LeadsService, LeadToolArgs } from './leads.service';
import { HandoffService } from './handoff.service';
import { InboxEventsService } from '../inbox-events/inbox-events.service';
import { CRISIS_MESSAGE } from './crisis-message';
import { AssistantSettingsService } from './assistant-settings.service';
import { CrisisAlertService } from './crisis-alert.service';
import { PromptVersionsService } from './prompt-versions.service';

const MAX_TOOL_TURNS = 3;
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_HISTORY_MAX_CHARS = 6000;
const HISTORY_MESSAGE_MAX_CHARS = 1500;
const DEFAULT_MAX_TOKENS = 600;
const DEFAULT_TEMPERATURE = 0.4;
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
const SHADOW_TOOL_RESULT =
  'Gölge mod: işlem kaydedilmedi, danışana normal şekilde cevap yaz.';
// Gölge modda kayıt yerine taslağa yazılan araçlar.
const DRAFT_TOOL_NAMES = ['lead_tool', 'personel_aktar_tool'];

type ConversationWithContact = Conversation & { contact: Contact };
type MessageKind = 'text' | 'unsupported';
type DraftMode = 'SHADOW' | 'STANDBY';
interface DraftTool {
  name: string;
  args: Prisma.InputJsonObject;
}
interface ToolContext {
  shadow: boolean;
  // Önizlemede hiçbir araç çalışmaz; çağrılar yalnızca toplanır.
  simulate: boolean;
  calls: DraftTool[];
}
// Cevabın hangi bilgiyle üretildiği (C7). Mesaj ve taslak kaydında tutulur.
export type RetrievalRecord = {
  query: string;
  topScore: number | null;
  threshold: number;
  items: { id: string; title: string; source: string; score: number }[];
};
export interface AssistantPreview {
  reply: string | null;
  tools: { name: string; args: Record<string, unknown> }[];
  retrieval: RetrievalRecord;
}
interface PendingTurn {
  timer: NodeJS.Timeout;
  hasText: boolean;
  draftOnly: boolean;
}

const isUnsupported = (content: string): boolean =>
  content.startsWith(UNSUPPORTED_PREFIX);

function toRetrieval(
  query: string,
  search: KnowledgeSearchResult,
): RetrievalRecord {
  return {
    query,
    topScore: search.topScore,
    threshold: search.threshold,
    items: search.items.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      score: item.score,
    })),
  };
}

// En yeni mesajlardan başlayarak toplam karakter bütçesine sığanları tutar.
function trimHistory(
  messages: OpenAiMessage[],
  maxChars: number,
): OpenAiMessage[] {
  let total = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    total += typeof message.content === 'string' ? message.content.length : 0;
    if (total > maxChars) {
      break;
    }
    start = i;
  }
  return messages.slice(start);
}

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
    private readonly settings: AssistantSettingsService,
    private readonly crisisAlert: CrisisAlertService,
    private readonly promptVersions: PromptVersionsService,
  ) {}

  // Cevabı hemen üretmez; süre dolunca tek tur çalıştırır.
  // draftOnly: Instagram bekleme (standby) mesajı; cevap yalnız taslak olur.
  handleIncoming(
    conversationId: string,
    latestText: string,
    opts?: { kind?: MessageKind; draftOnly?: boolean },
  ): Promise<void> {
    const kind = opts?.kind ?? 'text';
    const draftOnly = opts?.draftOnly === true;
    const delay = this.debounceMs();
    if (delay <= 0) {
      return this.enqueue(conversationId, () =>
        this.runIncoming(conversationId, latestText, kind, draftOnly),
      );
    }

    const previous = this.pendingTurns.get(conversationId);
    if (previous) {
      clearTimeout(previous.timer);
    }
    const hasText = previous?.hasText === true || kind === 'text';
    // Bekleme penceresinde bir mesaj bile taslak ise tur taslak olur.
    const pendingDraftOnly = previous?.draftOnly === true || draftOnly;
    const timer = setTimeout(() => {
      this.pendingTurns.delete(conversationId);
      void this.enqueue(conversationId, () =>
        this.runIncoming(
          conversationId,
          latestText,
          hasText ? 'text' : 'unsupported',
          pendingDraftOnly,
        ),
      );
    }, delay);
    this.pendingTurns.set(conversationId, {
      timer,
      hasText,
      draftOnly: pendingDraftOnly,
    });
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

  // Mod okunamazsa güvenli tarafta kalıp kapalı sayılır.
  private async currentMode(): Promise<AssistantMode> {
    try {
      return await this.settings.getEffectiveMode();
    } catch (err) {
      this.logger.error('Asistan modu okunamadı', err as Error);
      return AssistantMode.OFF;
    }
  }

  private async runCrisis(
    conversationId: string,
    repeat: boolean,
  ): Promise<void> {
    if (!repeat) {
      await this.sendCrisisMessage(conversationId);
    }
    await this.crisisAlert.alert(
      conversationId,
      repeat ? 'repeat' : 'detected',
    );
    const text = repeat
      ? `Kriz konuşmasında yeni kriz ifadesi, konuşma: ${conversationId}`
      : `Kriz ifadesi tespit edildi, konuşma: ${conversationId}`;
    await this.notifications.notifyAdmins('DANGER_PANIC', text).catch(() => {});
  }

  // Kriz mesajı aydınlatmadan önce gider; aydınlatma bu yolda gönderilmez.
  private async sendCrisisMessage(conversationId: string): Promise<void> {
    const mode = await this.currentMode();
    if (mode === AssistantMode.OFF) {
      return;
    }
    const conversation = await this.loadConversation(conversationId);
    if (!conversation) {
      return;
    }
    if (conversation.contact.contactType !== ContactType.DANISAN) {
      this.logger.log(
        `Kriz mesajı atlandı, kişi danışan değil (${conversationId})`,
      );
      return;
    }
    if (mode === AssistantMode.SHADOW) {
      await this.saveDraft(conversation, CRISIS_MESSAGE, 'SHADOW', [], null);
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
    draftOnly: boolean,
  ): Promise<void> {
    const mode = await this.currentMode();
    if (mode === AssistantMode.OFF) {
      return;
    }
    // Gölge modda ve Instagram bekleme turunda cevap yalnızca taslak olur.
    const shadow = draftOnly || mode === AssistantMode.SHADOW;
    const draftMode: DraftMode = draftOnly ? 'STANDBY' : 'SHADOW';

    try {
      const conversation = await this.loadConversation(conversationId);
      if (
        !conversation ||
        !conversation.isBotActive ||
        conversation.flaggedCrisis
      ) {
        return;
      }
      // Uzman ve iç ekip mesajlarına Elif cevap vermez, personele devreder.
      if (conversation.contact.contactType !== ContactType.DANISAN) {
        if (!shadow) {
          await this.handoffService.handoff(
            conversationId,
            'uzman_ekip',
            'Uzman veya iç ekip mesajı — Elif cevap vermez',
          );
        }
        return;
      }
      if (!shadow && (await this.reachedReplyLimit(conversationId))) {
        return;
      }
      if (kind === 'unsupported') {
        await this.runUnsupported(conversation, shadow, draftMode);
        return;
      }

      // Kayda giden metin birleşik orijinal metindir; arama yeniden yazılmış sorguyla yapılır.
      const combined = await this.buildSearchQuery(conversationId, latestText);
      const history = await this.loadHistory(conversationId);
      const { query, search } = await this.searchKnowledge(combined, history);
      if (search.items.length === 0) {
        await this.knowledge.recordUnanswered(
          conversationId,
          combined,
          search.topScore,
        );
      }

      const tags = `${this.promptBuilder.buildChannelTag(conversation.channel, conversation.contact.phone)} ${this.promptBuilder.buildNowTag(new Date())}`;
      const messages = await this.buildMessages({
        search,
        history,
        latestText,
        tags,
        contactBlock: await this.safeContactContext(conversation),
      });
      const retrieval = toRetrieval(query, search);

      const {
        text: finalText,
        handedOffByTool,
        calls,
      } = await this.runToolLoop(conversation, messages, {
        shadow,
        simulate: false,
      });
      // LLM çalışırken personel panelden devraldıysa bot cevabı gönderilmez.
      if (!handedOffByTool && !(await this.isStillBotActive(conversationId))) {
        this.logger.log(
          `Personel devraldı, bot yanıtı gönderilmedi (${conversationId})`,
        );
        return;
      }
      if (!finalText) {
        if (shadow) {
          this.logger.warn(`Taslak için geçerli yanıt yok (${conversationId})`);
          return;
        }
        await this.handoffService.handoff(
          conversationId,
          'bilinmeyen_konu',
          'Asistan geçerli bir yanıt üretemedi',
        );
        return;
      }

      if (shadow) {
        await this.saveDraft(
          conversation,
          finalText,
          draftMode,
          calls,
          retrieval,
        );
        return;
      }

      if (!(await this.deliverWithNotice(conversation, finalText, retrieval))) {
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
    shadow: boolean,
    draftMode: DraftMode,
  ): Promise<void> {
    const conversationId = conversation.id;
    if (shadow) {
      await this.saveDraft(conversation, MEDIA_REPLY, draftMode, [], null);
      return;
    }
    if (!(await this.isStillBotActive(conversationId))) {
      return;
    }
    // Taslaklar sayılmaz; yalnızca gerçekten gönderilen sabit cevap bakılır.
    const replied = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderType: SenderType.BOT,
        content: MEDIA_REPLY,
        isDraft: false,
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
    if (!(await this.deliverWithNotice(conversation, MEDIA_REPLY))) {
      await this.handoffService.handoff(
        conversationId,
        'bilinmeyen_konu',
        'Asistan yanıtı danışana gönderilemedi',
      );
    }
  }

  // Son gönderilen BOT/AGENT mesajından sonraki danışan mesajlarının birleşimi.
  private async buildSearchQuery(
    conversationId: string,
    latestText: string,
  ): Promise<string> {
    const lastReply = await this.prisma.message.findFirst({
      where: {
        conversationId,
        senderType: { in: [SenderType.BOT, SenderType.AGENT] },
        isDraft: false,
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
  // Taslaklar sayılmaz.
  private async reachedReplyLimit(conversationId: string): Promise<boolean> {
    const count = await this.prisma.message.count({
      where: {
        conversationId,
        senderType: SenderType.BOT,
        isDraft: false,
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

  // Arama sorgusunu gerekirse yeniden yazar, sonra bilgi bankasında arar.
  private async searchKnowledge(
    combined: string,
    history: OpenAiMessage[],
  ): Promise<{ query: string; search: KnowledgeSearchResult }> {
    const query = await rewriteQuery(
      this.openai,
      history,
      combined,
      this.rewriteOptions(),
    );
    const search = await this.knowledge.search(query);
    return { query, search };
  }

  // Modele giden mesajlar: ana prompt (+ bilgi bloğu), kişi bloğu, geçmiş, son mesaj.
  private async buildMessages(input: {
    search: KnowledgeSearchResult;
    history: OpenAiMessage[];
    latestText: string;
    tags: string;
    contactBlock: string | null;
    promptOverride?: string;
  }): Promise<OpenAiMessage[]> {
    const priceTable = await this.promptBuilder.buildPriceTable();
    const template =
      input.promptOverride ?? (await this.promptVersions.getActiveContent());
    const knowledgeBlock = this.promptBuilder.buildKnowledgeContext(
      input.search.items,
    );
    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: `${this.promptBuilder.buildSystemPrompt(priceTable, template)}\n\n${knowledgeBlock}`,
      },
    ];
    if (input.contactBlock) {
      messages.push({ role: 'system', content: input.contactBlock });
    }
    messages.push(...input.history);
    this.appendToLastUser(messages, input.latestText, input.tags);
    return messages;
  }

  // Kişi bilgisi okunamazsa tur bu bilgisiz devam eder.
  private async safeContactContext(
    conversation: ConversationWithContact,
  ): Promise<string | null> {
    try {
      return await buildContactContext(this.prisma, conversation, {
        includeNotes:
          this.config.get<string>('ASSISTANT_INCLUDE_CONTACT_NOTES') === 'true',
        includeSummary:
          this.config.get<string>('ASSISTANT_CONVERSATION_SUMMARY') === 'true',
      });
    } catch (err) {
      this.logger.error(
        `Kişi bilgisi okunamadı (${conversation.id})`,
        err as Error,
      );
      return null;
    }
  }

  // "Elif'e sor" önizlemesi: kayıt, gönderim ve araç çalıştırma yok; geçmiş ve kişi bilgisi yok.
  // promptOverride verilirse aktif prompt yerine o metin kullanılır (panel "Dene").
  async previewReply(
    message: string,
    opts?: { promptOverride?: string },
  ): Promise<AssistantPreview> {
    const { query, search } = await this.searchKnowledge(message, []);
    const messages = await this.buildMessages({
      search,
      history: [],
      latestText: message,
      tags: this.promptBuilder.buildNowTag(new Date()),
      contactBlock: null,
      promptOverride: opts?.promptOverride,
    });
    const { text, calls } = await this.runToolLoop(null, messages, {
      shadow: true,
      simulate: true,
    });
    return {
      reply: text,
      tools: calls.map((call) => ({
        name: call.name,
        args: call.args,
      })),
      retrieval: toRetrieval(query, search),
    };
  }

  private async runToolLoop(
    conversation: ConversationWithContact | null,
    messages: OpenAiMessage[],
    opts: { shadow: boolean; simulate: boolean },
  ): Promise<{
    text: string | null;
    handedOffByTool: boolean;
    calls: DraftTool[];
  }> {
    const tools = ASSISTANT_TOOLS as OpenAiToolSchema[];
    const ctx: ToolContext = {
      shadow: opts.shadow,
      simulate: opts.simulate,
      calls: [],
    };
    const tuning = this.chatTuning();
    let handedOffByTool = false;

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const result = await this.openai.chat({ messages, tools, ...tuning });
      if (result.toolCalls.length === 0) {
        return {
          text: result.content?.trim() || null,
          handedOffByTool,
          calls: ctx.calls,
        };
      }
      // Gölge modda devir yapılmaz; bu yüzden bayrak kalkmaz.
      if (
        !opts.shadow &&
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
          ctx,
        );
        messages.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
    }

    const last = await this.openai.chat({ messages, ...tuning });
    return {
      text: last.content?.trim() || null,
      handedOffByTool,
      calls: ctx.calls,
    };
  }

  private async runTool(
    conversation: ConversationWithContact | null,
    name: string,
    rawArguments: string,
    ctx: ToolContext,
  ): Promise<string> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
      return 'Araç argümanları geçersiz JSON. Bilgileri düzeltip tekrar deneyin.';
    }

    // Önizlemede ve gölge modda kayıt ya da devir yapılmaz; çağrı yalnızca not düşülür.
    if (ctx.simulate || (ctx.shadow && DRAFT_TOOL_NAMES.includes(name))) {
      ctx.calls.push({ name, args: args as Prisma.InputJsonObject });
      return SHADOW_TOOL_RESULT;
    }
    // Yalnızca önizleme konuşmasız çalışır; yukarıdaki dal bunu kapsar.
    if (!conversation) {
      return `Bilinmeyen araç: ${name}`;
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
      where: { conversationId, isDraft: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const messages: OpenAiMessage[] = [];
    for (const row of [...rows].reverse()) {
      const content = row.content.slice(0, HISTORY_MESSAGE_MAX_CHARS);
      if (row.senderType === SenderType.CLIENT) {
        if (!isUnsupported(row.content)) {
          messages.push({ role: 'user', content });
        }
      } else {
        messages.push({ role: 'assistant', content });
      }
    }
    return trimHistory(
      messages,
      this.intSetting(
        'ASSISTANT_HISTORY_MAX_CHARS',
        DEFAULT_HISTORY_MAX_CHARS,
        1,
      ),
    );
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

  // Aydınlatma metni, ilk gerçek cevaptan önce kişiye bir kez gönderilir.
  private async deliverWithNotice(
    conversation: ConversationWithContact,
    text: string,
    retrieval: RetrievalRecord | null = null,
  ): Promise<boolean> {
    await this.sendNoticeOnce(conversation);
    return this.deliver(conversation, text, retrieval);
  }

  // Aydınlatma gönderilemezse hata vermez; bir sonraki cevapta tekrar denenir.
  private async sendNoticeOnce(
    conversation: ConversationWithContact,
  ): Promise<void> {
    if (conversation.contact.noticeSentAt) {
      return;
    }
    let notice: string | null;
    try {
      notice = (await this.settings.getSettings()).noticeText;
    } catch (err) {
      this.logger.error('Aydınlatma metni okunamadı', err as Error);
      return;
    }
    if (!notice) {
      return;
    }
    if (!(await this.deliver(conversation, notice))) {
      this.logger.warn(`Aydınlatma metni gönderilemedi (${conversation.id})`);
      return;
    }
    try {
      await this.prisma.contact.update({
        where: { id: conversation.contact.id },
        data: { noticeSentAt: new Date() },
      });
    } catch (err) {
      this.logger.error('Aydınlatma kaydı işaretlenemedi', err as Error);
    }
  }

  // Metni kanal sınırına göre bölüp sırayla gönderir. Bir parça başarısız
  // olursa kalanlar gönderilmez ve false döner.
  private async deliver(
    conversation: ConversationWithContact,
    text: string,
    retrieval: RetrievalRecord | null = null,
  ): Promise<boolean> {
    const recipientId = this.recipientId(conversation);
    if (!recipientId) {
      return false;
    }
    const parts = splitForChannel(text, this.maxCharsFor(conversation.channel));
    for (const [index, part] of parts.entries()) {
      const res = await this.metaSender.sendText(
        conversation.channel,
        recipientId,
        part,
      );
      if (!res.ok) {
        return false;
      }
      // Kaynak bilgisi yalnızca ilk parçaya yazılır.
      await this.saveBotMessage(
        conversation.id,
        part,
        res.messageId,
        index === 0 ? retrieval : null,
      );
    }
    return true;
  }

  private async saveBotMessage(
    conversationId: string,
    content: string,
    metaMessageId?: string,
    retrieval: RetrievalRecord | null = null,
  ): Promise<void> {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.BOT,
        content,
        metaMessageId: metaMessageId ?? null,
        retrieval: retrieval ?? undefined,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    this.inboxEvents.emit('message.created', { conversationId, message });
  }

  // Taslak: gönderilmez, lastMessageAt güncellenmez. Panelde kesik çizgili görünür.
  private async saveDraft(
    conversation: ConversationWithContact,
    content: string,
    mode: DraftMode,
    calls: DraftTool[],
    retrieval: RetrievalRecord | null,
  ): Promise<void> {
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.BOT,
        content,
        isDraft: true,
        draftMeta: {
          mode,
          tools: calls.map((call) => ({ name: call.name, args: call.args })),
        },
        retrieval: retrieval ?? undefined,
      },
    });
    this.inboxEvents.emit('message.created', {
      conversationId: conversation.id,
      message,
    });
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

  private rewriteOptions(): RewriteOptions {
    return {
      enabled: this.config.get<string>('ASSISTANT_QUERY_REWRITE') !== 'false',
      model: this.config.get<string>('OPENAI_REWRITE_MODEL') || undefined,
    };
  }

  private chatTuning(): { maxTokens: number; temperature: number } {
    return {
      maxTokens: this.intSetting('ASSISTANT_MAX_TOKENS', DEFAULT_MAX_TOKENS, 1),
      temperature: this.floatSetting(
        'ASSISTANT_TEMPERATURE',
        DEFAULT_TEMPERATURE,
        0,
        2,
      ),
    };
  }

  private floatSetting(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = this.config.get<string>(key);
    const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= min && value <= max
      ? value
      : fallback;
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
