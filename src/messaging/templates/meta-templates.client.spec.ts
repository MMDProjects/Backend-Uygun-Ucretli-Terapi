import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TemplateCategory } from '@prisma/client';
import { MetaTemplatesClient } from './meta-templates.client';

function buildConfig(values: Record<string, string>) {
  return { get: jest.fn((key: string) => values[key]) };
}

const env = {
  META_GRAPH_VERSION: 'v21.0',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba1',
  WHATSAPP_ACCESS_TOKEN: 'secret-token',
};

function buildClient(values: Record<string, string> = env) {
  return new MetaTemplatesClient(
    buildConfig(values) as unknown as ConfigService,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('MetaTemplatesClient', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('listAll sayfalamayı izler ve tüm şablonları döndürür', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: '1',
              name: 'a',
              language: 'tr',
              status: 'APPROVED',
              category: 'UTILITY',
            },
          ],
          paging: {
            next: 'https://graph.facebook.com/v21.0/waba1/message_templates?after=x',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: '2',
              name: 'b',
              language: 'tr',
              status: 'PENDING',
              category: 'MARKETING',
            },
          ],
        }),
      );

    const list = await buildClient().listAll();

    expect(list.map((t) => t.id)).toEqual(['1', '2']);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(firstUrl).toContain(
      'https://graph.facebook.com/v21.0/waba1/message_templates?fields=',
    );
    expect(firstUrl).toContain('rejected_reason');
    expect(firstInit.method).toBe('GET');
    expect(firstInit.headers).toEqual({
      Authorization: 'Bearer secret-token',
      'Content-Type': 'application/json',
    });
    expect(fetchMock.mock.calls[1][0]).toContain('after=x');
  });

  it('sayfalama bağlantısı Graph dışında bir adresse reddeder', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [],
        paging: { next: 'https://evil.example.com/steal' },
      }),
    );

    await expect(buildClient().listAll()).rejects.toThrow(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('create doğru URL ve gövde ile POST atar', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 'm1', status: 'PENDING' }),
    );

    const result = await buildClient().create({
      name: 'hatirlatma_1',
      language: 'tr',
      category: TemplateCategory.UTILITY,
      bodyText: 'Merhaba {{1}}, randevunuz {{2}}',
      examples: ['Ayşe', 'yarın'],
    });

    expect(result).toEqual({ id: 'm1', status: 'PENDING' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://graph.facebook.com/v21.0/waba1/message_templates',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      name: 'hatirlatma_1',
      language: 'tr',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Merhaba {{1}}, randevunuz {{2}}',
          example: { body_text: [['Ayşe', 'yarın']] },
        },
      ],
    });
  });

  it('create değişkensiz şablonda example alanını göndermez', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'm2' }));

    await buildClient().create({
      name: 'duz',
      language: 'tr',
      category: TemplateCategory.UTILITY,
      bodyText: 'Düz metin',
      examples: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.components).toEqual([{ type: 'BODY', text: 'Düz metin' }]);
  });

  it('delete ad parametresini kodlayarak DELETE atar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await buildClient().delete('a b&c');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://graph.facebook.com/v21.0/waba1/message_templates?name=a%20b%26c',
    );
    expect(init.method).toBe('DELETE');
  });

  it('HTTP hatasında Meta mesajını taşıyan BadGateway fırlatır', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { message: 'Invalid parameter' } }, 400),
    );

    await expect(buildClient().delete('x')).rejects.toThrow(
      'HTTP 400: Invalid parameter',
    );
  });

  it('ağ hatasında BadGateway fırlatır', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(buildClient().listAll()).rejects.toThrow(BadGatewayException);
  });

  it('WABA kimliği yoksa 503 fırlatır ve istek atmaz', async () => {
    const client = buildClient({
      WHATSAPP_ACCESS_TOKEN: 'secret-token',
    });

    expect(() => client.assertConfigured()).toThrow(
      new ServiceUnavailableException('WABA kimliği tanımlı değil'),
    );
    await expect(client.listAll()).rejects.toThrow(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
