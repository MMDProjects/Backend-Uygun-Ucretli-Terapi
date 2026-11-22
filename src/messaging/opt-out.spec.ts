import { isOptOutMessage, normalizeOptOutText } from './opt-out';

describe('opt-out', () => {
  describe('normalizeOptOutText', () => {
    it('büyük harf, Türkçe karakter ve noktalamayı normalize eder', () => {
      expect(normalizeOptOutText('  İPTAL HATIRLATMA! ')).toBe(
        'iptal hatirlatma',
      );
      expect(normalizeOptOutText('Mesaj İstemiyorum.')).toBe(
        'mesaj istemiyorum',
      );
    });
  });

  describe('isOptOutMessage', () => {
    it.each([
      'DUR',
      'dur',
      'Dur.',
      'stop',
      'STOP!',
      'İPTAL HATIRLATMA',
      'mesaj istemiyorum',
    ])('"%s" çıkış ifadesidir', (text) => {
      expect(isOptOutMessage(text)).toBe(true);
    });

    it.each(['dur bakalım', 'durum nasıl', 'merhaba', '', 'stop yapma'])(
      '"%s" tam eşleşme olmadığı için çıkış değildir',
      (text) => {
        expect(isOptOutMessage(text)).toBe(false);
      },
    );
  });
});
