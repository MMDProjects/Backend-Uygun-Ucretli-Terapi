import { BadRequestException } from '@nestjs/common';
import {
  ContactType,
  Prisma,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { normalizeWhatsAppPhone } from '../phone';

// Kampanya kuralları. Veritabanı ve Meta'ya bağlı olmayan saf fonksiyonlar.

export const CAMPAIGN_MAX_ATTEMPTS = 2;
export const STATIC_VALUE_MAX = 200;

export type ParamSource = 'firstName' | 'fullName' | 'static';

export interface ParamMappingItem {
  source: ParamSource;
  value?: string;
}

// Uygunluk kontrolünün sebepleri (hazırlama sırasında yazılır).
export type EligibilitySkipReason =
  | 'no_phone'
  | 'not_client'
  | 'opt_out'
  | 'invalid_phone';

// Gönderim öncesi ve iptal sebepleri de bu tipte.
export type SkipReason = EligibilitySkipReason | 'cancelled';

export interface EligibilityInput {
  phone: string | null;
  contactType: ContactType;
  marketingOptOut: boolean;
  reminderOptOut: boolean;
}

export type Eligibility =
  | { eligible: true; phone: string }
  | { eligible: false; reason: EligibilitySkipReason };

// Sırası önemlidir: ilk tutan sebep yazılır.
export function evaluateEligibility(input: EligibilityInput): Eligibility {
  const raw = input.phone?.trim() ?? '';
  if (raw.length === 0) return { eligible: false, reason: 'no_phone' };
  if (input.contactType !== ContactType.DANISAN) {
    return { eligible: false, reason: 'not_client' };
  }
  if (isOptedOut(input)) return { eligible: false, reason: 'opt_out' };
  const phone = normalizeWhatsAppPhone(raw);
  if (!phone) return { eligible: false, reason: 'invalid_phone' };
  return { eligible: true, phone };
}

// "DUR" ya da personel kaydı: iki bayraktan biri yeterlidir.
export function isOptedOut(input: {
  marketingOptOut: boolean;
  reminderOptOut: boolean;
}): boolean {
  return input.marketingOptOut || input.reminderOptOut;
}

export function isTemplateUsable(template: {
  status: TemplateStatus;
  category: TemplateCategory;
}): boolean {
  return (
    template.status === TemplateStatus.APPROVED &&
    template.category !== TemplateCategory.AUTHENTICATION
  );
}

// Değişken sayısı kadar eşleme ister; sabit değer boş olamaz.
export function validateParamMapping(
  mapping: ParamMappingItem[],
  variableCount: number,
): void {
  if (mapping.length !== variableCount) {
    throw new BadRequestException(
      `Şablonun ${variableCount} değişkeni var; ${mapping.length} eşleme verildi.`,
    );
  }
  for (const item of mapping) {
    if (item.source !== 'static') continue;
    const value = item.value?.trim() ?? '';
    if (value.length === 0) {
      throw new BadRequestException('Sabit değer alanı zorunlu.');
    }
    if (value.length > STATIC_VALUE_MAX) {
      throw new BadRequestException(
        `Sabit değer en fazla ${STATIC_VALUE_MAX} karakter olabilir.`,
      );
    }
  }
}

export function readParamMapping(value: Prisma.JsonValue): ParamMappingItem[] {
  return Array.isArray(value) ? (value as unknown as ParamMappingItem[]) : [];
}

// Şablon değişkenlerini kişi bilgisinden doldurur (sırayla {{1}}, {{2}}...).
export function buildTemplateParams(
  mapping: ParamMappingItem[],
  variableCount: number,
  contact: { fullName: string | null },
): string[] {
  const fullName = (contact.fullName ?? '').trim().replace(/\s+/g, ' ');
  const firstName = fullName.split(' ')[0] ?? '';
  return Array.from({ length: variableCount }, (_, index) => {
    const item = mapping[index];
    if (!item) return '';
    if (item.source === 'firstName') return firstName;
    if (item.source === 'fullName') return fullName;
    return item.value?.trim() ?? '';
  });
}

// Tahmini maliyet; birim fiyat girilmemişse hesaplanmaz.
export function estimateCost(
  sendCount: number,
  unitPrice: number | null,
): number | null {
  if (unitPrice === null) return null;
  return Math.round(sendCount * unitPrice * 100) / 100;
}

export function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 1000;
}
