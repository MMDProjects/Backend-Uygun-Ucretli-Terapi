import { ConfigService } from '@nestjs/config';
import { MetaSenderService } from './meta-sender.service';

function buildConfig(values: Record<string, string>) {
  return { get: jest.fn((key: string) => values[key]) };
}

const fullEnv = {
  META_GRAPH_VERSION: 'v21.0',
  WHATSAPP_PHONE_NUMBER_ID: '111',
  WHATSAPP_ACCESS_TOKEN: 'wa-token',
  INSTAGRAM_ACCOUNT_ID: '222',
  INSTAGRAM_ACCESS_TOKEN: 'ig-token',
};

describe('MetaSenderService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('WhatsApp için doğru URL, header ve body ile gönderir', async () => {
    const service = new MetaSenderService(
      buildConfig(fullEnv) as unknown as ConfigService,
    );

    const ok = await service.sendText('WHATSAPP', '905550001122', 'Merhaba');

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/111/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer wa-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      to: '905550001122',
      type: 'text',
      text: { body: 'Merhaba' },
    });
  });

  it('Instagram için doğru URL ve body ile gönderir', async () => {
    const service = new MetaSenderService(
      buildConfig(fullEnv) as unknown as ConfigService,
    );

    const ok = await service.sendText('INSTAGRAM', 'igsid-9', 'Selam');

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.instagram.com/v21.0/222/messages');
    expect(init.headers.Authorization).toBe('Bearer ig-token');
    expect(JSON.parse(init.body)).toEqual({
      recipient: { id: 'igsid-9' },
      message: { text: 'Selam' },
    });
  });

  it('token eksikse fetch çağırmadan false döner', async () => {
    const env = { ...fullEnv, WHATSAPP_ACCESS_TOKEN: '' };
    const service = new MetaSenderService(
      buildConfig(env) as unknown as ConfigService,
    );

    const ok = await service.sendText('WHATSAPP', '905550001122', 'Merhaba');

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HTTP hata kodunda false döner', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"bad"}', { status: 400 }),
    );
    const service = new MetaSenderService(
      buildConfig(fullEnv) as unknown as ConfigService,
    );

    const ok = await service.sendText('INSTAGRAM', 'igsid-9', 'Selam');

    expect(ok).toBe(false);
  });
});
