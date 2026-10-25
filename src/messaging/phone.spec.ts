import { normalizeWhatsAppPhone } from './phone';

describe('normalizeWhatsAppPhone', () => {
  it('uluslararası biçimi rakamlara indirir', () => {
    expect(normalizeWhatsAppPhone('+90 555 123 45 67')).toBe('905551234567');
    expect(normalizeWhatsAppPhone('905551234567')).toBe('905551234567');
  });

  it('00 ile başlayan uluslararası biçimi temizler', () => {
    expect(normalizeWhatsAppPhone('00905551234567')).toBe('905551234567');
  });

  it('yerel 05... biçimini 90 ile öne alır', () => {
    expect(normalizeWhatsAppPhone('0555 123 45 67')).toBe('905551234567');
    expect(normalizeWhatsAppPhone('0(555) 123-45-67')).toBe('905551234567');
  });

  it('başında 0 olmayan 10 haneli yerel numarayı 90 ile öne alır', () => {
    expect(normalizeWhatsAppPhone('5551234567')).toBe('905551234567');
  });

  it('boş, null ya da çok kısa değeri null döner', () => {
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone(undefined)).toBeNull();
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
  });

  it('15 hanenin üzerini null döner', () => {
    expect(normalizeWhatsAppPhone('1'.repeat(16))).toBeNull();
  });
});
