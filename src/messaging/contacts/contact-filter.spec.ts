import { ContactType } from '@prisma/client';
import { buildContactWhere, splitMulti } from './contact-filter';

describe('splitMulti', () => {
  it('virgüllü değeri listeye çevirir ve tekrarları atar', () => {
    expect(splitMulti('A,B, A ,')).toEqual(['A', 'B']);
  });

  it('tekrarlı query dizisini birleştirir', () => {
    expect(splitMulti(['x', 'y,z'])).toEqual(['x', 'y', 'z']);
  });

  it('boş değerde undefined döner', () => {
    expect(splitMulti(undefined)).toBeUndefined();
    expect(splitMulti('')).toBeUndefined();
    expect(splitMulti(' , ')).toBeUndefined();
  });
});

describe('buildContactWhere', () => {
  it('contactType verilmezse DANISAN varsayılır', () => {
    expect(buildContactWhere({})).toEqual({ contactType: ContactType.DANISAN });
  });

  it('açıkça verilen contactType kullanılır', () => {
    expect(buildContactWhere({ contactType: ContactType.UZMAN })).toEqual({
      contactType: ContactType.UZMAN,
    });
  });

  it('arama metni ad, telefon ve Instagram alanlarında aranır', () => {
    const where = buildContactWhere({ q: ' ali ' });
    expect(where.OR).toEqual([
      { fullName: { contains: 'ali', mode: 'insensitive' } },
      { phone: { contains: 'ali' } },
      { instagramId: { contains: 'ali' } },
    ]);
  });

  it('hasPhone true/false için telefon koşulunu ayarlar', () => {
    expect(buildContactWhere({ hasPhone: true }).phone).toEqual({ not: null });
    expect(buildContactWhere({ hasPhone: false }).phone).toBeNull();
    expect(buildContactWhere({}).phone).toBeUndefined();
  });

  it('etiket, durum ve liste üyeliği koşullarını ekler', () => {
    const where = buildContactWhere({
      tagIds: ['t1'],
      lifecycleStatus: ['DANISAN'] as never,
      listId: 'l1',
    });
    expect(where.tags).toEqual({ some: { id: { in: ['t1'] } } });
    expect(where.lifecycleStatus).toEqual({ in: ['DANISAN'] });
    expect(where.listMemberships).toEqual({ some: { listId: 'l1' } });
  });

  it('son etkinlik aralığını tarihe çevirir', () => {
    const where = buildContactWhere({
      lastActiveFrom: '2026-01-01T00:00:00.000Z',
      lastActiveTo: '2026-02-01T00:00:00.000Z',
    });
    expect(where.lastActiveAt).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-02-01T00:00:00.000Z'),
    });
  });
});
