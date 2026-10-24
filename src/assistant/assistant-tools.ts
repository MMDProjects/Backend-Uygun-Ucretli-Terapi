import { ServiceType } from '@prisma/client';

export const LEAD_HIZMET_VALUES = [
  'bireysel',
  'cift',
  'aile',
  'cocuk_ergen',
  'emdr',
  'ucretsiz_on_gorusme',
] as const;
export type LeadHizmet = (typeof LEAD_HIZMET_VALUES)[number];

export const PERSONEL_SEBEP_VALUES = [
  'randevu_degisiklik',
  'paket_sorusu',
  'sikayet',
  'yetkili_talebi',
  'konum_idari',
  'bilinmeyen_konu',
  'acil_durum',
] as const;
export type PersonelSebep = (typeof PERSONEL_SEBEP_VALUES)[number];

export interface AssistantTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const HIZMET_TO_SERVICE_TYPE: Record<LeadHizmet, ServiceType> = {
  bireysel: ServiceType.BIREYSEL,
  cift: ServiceType.CIFT,
  aile: ServiceType.AILE,
  cocuk_ergen: ServiceType.COCUK_ERGEN,
  emdr: ServiceType.EMDR,
  ucretsiz_on_gorusme: ServiceType.ON_GORUSME,
};

export function mapServiceType(hizmet: LeadHizmet): ServiceType {
  const serviceType = HIZMET_TO_SERVICE_TYPE[hizmet];
  if (!serviceType) {
    throw new Error(`Bilinmeyen hizmet: ${hizmet}`);
  }
  return serviceType;
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    type: 'function',
    function: {
      name: 'lead_tool',
      description:
        'Danışanın aranma talebini kaydeder. Gerekli bilgiler (ad soyad, yaş, kanal bilgisi, 10:00-18:00 arası arama saati) tamamlandığında çağır.',
      parameters: {
        type: 'object',
        properties: {
          hizmet: {
            type: 'string',
            enum: [...LEAD_HIZMET_VALUES],
            description: 'Talep edilen hizmet',
          },
          ad_soyad: {
            type: 'string',
            description: 'Danışanın adı ve soyadı',
          },
          yas: {
            type: 'integer',
            description: 'Danışanın yaşı (biliniyorsa)',
          },
          telefon: {
            type: 'string',
            description: 'Telefon numarası (yalnızca Instagram kanalında alınır)',
          },
          arama_saati: {
            type: 'string',
            description: 'Danışanın aranmak istediği saat (10:00-18:00 arası)',
          },
          ozet: {
            type: 'string',
            description: 'Kısa Türkçe özet: ne istiyor, hangi konu, daha önce destek alıp almadığı, tercih ettiği saat',
          },
        },
        required: ['hizmet', 'ad_soyad', 'arama_saati', 'ozet'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'personel_aktar_tool',
      description:
        'Konuşmayı ekip personeline devreder. Randevu değişikliği, paket sorusu, şikayet, yetkili talebi, konum/idari konu, bilinmeyen konu veya acil durumda çağır.',
      parameters: {
        type: 'object',
        properties: {
          sebep: {
            type: 'string',
            enum: [...PERSONEL_SEBEP_VALUES],
            description: 'Devir sebebi',
          },
          ozet: {
            type: 'string',
            description: 'Personelin bağlamı anlaması için kısa Türkçe özet',
          },
        },
        required: ['sebep', 'ozet'],
      },
    },
  },
];
