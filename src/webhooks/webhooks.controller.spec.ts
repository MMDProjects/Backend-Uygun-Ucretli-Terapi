import {
  BadRequestException,
  ForbiddenException,
  RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import * as crypto from './crypto';
import { AssistantService } from '../assistant/assistant.service';

function buildAssistantMock() {
  const handleIncoming = jest.fn().mockResolvedValue(undefined);
  const handleCrisis = jest.fn().mockResolvedValue(undefined);
  const assistant = {
    handleIncoming,
    handleCrisis,
  } as unknown as AssistantService;
  return { assistant, handleIncoming, handleCrisis };
}

function buildServiceMock(processResult?: unknown, extracted: unknown[] = []) {
  const extractMessages = jest.fn().mockReturnValue(extracted);
  const processIncomingMessage = jest.fn().mockResolvedValue(processResult);
  const service = {
    extractMessages,
    processIncomingMessage,
  } as unknown as WebhooksService;
  return { service, extractMessages, processIncomingMessage };
}

function buildConfigMock(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function buildResMock() {
  const res = {} as Response;
  const status = jest.fn().mockReturnValue(res);
  const type = jest.fn().mockReturnValue(res);
  const send = jest.fn().mockReturnValue(res);
  Object.assign(res, { status, type, send });
  return { res, status, type, send };
}

describe('WebhooksController', () => {
  describe('verify (GET)', () => {
    const config = buildConfigMock({ META_VERIFY_TOKEN: 'secret-token' });

    function buildController() {
      return new WebhooksController(
        {} as WebhooksService,
        config,
        buildAssistantMock().assistant,
      );
    }

    it('doğru hub.verify_token ile challenge’ı düz metin olarak döner', () => {
      const { res, status, type, send } = buildResMock();

      buildController().verify(
        {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'secret-token',
          'hub.challenge': '1158201444',
        },
        res,
      );

      expect(status).toHaveBeenCalledWith(200);
      expect(type).toHaveBeenCalledWith('text/plain');
      expect(send).toHaveBeenCalledWith('1158201444');
    });

    it('yanlış token ile ForbiddenException fırlatır', () => {
      const { res } = buildResMock();

      expect(() =>
        buildController().verify(
          {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'wrong-token',
            'hub.challenge': '1158201444',
          },
          res,
        ),
      ).toThrow(ForbiddenException);
    });

    it('beklenmeyen karakter içeren challenge’ı yansıtmadan reddeder', () => {
      const { res, send } = buildResMock();

      expect(() =>
        buildController().verify(
          {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'secret-token',
            'hub.challenge': '<script>alert(1)</script>',
          },
          res,
        ),
      ).toThrow(BadRequestException);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('receive (POST)', () => {
    const secret = 'test-secret';
    const config = buildConfigMock({ META_APP_SECRET: secret });
    const rawBody = '{"object":"whatsapp_business_account","entry":[]}';

    function buildReqMock(body: unknown, raw: string, signature?: string) {
      return {
        rawBody: Buffer.from(raw, 'utf8'),
        body,
        headers: signature ? { 'x-hub-signature-256': signature } : {},
      } as unknown as RawBodyRequest<Request>;
    }

    function buildValidRequest() {
      const validSignature = 'sha256=' + crypto.hmacSha256Hex(secret, rawBody);
      return buildReqMock(JSON.parse(rawBody), rawBody, validSignature);
    }

    const normalizedMessage = {
      channel: 'WHATSAPP',
      externalContactId: '905550001122',
      metaMessageId: 'wamid.ABC',
      content: 'Merhaba',
      timestamp: new Date(),
    };

    it('geçersiz imzada ForbiddenException fırlatır, service çağrılmaz', async () => {
      const { service, extractMessages, processIncomingMessage } =
        buildServiceMock();
      const controller = new WebhooksController(
        service,
        config,
        buildAssistantMock().assistant,
      );
      const req = buildReqMock(JSON.parse(rawBody), rawBody, 'sha256=invalid');

      await expect(controller.receive(req)).rejects.toThrow(ForbiddenException);
      expect(extractMessages).not.toHaveBeenCalled();
      expect(processIncomingMessage).not.toHaveBeenCalled();
    });

    it('geçerli imza ve body ile service doğru mesajlarla çağrılır', async () => {
      const { service, extractMessages, processIncomingMessage } =
        buildServiceMock(
          { conversationId: 'conv-1', isNew: true, crisis: false },
          [normalizedMessage],
        );
      const { assistant, handleIncoming, handleCrisis } = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      const result = await controller.receive(buildValidRequest());

      expect(extractMessages).toHaveBeenCalledWith(JSON.parse(rawBody));
      expect(processIncomingMessage).toHaveBeenCalledWith(normalizedMessage);
      expect(handleIncoming).toHaveBeenCalledWith('conv-1', 'Merhaba');
      expect(handleCrisis).not.toHaveBeenCalled();
      expect(result).toEqual({ received: true });
    });

    it('duplicate mesajda assistant çağrılmaz', async () => {
      const { service } = buildServiceMock(
        { conversationId: 'conv-1', isNew: false, crisis: false },
        [normalizedMessage],
      );
      const { assistant, handleIncoming, handleCrisis } = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      await controller.receive(buildValidRequest());

      expect(handleIncoming).not.toHaveBeenCalled();
      expect(handleCrisis).not.toHaveBeenCalled();
    });

    it('kriz işaretli yeni mesajda handleCrisis çağrılır', async () => {
      const { service } = buildServiceMock(
        { conversationId: 'conv-1', isNew: true, crisis: true },
        [normalizedMessage],
      );
      const { assistant, handleIncoming, handleCrisis } = buildAssistantMock();
      const controller = new WebhooksController(service, config, assistant);

      await controller.receive(buildValidRequest());

      expect(handleCrisis).toHaveBeenCalledWith('conv-1');
      expect(handleIncoming).not.toHaveBeenCalled();
    });
  });
});
