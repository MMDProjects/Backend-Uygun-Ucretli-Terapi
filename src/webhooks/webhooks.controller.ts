import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { verifyHmacSha256Signature, parseAppSecrets } from './crypto';
import { MessageKind, WebhooksService } from './webhooks.service';
import { AssistantService } from '../assistant/assistant.service';
import { MetaWebhookBody } from './dto/meta-webhook-payload.dto';

interface PendingAssistantTask {
  conversationId: string;
  content: string;
  kind: MessageKind;
  crisis: boolean;
  crisisNew: boolean;
  // Instagram bekleme modundan geldi: Elif yalnızca taslak üretir.
  standby: boolean;
}

@ApiTags('webhooks')
@Public()
@SkipThrottle()
@Controller('webhooks/meta')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly config: ConfigService,
    private readonly assistant: AssistantService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expected = this.config.get<string>('META_VERIFY_TOKEN');

    if (mode === 'subscribe' && expected && token === expected) {
      // Meta'nın challenge'ı kısa bir sayı/kod; başka her şey reddedilir ve
      // yanıt düz metin gider (sorgu parametresinin yansıtılması XSS'e açılmasın).
      if (
        typeof challenge !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(challenge)
      ) {
        throw new BadRequestException('Geçersiz hub.challenge');
      }
      return res.status(HttpStatus.OK).type('text/plain').send(challenge);
    }
    throw new ForbiddenException('Doğrulama başarısız');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receive(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const secrets = parseAppSecrets(this.config.get<string>('META_APP_SECRET'));

    if (!verifyHmacSha256Signature(rawBody, signature, secrets)) {
      throw new ForbiddenException('Geçersiz imza');
    }

    const body = req.body as MetaWebhookBody;
    const messages = this.webhooksService.extractMessages(body);

    const pending: PendingAssistantTask[] = [];
    for (const msg of messages) {
      const outcome = await this.webhooksService.processIncomingMessage(msg);
      if (outcome?.isNew) {
        pending.push({
          conversationId: outcome.conversationId,
          content: msg.content,
          kind: outcome.kind,
          crisis: outcome.crisis,
          crisisNew: outcome.crisisNew,
          standby: outcome.standby,
        });
      }
    }

    for (const item of pending) {
      void this.dispatchAssistant(item).catch((err) =>
        this.logger.error(
          `Asistan görevi başarısız (${item.conversationId})`,
          err,
        ),
      );
    }

    // Echo işleme yanıtı beklemez; hata yalnızca loglanır.
    for (const echo of this.webhooksService.extractInstagramEchoes(body)) {
      void this.webhooksService
        .processInstagramEcho(echo)
        .catch((err) =>
          this.logger.error(
            `Instagram echo işlenemedi (${echo.metaMessageId})`,
            err,
          ),
        );
    }

    return { received: true };
  }

  private dispatchAssistant(item: PendingAssistantTask): Promise<void> {
    if (!item.crisis) {
      return this.assistant.handleIncoming(item.conversationId, item.content, {
        kind: item.kind,
        draftOnly: item.standby === true,
      });
    }
    return item.crisisNew
      ? this.assistant.handleCrisis(item.conversationId)
      : this.assistant.handleCrisis(item.conversationId, { repeat: true });
  }
}
