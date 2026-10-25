// Telefonu WhatsApp (Meta) için E.164 biçimine çevirir: yalnız rakamlar,
// ülke kodu ile (ör. 905551234567). Yerel biçimler (05..., 5...) Türkiye
// varsayılarak 90 ile öne alınır. Geçersizse null döner.

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
const TR_COUNTRY_CODE = '90';

export function normalizeWhatsAppPhone(
  raw: string | null | undefined,
): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = TR_COUNTRY_CODE + digits.slice(1);
  } else if (digits.length === 10) {
    digits = TR_COUNTRY_CODE + digits;
  }
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null;
  }
  return digits;
}
