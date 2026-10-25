import { Logger } from '@nestjs/common';
import { OpenAiClient, OpenAiMessage } from './openai.client';

const REWRITE_HISTORY_SIZE = 6;
const REWRITE_MAX_TOKENS = 60;
const REWRITE_TIMEOUT_MS = 10000;
const REWRITE_INSTRUCTION =
  'Aşağıdaki konuşmanın son kullanıcı mesajını, bilgi bankasında arama için tek ve bağımsız bir Türkçe soruya çevir. Yalnızca soruyu yaz.';

const logger = new Logger('QueryRewriter');

export interface RewriteOptions {
  enabled?: boolean;
  model?: string;
}

// Önceki turlardaki bağlamı kullanarak aramayı tek bir bağımsız soruya çevirir.
// Hata, boş cevap ya da bağlam yokluğunda birleşik metin olduğu gibi döner.
export async function rewriteQuery(
  openai: OpenAiClient,
  history: OpenAiMessage[],
  latestCombined: string,
  options: RewriteOptions = {},
): Promise<string> {
  if (options.enabled === false) {
    return latestCombined;
  }
  // Bu turdan önce bot ya da personel cevabı yoksa bağlam yoktur.
  if (!history.some((message) => message.role === 'assistant')) {
    return latestCombined;
  }

  const recent = history.slice(-REWRITE_HISTORY_SIZE);
  try {
    const result = await openai.chat({
      model: options.model,
      messages: [{ role: 'system', content: REWRITE_INSTRUCTION }, ...recent],
      maxTokens: REWRITE_MAX_TOKENS,
      temperature: 0,
      timeoutMs: REWRITE_TIMEOUT_MS,
    });
    const rewritten = result.content?.trim();
    return rewritten ? rewritten : latestCombined;
  } catch (err) {
    logger.warn(
      `Sorgu yeniden yazılamadı, birleşik metin kullanılıyor: ${(err as Error).message}`,
    );
    return latestCombined;
  }
}
