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

function buildService(env: Record<string, string> = fullEnv) {
  return new MetaSenderService(buildConfig(env) as unknown as ConfigService);
}

describe('MetaSenderService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it('WhatsApp için doğru URL, header ve body ile gönderir ve kimliği döndürür', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"messages":[{"id":"wamid.1"}]}', { status: 200 }),
    );

    const result = await buildService().sendText(
      'WHATSAPP',
      '905550001122',
      'Merhaba',
    );

    expect(result).toEqual({ ok: true, messageId: 'wamid.1' });
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

  it('Instagram için doğru URL ve body ile gönderir ve message_id döndürür', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"recipient_id":"9","message_id":"mid.7"}', {
        status: 200,
      }),
    );

    const result = await buildService().sendText(
      'INSTAGRAM',
      'igsid-9',
      'Selam',
    );

    expect(result).toEqual({ ok: true, messageId: 'mid.7' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.instagram.com/v21.0/222/messages');
    expect(init.headers.Authorization).toBe('Bearer ig-token');
    expect(JSON.parse(init.body)).toEqual({
      recipient: { id: 'igsid-9' },
      message: { text: 'Selam' },
    });
  });

  it('token eksikse fetch çağırmadan ok:false döner', async () => {
    const service = buildService({ ...fullEnv, WHATSAPP_ACCESS_TOKEN: '' });

    const result = await service.sendText(
      'WHATSAPP',
      '905550001122',
      'Merhaba',
    );

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('4xx hatasında ok:false döner ve yeniden denemez', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"bad"}', { status: 400 }),
    );

    const result = await buildService().sendText(
      'INSTAGRAM',
      'igsid-9',
      'Selam',
    );

    expect(result).toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('5xx hatasında bir kez yeniden dener ve başarıda ok:true döner', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response('{"message_id":"mid.8"}', { status: 200 }),
      );

    const pending = buildService().sendText('INSTAGRAM', 'igsid-9', 'Selam');
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ ok: true, messageId: 'mid.8' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ağ hatasında bir kez yeniden dener; ikincisi de başarısızsa ok:false döner', async () => {
    jest.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const pending = buildService().sendText('INSTAGRAM', 'igsid-9', 'Selam');
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('istekte META_TIMEOUT_MS ile zaman aşımı sinyali kullanır', async () => {
    const service = buildService({ ...fullEnv, META_TIMEOUT_MS: '5000' });

    await service.sendText('INSTAGRAM', 'igsid-9', 'Selam');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
