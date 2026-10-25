import { ContactType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { detectContactType, phoneKey } from './contact-type.util';

function buildPrisma(users: { role: Role; phone: string | null }[]) {
  return {
    user: {
      findMany: jest.fn<any, any>().mockResolvedValue(users),
    },
  };
}

describe('phoneKey', () => {
  it('farklı biçimleri aynı son 10 haneye indirger', () => {
    expect(phoneKey('0532 123 45 67')).toBe('5321234567');
    expect(phoneKey('+90 532 123 45 67')).toBe('5321234567');
    expect(phoneKey('905321234567')).toBe('5321234567');
  });

  it('10 haneden kısa veya boş numarada null döner', () => {
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey('')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });
});

describe('detectContactType', () => {
  it('numara boşsa DANISAN döner ve veritabanına gitmez', async () => {
    const prisma = buildPrisma([]);
    const type = await detectContactType(
      prisma as unknown as PrismaService,
      null,
    );
    expect(type).toBe(ContactType.DANISAN);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('eşleşen uzman numarası UZMAN döner', async () => {
    const prisma = buildPrisma([
      { role: Role.UZMAN, phone: '+90 532 123 45 67' },
    ]);
    const type = await detectContactType(
      prisma as unknown as PrismaService,
      '05321234567',
    );
    expect(type).toBe(ContactType.UZMAN);
  });

  it('eşleşen admin numarası EKIP döner', async () => {
    const prisma = buildPrisma([
      { role: Role.ADMIN, phone: '90532 123 45 67' },
    ]);
    const type = await detectContactType(
      prisma as unknown as PrismaService,
      '532 123 45 67',
    );
    expect(type).toBe(ContactType.EKIP);
  });

  it('hem uzman hem admin eşleşirse EKIP döner', async () => {
    const prisma = buildPrisma([
      { role: Role.UZMAN, phone: '0532 123 45 67' },
      { role: Role.ADMIN, phone: '+905321234567' },
    ]);
    const type = await detectContactType(
      prisma as unknown as PrismaService,
      '05321234567',
    );
    expect(type).toBe(ContactType.EKIP);
  });

  it('eşleşme yoksa DANISAN döner', async () => {
    const prisma = buildPrisma([{ role: Role.UZMAN, phone: '0500 000 00 00' }]);
    const type = await detectContactType(
      prisma as unknown as PrismaService,
      '05321234567',
    );
    expect(type).toBe(ContactType.DANISAN);
  });
});
