import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_CHAT_TIMEOUT_MS = 30000;
const EMBED_TIMEOUT_MS = 15000;
// Yeniden deneme beklemeleri; uzunluk en fazla deneme sayısını belirler.
const RETRY_DELAYS_MS = [1000, 3000];

export class OpenAiUnavailableError extends Error {
  constructor(message = 'OPENAI_API_KEY tanımlı değil') {
    super(message);
    this.name = 'OpenAiUnavailableError';
  }
}

export interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface OpenAiToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ChatToolCall[];
}

interface ChatCompletionResponse {
  choices: {
    message?: {
      content: string | null;
      tool_calls?: {
        id: string;
        function: { name: string; arguments: string };
      }[];
    };
  }[];
}

interface EmbeddingsResponse {
  data: { index: number; embedding: number[] }[];
}

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  constructor(private readonly config: ConfigService) {}

  async chat(input: {
    messages: OpenAiMessage[];
    tools?: OpenAiToolSchema[];
  }): Promise<ChatResult> {
    const apiKey = this.requireApiKey();
    const body: Record<string, unknown> = {
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
      messages: input.messages,
    };
    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools;
    }

    const res = await this.post(
      CHAT_URL,
      apiKey,
      body,
      this.chatTimeoutMs(),
      'OpenAI chat',
    );
    if (!res.ok) {
      throw new Error(`OpenAI chat isteği başarısız: HTTP ${res.status}`);
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const message = json.choices[0]?.message;
    if (!message) {
      throw new Error('OpenAI chat yanıtında mesaj yok');
    }

    return {
      content: message.content ?? null,
      toolCalls: (message.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = this.requireApiKey();
    if (texts.length === 0) {
      return [];
    }

    const res = await this.post(
      EMBEDDINGS_URL,
      apiKey,
      {
        model: this.config.get<string>(
          'OPENAI_EMBEDDING_MODEL',
          'text-embedding-3-small',
        ),
        input: texts,
      },
      EMBED_TIMEOUT_MS,
      'OpenAI embedding',
    );
    if (!res.ok) {
      throw new Error(`OpenAI embedding isteği başarısız: HTTP ${res.status}`);
    }

    const json = (await res.json()) as EmbeddingsResponse;
    return [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  // 429, 5xx, ağ hatası ve timeout yeniden denenir; diğer 4xx denenmez.
  private async post(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    label: string,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < RETRY_DELAYS_MS.length;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const retryable = res.status === 429 || res.status >= 500;
        if (res.ok || !retryable || !canRetry) {
          return res;
        }
        this.logger.warn(`${label} HTTP ${res.status}, yeniden deneniyor`);
      } catch (err) {
        if (!canRetry) {
          throw err;
        }
        this.logger.warn(`${label} ağ hatası, yeniden deneniyor`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_DELAYS_MS[attempt]),
      );
    }
  }

  private chatTimeoutMs(): number {
    const value = Number(
      this.config.get<string>(
        'OPENAI_TIMEOUT_MS',
        String(DEFAULT_CHAT_TIMEOUT_MS),
      ),
    );
    return value > 0 ? value : DEFAULT_CHAT_TIMEOUT_MS;
  }

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY tanımlı değil; OpenAI çağrısı atlandı');
      throw new OpenAiUnavailableError();
    }
    return apiKey;
  }
}
