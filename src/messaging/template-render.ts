// Şablon metni yardımcıları. Panel önizlemesi ve kaydedilen mesaj aynı
// fonksiyonla üretilir.

const VARIABLE_PATTERN = /\{\{(\d+)\}\}/g;
export const MAX_TEMPLATE_BODY_LENGTH = 1024;

// {{n}} değişkenlerini params[n-1] ile doldurur. Eksik değer boş yazılır.
export function renderTemplate(bodyText: string, params: string[]): string {
  return bodyText.replace(VARIABLE_PATTERN, (_match, n: string) => {
    return params[Number(n) - 1] ?? '';
  });
}

// Şablondaki en büyük değişken numarası (değişken yoksa 0).
export function countVariables(bodyText: string): number {
  let max = 0;
  for (const match of bodyText.matchAll(VARIABLE_PATTERN)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

// Meta kuralı: değişkenler {{1}}'den başlayıp sırayla numaralanır, atlama
// olmaz ve ilk geçişleri artan sırada olur. Ayrıca uzunluk sınırı kontrol edilir.
export function validateTemplateBody(bodyText: string): void {
  if (bodyText.length > MAX_TEMPLATE_BODY_LENGTH) {
    throw new Error(
      `Şablon metni en fazla ${MAX_TEMPLATE_BODY_LENGTH} karakter olabilir`,
    );
  }

  const seen: number[] = [];
  for (const match of bodyText.matchAll(VARIABLE_PATTERN)) {
    const n = Number(match[1]);
    if (!seen.includes(n)) {
      seen.push(n);
    }
  }

  const max = Math.max(0, ...seen);
  const expected = Array.from({ length: max }, (_, i) => i + 1);
  const isSequential =
    seen.length === max && expected.every((n, i) => seen[i] === n);
  if (!isSequential) {
    throw new Error(
      'Şablon değişkenleri {{1}} ile başlamalı, sırayla numaralanmalı ve atlanmamalı',
    );
  }
}
