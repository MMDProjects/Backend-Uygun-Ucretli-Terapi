import { ConfigService } from '@nestjs/config';
import { OpenAiClient, OpenAiUnavailableError } from './openai.client';

function buildConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string, def?: string) =>
      key in values && values[key] !== undefined ? values[key] : def,
    ),
  } as unknown as ConfigService;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAiClient', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('anahtar yoksa', () => {
    it('chat OpenAiUnavailableError fırlatır ve fetch çağrılmaz', async () => {
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: '' }));

      await expect(
        client.chat({ messages: [{ role: 'user', content: 'merhaba' }] }),
      ).rejects.toBeInstanceOf(OpenAiUnavailableError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('embed OpenAiUnavailableError fırlatır ve fetch çağrılmaz', async () => {
      const client = new OpenAiClient(buildConfig({}));

      await expect(client.embed(['metin'])).rejects.toBeInstanceOf(
        OpenAiUnavailableError,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('chat', () => {
    it('doğru URL, header ve gövde ile istek atar', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Selam', tool_calls: undefined } }],
        }),
      );
      const client = new OpenAiClient(
        buildConfig({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-test' }),
      );
      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'lead_tool',
            description: 'lead',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      await client.chat({
        messages: [{ role: 'user', content: 'merhaba' }],
        tools,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk-test',
      );
      expect(JSON.parse(init.body as string)).toEqual({
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'merhaba' }],
        tools,
      });
    });

    it('metin yanıtını ve tool call listesini döndürür', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'lead_tool',
                      arguments: '{"ad_soyad":"Ayşe"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      const result = await client.chat({
        messages: [{ role: 'user', content: 'randevu' }],
      });

      expect(result).toEqual({
        content: null,
        toolCalls: [
          { id: 'call_1', name: 'lead_tool', arguments: '{"ad_soyad":"Ayşe"}' },
        ],
      });
    });

    it('tools verilmezse gövdeye tools eklemez', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 'Tamam' } }] }),
      );
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      const result = await client.chat({
        messages: [{ role: 'user', content: 'x' }],
      });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).not.toHaveProperty('tools');
      expect(result).toEqual({ content: 'Tamam', toolCalls: [] });
    });

    it('HTTP hatasında Error fırlatır', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('{"error":"rate"}', { status: 429 }),
      );
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      await expect(
        client.chat({ messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow('HTTP 429');
    });
  });

  describe('embed', () => {
    it('doğru URL ve gövde ile istek atar', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }] }),
      );
      const client = new OpenAiClient(
        buildConfig({
          OPENAI_API_KEY: 'sk-test',
          OPENAI_EMBEDDING_MODEL: 'emb-test',
        }),
      );

      await client.embed(['metin']);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/embeddings');
      expect(JSON.parse(init.body as string)).toEqual({
        model: 'emb-test',
        input: ['metin'],
      });
    });

    it('vektörleri index sırasına göre döndürür', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      );
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      const vectors = await client.embed(['a', 'b']);

      expect(vectors).toEqual([
        [1, 0],
        [0, 1],
      ]);
    });

    it('boş girdide fetch çağırmadan boş dizi döndürür', async () => {
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      await expect(client.embed([])).resolves.toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('HTTP hatasında Error fırlatır', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 500 }));
      const client = new OpenAiClient(buildConfig({ OPENAI_API_KEY: 'sk-test' }));

      await expect(client.embed(['x'])).rejects.toThrow('HTTP 500');
    });
  });
});
