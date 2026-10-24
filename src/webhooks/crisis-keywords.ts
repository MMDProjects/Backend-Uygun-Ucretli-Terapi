/**
 * LLM'den bağımsız, anahtar kelime/regex tabanlı kriz tespiti.
 * Burada eşleşme olursa bot susturulur (is_bot_active = false) ve
 * konuşma işaretlenir — modelin kriz ifadesini kaçırma ihtimaline karşı
 * ikinci bir güvenlik ağı.
 *
 * Kasıtlı olarak eklenmedi: tek başına "ölmek" veya "bitmek" gibi aşırı
 * genel kelimeler — günlük Türkçe'de çok sık geçiyor ("yorgunluktan
 * öldüm", "bu iş bitti") ve aşırı-tetiklenmeye yol açar. Her kalıp en az
 * bir bağlam/niyet ifadesiyle birlikte arandı.
 *
 * Kalıplar ASCII yazılır ve metin önce normalizeForCrisis ile ASCII'ye
 * indirgenir: danışanlar sık sık Türkçe karakter kullanmadan yazar
 * ("yasamak istemiyorum") ve JS regex'teki \b Türkçe harfleri kelime
 * karakteri saymadığı için "ö"/"ç" ile başlayan kalıplar hiç eşleşmez.
 */
const TURKISH_TO_ASCII: Record<string, string> = {
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ü: 'u',
  ö: 'o',
  ç: 'c',
};

export function normalizeForCrisis(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[ışğüöç]/g, (ch) => TURKISH_TO_ASCII[ch])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export const CRISIS_KEYWORDS: RegExp[] = [
  /\bkendimi\s+oldur/,
  /\bintihar/,
  /\bozkiyim/,
  /\bkendime\s+zarar/,
  /\byasamak\s+istemiyorum/,
  /\bolmek\s+istiyorum/,
  /\bolsem\s+(daha\s+)?iyi/,
  /\bhayatima\s+son/,
  /\bbicakla\s+kendimi/,
  /\bilac\s+icip\s+ol/,
  /\bartik\s+dayanamiyorum.{0,20}(olmek|bitirmek|son)/,
  /\bkendimi\s+kesiyorum/,
  /\bkendimi\s+asacagim/,
  /\bveda\s+mektubu/,
  /\bbu\s+dunyadan\s+gitmek\s+istiyorum/,
];

export function containsCrisisLanguage(text: string): boolean {
  const normalized = normalizeForCrisis(text);
  return CRISIS_KEYWORDS.some((pattern) => pattern.test(normalized));
}
