import crypto from 'crypto';

/**
 * Meta'nın webhook POST isteklerine eklediği HMAC-SHA256 imzasını
 * doğrular (`x-hub-signature-256: sha256=<hex>`).
 *
 * Referans: ChatbotX (MIT, packages/utils/src/crypto.ts) — API secret
 * ile request body'nin imzasını kıyaslayan aynı fail-closed + timing-safe
 * yaklaşım, bu projenin Node.js `crypto` modülüne uyarlanmış hali.
 */

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Sabit zamanlı string karşılaştırma — timing attack'e karşı. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * `META_APP_SECRET` değerini parçalara ayırır: virgülle ayrılmış,
 * boşluklar kırpılmış, boş girdiler atılmış. Birden fazla Meta App'ten
 * (farklı secret'lar) webhook alan kurulumlar için.
 */
export function parseAppSecrets(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Ham request body'yi, Meta'nın gönderdiği `x-hub-signature-256` header'ı
 * ile doğrular. `secrets` boşsa (env değişkeni ayarlanmamışsa) **fail
 * closed** davranır — her istek reddedilir. Birden fazla secret
 * verilmişse, imza herhangi biriyle eşleşirse istek geçerli sayılır.
 */
export function verifyHmacSha256Signature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secrets: string[],
): boolean {
  if (secrets.length === 0) return false;
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  let matched = false;
  for (const secret of secrets) {
    const expected = 'sha256=' + hmacSha256Hex(secret, rawBody);
    if (timingSafeStringEqual(signatureHeader, expected)) matched = true;
  }
  return matched;
}
