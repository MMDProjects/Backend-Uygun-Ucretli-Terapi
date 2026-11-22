// Danışanın otomatik mesajları durdurma ifadeleri (DUR ve benzerleri).
const OPT_OUT_PHRASES = new Set([
  'dur',
  'stop',
  'iptal hatirlatma',
  'mesaj istemiyorum',
]);

const TR_TO_ASCII: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

// Küçük harfe çevirir, Türkçe harfleri ASCII'ye indirir, noktalama ve
// fazla boşlukları temizler.
export function normalizeOptOutText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (ch) => TR_TO_ASCII[ch] ?? ch)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Yalnızca tam eşleşme sayılır: "dur" evet, "dur bakalım" hayır.
export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_PHRASES.has(normalizeOptOutText(text));
}
