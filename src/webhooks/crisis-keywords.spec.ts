import { containsCrisisLanguage } from './crisis-keywords';

describe('containsCrisisLanguage', () => {
  it.each([
    // canıma kıy-
    ['canıma kıymak istiyorum', 'canima kiymak istiyorum'],
    // öz kıyım (boşluklu ve boşluksuz)
    ['öz kıyım aklıma geliyor', 'oz kiyim aklima geliyor'],
    ['özkıyım düşünceleri var', 'ozkiyim dusunceleri var'],
    // kendimi as-
    ['kendimi asmak istiyorum', 'kendimi asmak istiyorum'],
    ['kendimi asıyorum bu gece', 'kendimi asiyorum bu gece'],
    // bilek(lerimi) kes-
    ['bileklerimi kesmek istiyorum', 'bileklerimi kesmek istiyorum'],
    ['bileğimi kestim', 'bilegimi kestim'],
    // keşke ölsem / keşke hiç doğmasaydım
    ['keşke ölsem daha iyi olur', 'keske olsem daha iyi olur'],
    ['keşke hiç doğmasaydım', 'keske hic dogmasaydim'],
    // yaşamanın / yaşamamın anlamı yok
    ['yaşamanın anlamı yok', 'yasamanin anlami yok'],
    ['yaşamamın anlamı yok artık', 'yasamamin anlami yok artik'],
    // her şeyi bitirmek
    ['her şeyi bitirmek istiyorum', 'her seyi bitirmek istiyorum'],
    // hap / ilaç içip ölmek
    ['hap içip ölmek istiyorum', 'hap icip olmek istiyorum'],
    ['ilaç içip ölmeyi düşünüyorum', 'ilac icip olmeyi dusunuyorum'],
    // intihar (fiil ve niyet ekleriyle)
    ['intihar etmek istiyorum', 'intihar etmek istiyorum'],
    ['intiharı düşünüyorum', 'intihari dusunuyorum'],
    ['intihar planım var', 'intihar planim var'],
    ['intihara karar verdim', 'intihara karar verdim'],
    // kendine zarar
    ['kendime zarar vermek istiyorum', 'kendime zarar vermek istiyorum'],
    // ölmek istiyorum
    ['ölmek istiyorum', 'olmek istiyorum'],
    // başkasına zarar
    ['onu öldüreceğim', 'onu oldurecegim'],
    ['seni öldüreceğim', 'seni oldurecegim'],
    ['öldürmek istiyorum', 'oldurmek istiyorum'],
    // şiddet
    ['babam beni dövüyor', 'babam beni dovuyor'],
    ['bana şiddet uyguluyor', 'bana siddet uyguluyor'],
    ['şiddet görüyorum evde', 'siddet goruyorum evde'],
    // taciz / istismar (çocuk için de)
    ['taciz ediliyorum', 'taciz ediliyorum'],
    ['çocuğum istismar ediliyor', 'cocugum istismar ediliyor'],
    ['tacize uğruyorum', 'tacize ugruyorum'],
  ])('yakalanmalı: "%s" / "%s"', (withTurkish, ascii) => {
    expect(containsCrisisLanguage(withTurkish)).toBe(true);
    expect(containsCrisisLanguage(ascii)).toBe(true);
  });

  it.each([
    'intihar konulu bir film izledim',
    'ölmek üzereyim yorgunluktan',
    'bu fiyatlar beni öldürür',
  ])('yakalanmamalı (yanlış alarm değil): "%s"', (text) => {
    expect(containsCrisisLanguage(text)).toBe(false);
  });
});
