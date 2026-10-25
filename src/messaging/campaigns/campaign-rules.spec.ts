import { BadRequestException } from '@nestjs/common';
import { ContactType, TemplateCategory, TemplateStatus } from '@prisma/client';
import {
  buildTemplateParams,
  estimateCost,
  evaluateEligibility,
  isTemplateUsable,
  ratio,
  validateParamMapping,
} from './campaign-rules';

const clean = {
  phone: '+90 555 123 45 67',
  contactType: ContactType.DANISAN,
  marketingOptOut: false,
  reminderOptOut: false,
};

describe('evaluateEligibility', () => {
  it('uygun kişiye rakamlardan oluşan telefon döner', () => {
    expect(evaluateEligibility(clean)).toEqual({
      eligible: true,
      phone: '905551234567',
    });
  });

  it('yerel biçimli telefonu E.164 (90...) olarak döner', () => {
    expect(evaluateEligibility({ ...clean, phone: '0555 123 45 67' })).toEqual({
      eligible: true,
      phone: '905551234567',
    });
  });

  it('telefonu olmayanı no_phone ile atlar', () => {
    expect(evaluateEligibility({ ...clean, phone: null })).toEqual({
      eligible: false,
      reason: 'no_phone',
    });
    expect(evaluateEligibility({ ...clean, phone: '   ' })).toEqual({
      eligible: false,
      reason: 'no_phone',
    });
  });

  it('danışan olmayanı not_client ile atlar', () => {
    expect(
      evaluateEligibility({ ...clean, contactType: ContactType.UZMAN }),
    ).toEqual({ eligible: false, reason: 'not_client' });
  });

  it('DUR diyen kişiyi opt_out ile atlar (iki bayraktan biri yeterli)', () => {
    expect(evaluateEligibility({ ...clean, marketingOptOut: true })).toEqual({
      eligible: false,
      reason: 'opt_out',
    });
    expect(evaluateEligibility({ ...clean, reminderOptOut: true })).toEqual({
      eligible: false,
      reason: 'opt_out',
    });
  });

  it('rakam sayısı 10..15 dışındaki telefonu invalid_phone ile atlar', () => {
    expect(evaluateEligibility({ ...clean, phone: '12345' })).toEqual({
      eligible: false,
      reason: 'invalid_phone',
    });
    expect(evaluateEligibility({ ...clean, phone: '1'.repeat(16) })).toEqual({
      eligible: false,
      reason: 'invalid_phone',
    });
  });

  it('sebep önceliği: telefon yok > danışan değil > DUR > geçersiz', () => {
    expect(
      evaluateEligibility({
        phone: null,
        contactType: ContactType.UZMAN,
        marketingOptOut: true,
        reminderOptOut: false,
      }).eligible,
    ).toBe(false);
    const reason = evaluateEligibility({
      phone: '12',
      contactType: ContactType.UZMAN,
      marketingOptOut: true,
      reminderOptOut: false,
    });
    expect(reason).toEqual({ eligible: false, reason: 'not_client' });
  });
});

describe('isTemplateUsable', () => {
  it('yalnızca onaylı ve kimlik doğrulama dışı şablon kullanılabilir', () => {
    expect(
      isTemplateUsable({
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.UTILITY,
      }),
    ).toBe(true);
    expect(
      isTemplateUsable({
        status: TemplateStatus.APPROVED,
        category: TemplateCategory.AUTHENTICATION,
      }),
    ).toBe(false);
    expect(
      isTemplateUsable({
        status: TemplateStatus.PENDING,
        category: TemplateCategory.MARKETING,
      }),
    ).toBe(false);
  });
});

describe('validateParamMapping', () => {
  it('değişken sayısı kadar eşleme ister', () => {
    expect(() => validateParamMapping([{ source: 'firstName' }], 2)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validateParamMapping(
        [{ source: 'firstName' }, { source: 'fullName' }],
        2,
      ),
    ).not.toThrow();
  });

  it('sabit değer boş olamaz ve 200 karakteri aşamaz', () => {
    expect(() =>
      validateParamMapping([{ source: 'static', value: '  ' }], 1),
    ).toThrow(BadRequestException);
    expect(() =>
      validateParamMapping([{ source: 'static', value: 'a'.repeat(201) }], 1),
    ).toThrow(BadRequestException);
    expect(() =>
      validateParamMapping([{ source: 'static', value: 'Merhaba' }], 1),
    ).not.toThrow();
  });
});

describe('buildTemplateParams', () => {
  it('ad, tam ad ve sabit değeri sırayla doldurur', () => {
    const params = buildTemplateParams(
      [
        { source: 'firstName' },
        { source: 'fullName' },
        { source: 'static', value: '14:00' },
      ],
      3,
      { fullName: '  Ayşe   Demir ' },
    );
    expect(params).toEqual(['Ayşe', 'Ayşe Demir', '14:00']);
  });

  it('eşleme eksikse boş değer yazar', () => {
    expect(buildTemplateParams([], 1, { fullName: 'Ali Veli' })).toEqual(['']);
  });
});

describe('maliyet ve oran', () => {
  it('tahmini maliyeti kuruşa yuvarlar; birim fiyat yoksa null', () => {
    expect(estimateCost(3, 12.345)).toBe(37.04);
    expect(estimateCost(3, null)).toBeNull();
  });

  it('paydası sıfırsa oranı 0 döner', () => {
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(1, 3)).toBe(0.333);
  });
});
