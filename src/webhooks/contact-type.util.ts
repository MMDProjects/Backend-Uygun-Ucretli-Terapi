import { ContactType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Telefonu karşılaştırmak için yalnızca son 10 rakamı kullanır.
// Örn. '0532 123 45 67', '+90 532 123 45 67', '905321234567' aynı anahtarı verir.
export function phoneKey(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

// Gelen numaranın uzman, iç ekip (ADMIN) ya da danışan olduğunu belirler.
// Aynı numara hem uzman hem admin ise güvenli tarafta kalıp EKIP döner.
export async function detectContactType(
  prisma: PrismaService,
  phone?: string | null,
): Promise<ContactType> {
  const key = phoneKey(phone);
  if (!key) return ContactType.DANISAN;

  const candidates = await prisma.user.findMany({
    where: {
      role: { in: [Role.UZMAN, Role.ADMIN] },
      phone: { not: null },
    },
    select: { role: true, phone: true },
  });

  const matches = candidates.filter((u) => phoneKey(u.phone) === key);
  if (matches.some((u) => u.role === Role.ADMIN)) return ContactType.EKIP;
  if (matches.some((u) => u.role === Role.UZMAN)) return ContactType.UZMAN;
  return ContactType.DANISAN;
}
