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
 *
 * "intihar" tek başına aranmaz: "intihar konulu bir film" gibi cümleler
 * yanlış alarm olmasın diye yalnızca niyet/fiil ekleriyle eşleşir.
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
  // Kendine zarar
  /\bkendimi\s+oldur/,
  /\bintihar(?:a|i|ini)?\s+(?:et|dus|plan|niyet|karar|meyil|yonel)/,
  /\boz\s*kiyim/,
  /\bkendime\s+zarar/,
  /\byasamak\s+istemiyorum/,
  /\bolmek\s+istiyorum/,
  /\bolsem\s+(daha\s+)?iyi/,
  /\bhayatima\s+son/,
  /\bbicakla\s+kendimi/,
  /\b(?:hap|ilac)\s+icip\s+ol/,
  /\bartik\s+dayanamiyorum.{0,20}(olmek|bitirmek|son)/,
  /\bkendimi\s+kesiyorum/,
  /\bkendimi\s+asacagim/,
  /\bkendimi\s+as(?:ay|ac|mak|iyorum)/,
  /\bcan(?:ima|imi)\s+kiy/,
  /\bbile[kg][a-z]{0,8}\s+kes/,
  /\bkeske\s+(?:ben\s+)?(?:olsem|olseydim|(?:hic\s+)?dogmasaydim)/,
  /\byasam(?:anin|amin)\s+anlami\s+yok/,
  /\bher\s+seyi\s+bitirmek/,
  /\bveda\s+mektubu/,
  /\bbu\s+dunyadan\s+gitmek\s+istiyorum/,
  // Başkasına zarar
  /\b(?:onu|seni|sizi)\s+oldurecegim/,
  /\boldurmek\s+istiyorum/,
  // Şiddet ve istismar
  /\bbeni\s+dov(?:uyor|du)/,
  /\bsiddet\s+(?:uygul|goruyor|gor)/,
  /\b(?:taciz|istismar)\s+(?:edil|ediyor|etti|maruz)/,
  /\b(?:tacize|istismara)\s+ugr/,
];

export function containsCrisisLanguage(text: string): boolean {
  const normalized = normalizeForCrisis(text);
  return CRISIS_KEYWORDS.some((pattern) => pattern.test(normalized));
}
