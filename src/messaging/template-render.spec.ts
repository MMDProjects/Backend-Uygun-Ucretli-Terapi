import {
  countVariables,
  MAX_TEMPLATE_BODY_LENGTH,
  renderTemplate,
  validateTemplateBody,
} from './template-render';

describe('renderTemplate', () => {
  it('{{n}} değişkenlerini params[n-1] ile doldurur', () => {
    expect(
      renderTemplate('Merhaba {{1}}, {{2}} saat {{3}}', [
        'Ayşe',
        '27 Ekim',
        '14:00',
      ]),
    ).toBe('Merhaba Ayşe, 27 Ekim saat 14:00');
  });

  it('eksik parametreyi boş yazar', () => {
    expect(renderTemplate('{{1}} - {{2}}', ['A'])).toBe('A - ');
  });

  it('aynı değişken tekrar ederse her geçişi doldurur', () => {
    expect(renderTemplate('{{1}} ve {{1}}', ['X'])).toBe('X ve X');
  });

  it('değişken içermeyen metni değiştirmeden döndürür', () => {
    expect(renderTemplate('Düz metin', ['kullanılmaz'])).toBe('Düz metin');
  });
});

describe('countVariables', () => {
  it('değişken yoksa 0 döner', () => {
    expect(countVariables('Metin')).toBe(0);
  });

  it('en büyük değişken numarasını döner', () => {
    expect(countVariables('{{1}} {{3}} {{1}}')).toBe(3);
  });
});

describe('validateTemplateBody', () => {
  it('sıralı ve atlamasız değişkenleri kabul eder', () => {
    expect(() => validateTemplateBody('{{1}} {{2}} {{3}}')).not.toThrow();
    expect(() => validateTemplateBody('Düz metin')).not.toThrow();
    expect(() => validateTemplateBody('{{1}} {{2}} {{1}}')).not.toThrow();
  });

  it('sıra dışı değişkenleri reddeder', () => {
    expect(() => validateTemplateBody('{{2}} {{1}}')).toThrow();
  });

  it('atlanan değişkeni reddeder', () => {
    expect(() => validateTemplateBody('{{1}} {{3}}')).toThrow();
    expect(() => validateTemplateBody('{{2}}')).toThrow();
  });

  it('uzunluk sınırını uygular', () => {
    const atLimit = 'a'.repeat(MAX_TEMPLATE_BODY_LENGTH);
    expect(() => validateTemplateBody(atLimit)).not.toThrow();
    expect(() => validateTemplateBody(atLimit + 'a')).toThrow();
  });
});
