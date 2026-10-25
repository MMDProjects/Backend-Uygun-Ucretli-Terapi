import { PrismaService } from '../prisma/prisma.service';
import { buildContactContext } from './contact-context';

function buildPrismaMock() {
  return {
    lead: { findFirst: jest.fn<any, any>().mockResolvedValue(null) },
    appointment: { findFirst: jest.fn<any, any>().mockResolvedValue(null) },
    conversation: {
      count: jest.fn<any, any>().mockResolvedValue(0),
      findFirst: jest.fn<any, any>().mockResolvedValue(null),
    },
  };
}

describe('buildContactContext önceki konuşma özeti', () => {
  const conversation = {
    id: 'conv-1',
    contact: {
      id: 'ct1',
      fullName: 'Ayşe Y.',
      age: null,
      notes: null,
      lastSummary: 'Bireysel terapi, yarın uygun.',
    },
  };

  it('includeSummary açıkken özet satırını ekler', async () => {
    const prisma = buildPrismaMock();

    const result = await buildContactContext(
      prisma as unknown as PrismaService,
      conversation,
      { includeSummary: true },
    );

    expect(result).toContain(
      'Önceki konuşma özeti: Bireysel terapi, yarın uygun.',
    );
  });

  it('includeSummary kapalıyken özeti göstermez', async () => {
    const prisma = buildPrismaMock();

    const result = await buildContactContext(
      prisma as unknown as PrismaService,
      conversation,
      { includeSummary: false },
    );

    expect(result).not.toContain('Önceki konuşma özeti');
    expect(result).toContain('Ad soyad: Ayşe Y.');
  });
});
