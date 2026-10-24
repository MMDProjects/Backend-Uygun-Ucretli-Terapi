import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { verifyHmacSha256Signature, parseAppSecrets } from './crypto';
import { WebhooksService } from './webhooks.service';
import { AssistantService } from '../assistant/assistant.service';
import { MetaWebhookBody } from './dto/meta-webhook-payload.dto';

@ApiTags('webhooks')
@Public()
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
      return res.status(HttpStatus.OK).send(challenge);
    }
    throw new ForbiddenException('Doğrulama başarısız');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receive(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const signature = req.headers['x-hub-signature-256'] as
      | string
      | undefined;
    const secrets = parseAppSecrets(
      this.config.get<string>('META_APP_SECRET'),
    );

    if (!verifyHmacSha256Signature(rawBody, signature, secrets)) {
      throw new ForbiddenException('Geçersiz imza');
    }

    const body = req.body as MetaWebhookBody;
    const messages = this.webhooksService.extractMessages(body);

    const newConversations: { conversationId: string; crisis: boolean; content: string }[] = [];
    for (const msg of messages) {
      const outcome = await this.webhooksService.processIncomingMessage(msg);
      if (outcome?.isNew) {
        newConversations.push({
          conversationId: outcome.conversationId,
          crisis: outcome.crisis,
          content: msg.content,
        });
      }
    }

    for (const item of newConversations) {
      const task = item.crisis
        ? this.assistant.handleCrisis(item.conversationId)
        : this.assistant.handleIncoming(item.conversationId, item.content);
      void task.catch((err) =>
        this.logger.error(`Asistan görevi başarısız (${item.conversationId})`, err),
      );
    }

    return { received: true };
  }
}
