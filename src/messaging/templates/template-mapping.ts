import { TemplateCategory, TemplateStatus } from '@prisma/client';

// Meta'nın metin değerlerini yerel enum'lara çevirir.
const META_STATUS: ReadonlyMap<string, TemplateStatus> = new Map<
  string,
  TemplateStatus
>([
  ['APPROVED', TemplateStatus.APPROVED],
  ['PENDING', TemplateStatus.PENDING],
  ['IN_APPEAL', TemplateStatus.PENDING],
  ['REJECTED', TemplateStatus.REJECTED],
  ['PAUSED', TemplateStatus.PAUSED],
  ['DISABLED', TemplateStatus.DISABLED],
  ['PENDING_DELETION', TemplateStatus.DISABLED],
  ['DELETED', TemplateStatus.DISABLED],
]);

// Webhook olay adları (message_template_status_update.event).
const TEMPLATE_EVENT_STATUS: ReadonlyMap<string, TemplateStatus> = new Map<
  string,
  TemplateStatus
>([
  ['APPROVED', TemplateStatus.APPROVED],
  ['REINSTATED', TemplateStatus.APPROVED],
  ['REJECTED', TemplateStatus.REJECTED],
  ['PAUSED', TemplateStatus.PAUSED],
  ['DISABLED', TemplateStatus.DISABLED],
]);

const META_CATEGORY: ReadonlyMap<string, TemplateCategory> = new Map<
  string,
  TemplateCategory
>([
  ['UTILITY', TemplateCategory.UTILITY],
  ['MARKETING', TemplateCategory.MARKETING],
  ['AUTHENTICATION', TemplateCategory.AUTHENTICATION],
]);

// Bilinmeyen Meta durumu bekleyen kabul edilir.
export function mapMetaStatus(status: string): TemplateStatus {
  return META_STATUS.get(status) ?? TemplateStatus.PENDING;
}

// Bilinmeyen kategori en kısıtlayıcı olan MARKETING sayılır.
export function mapMetaCategory(category: string): TemplateCategory {
  return META_CATEGORY.get(category) ?? TemplateCategory.MARKETING;
}

// Webhook olayı tanınmıyorsa null döner ve durum değişmez.
export function mapTemplateEvent(event?: string): TemplateStatus | null {
  if (!event) {
    return null;
  }
  return TEMPLATE_EVENT_STATUS.get(event) ?? null;
}

// Meta'nın "NONE" ve boş ret sebeplerini null yapar.
export function reasonOrNull(reason?: string | null): string | null {
  if (!reason || reason === 'NONE') {
    return null;
  }
  return reason;
}

// Gövde (BODY) bileşenindeki metin. Yoksa boş döner.
export function bodyTextOf(
  components?: { type?: string; text?: string }[],
): string {
  const body = components?.find((c) => c.type === 'BODY');
  return typeof body?.text === 'string' ? body.text : '';
}

// Ad + dil çifti için tek anahtar.
export function templateKey(name: string, language: string): string {
  return `${language}:${name}`;
}
