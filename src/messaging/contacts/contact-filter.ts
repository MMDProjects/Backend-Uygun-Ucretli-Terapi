import { Channel, ContactLifecycle, ContactType, Prisma } from '@prisma/client';

// Kişi filtresi: liste ekranı, "filtreyle ekle" ve kampanya hedef kitlesi
// aynı where koşulunu kullanır.
export interface ContactFilter {
  q?: string;
  lifecycleStatus?: ContactLifecycle[];
  tagIds?: string[];
  channel?: Channel;
  contactType?: ContactType;
  hasPhone?: boolean;
  lastActiveFrom?: string;
  lastActiveTo?: string;
  listId?: string;
}

export const DEFAULT_CONTACT_TYPE = ContactType.DANISAN;
export const MAX_FILTER_CONTACTS = 5000;

// Virgüllü ya da tekrarlı query değerlerini tek listeye indirir.
export function splitMulti(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = Array.isArray(value) ? value : [value];
  const items = parts
    .flatMap((part) => String(part).split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

// Kayıtlı filtreye varsayılan contactType eklenir (DANISAN).
export function normalizeContactFilter(filter: ContactFilter): ContactFilter {
  return { ...filter, contactType: filter.contactType ?? DEFAULT_CONTACT_TYPE };
}

export function buildContactWhere(
  filter: ContactFilter,
): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {
    contactType: filter.contactType ?? DEFAULT_CONTACT_TYPE,
  };

  const q = filter.q?.trim();
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { instagramId: { contains: q } },
    ];
  }
  if (filter.lifecycleStatus && filter.lifecycleStatus.length > 0) {
    where.lifecycleStatus = { in: filter.lifecycleStatus };
  }
  if (filter.tagIds && filter.tagIds.length > 0) {
    where.tags = { some: { id: { in: filter.tagIds } } };
  }
  if (filter.channel) {
    where.channel = filter.channel;
  }
  if (filter.hasPhone === true) {
    where.phone = { not: null };
  } else if (filter.hasPhone === false) {
    where.phone = null;
  }
  if (filter.lastActiveFrom || filter.lastActiveTo) {
    where.lastActiveAt = {
      ...(filter.lastActiveFrom
        ? { gte: new Date(filter.lastActiveFrom) }
        : {}),
      ...(filter.lastActiveTo ? { lte: new Date(filter.lastActiveTo) } : {}),
    };
  }
  if (filter.listId) {
    where.listMemberships = { some: { listId: filter.listId } };
  }
  return where;
}
