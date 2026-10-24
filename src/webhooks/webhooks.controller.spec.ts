import { ForbiddenException, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import * as crypto from './crypto';
import { AssistantService } from '../assistant/assistant.service';

function buildAssistantMock() {
  return {
    handleIncoming: jest.fn().mockResolvedValue(undefined),
    handleCrisis: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AssistantService>;
}

function buildConfigMock(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function buildResMock(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('WebhooksController', () => {
  describe('verify (GET)', () => {
    it('doğru hub.verify_token ile challenge döner', () => {
      const config = buildConfigMock({ META_VERIFY_TOKEN: 'secret-token' });
      const service = {} as WebhooksService;
      const controller = new WebhooksController(service, config, buildAssistantMock());
      const res = buildResMock();

      controller.verify(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'secret-token',
          'hub.challenge': 'challenge-123',
        },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('challenge-123');
    });

    it('yanlış token ile ForbiddenException fırlatır', () => {
      const config = buildConfigMock({ META_VERIFY_TOKEN: 'secret-token' });
      const service = {} as WebhooksService;
      const controller = new WebhooksController(service, config, buildAssistantMock());
      const res = buildResMock();

      expect(() =>
        controller.verify(
          {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'wrong-token',
            'hub.challenge': 'challenge-123',
          },
          res,
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('receive (POST)', () => {
    const secret = 'test-secret';

    function buildReqMock(body: unknown, rawBody: string, signature?: string) {
      const buffer = Buffer.from(rawBody, 'utf8');
      return {
        rawBody: buffer,
        body,
        headers: signature ? { 'x-hub-signature-256': signature } : {},
      } as unknown as RawBodyRequest<Request>;
    }

    it('geçersiz imzada ForbiddenException fırlatır, service çağrılmaz', async () => {
      const config = buildConfigMock({ META_APP_SECRET: secret });
      const service = {
        extractMessages: jest.fn(),
        processIncomingMessage: jest.fn(),
      } as unknown as jest.Mocked<WebhooksService>;
      const controller = new WebhooksController(service, config, buildAssistantMock());
      const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
      const req = buildReqMock(
        JSON.parse(rawBody),
        rawBody,
        'sha256=invalid',
      );

      await expect(controller.receive(req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(service.extractMessages).not.toHaveBeenCalled();
      expect(service.processIncomingMessage).not.toHaveBeenCalled();
    });

    const normalizedMessage = {
      channel: 'WHATSAPP',
      externalContactId: '905550001122',
      metaMessageId: 'wamid.ABC',
      content: 'Merhaba',
      timestamp: new Date(),
    };

    function buildValidRequest(rawBody: string) {
      const validSignature = 'sha256=' + crypto.hmacSha256Hex(secret, rawBody);
      return buildReqMock(JSON.parse(rawBody), rawBody, validSignature);
    }

    it('geçerli imza ve body ile service doğru mesajlarla çağrılır', async () => {
      const config = buildConfigMock({ META_APP_SECRET: secret });
      const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
      const service = {
        extractMessages: jest.fn().mockReturnValue([normalizedMessage]),
        processIncomingMessage: jest.fn().mockResolvedValue({
          conversationId: 'conv-1',
          isNew: true,
          crisis: false,
        }),
      } as unknown as jest.Mocked<WebhooksService>;
      const assistant = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      const result = await controller.receive(buildValidRequest(rawBody));

      expect(service.extractMessages).toHaveBeenCalledWith(JSON.parse(rawBody));
      expect(service.processIncomingMessage).toHaveBeenCalledWith(normalizedMessage);
      expect(assistant.handleIncoming).toHaveBeenCalledWith('conv-1', 'Merhaba');
      expect(assistant.handleCrisis).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('duplicate mesajda assistant çağrılmaz', async () => {
      const config = buildConfigMock({ META_APP_SECRET: secret });
      const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
      const service = {
        extractMessages: jest.fn().mockReturnValue([normalizedMessage]),
        processIncomingMessage: jest.fn().mockResolvedValue({
          conversationId: 'conv-1',
          isNew: false,
          crisis: false,
        }),
      } as unknown as jest.Mocked<WebhooksService>;
      const assistant = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      await controller.receive(buildValidRequest(rawBody));

      expect(assistant.handleIncoming).not.toHaveBeenCalled();
      expect(assistant.handleCrisis).not.toHaveBeenCalled();
    });

    it('kriz işaretli yeni mesajda handleCrisis çağrılır', async () => {
      const config = buildConfigMock({ META_APP_SECRET: secret });
      const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
      const service = {
        extractMessages: jest.fn().mockReturnValue([normalizedMessage]),
        processIncomingMessage: jest.fn().mockResolvedValue({
          conversationId: 'conv-1',
          isNew: true,
          crisis: true,
        }),
      } as unknown as jest.Mocked<WebhooksService>;
      const assistant = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      await controller.receive(buildValidRequest(rawBody));

      expect(assistant.handleCrisis).toHaveBeenCalledWith('conv-1');
      expect(assistant.handleIncoming).not.toHaveBeenCalled();
    });
  });
});
