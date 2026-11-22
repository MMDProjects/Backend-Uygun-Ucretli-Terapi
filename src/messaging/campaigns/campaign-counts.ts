import { RecipientStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Kampanya sayaçları "ulaşıldı" anlamında tutulur: REPLIED bir alıcı
// gönderilmiş, iletilmiş ve okunmuş sayılır. Sayımın tek kaynağı burasıdır;
// webhook ve gönderim işçisi aynı kuralı kullanır.
const SENT_STATUSES: RecipientStatus[] = [
  RecipientStatus.SENT,
  RecipientStatus.DELIVERED,
  RecipientStatus.READ,
  RecipientStatus.REPLIED,
];
const DELIVERED_STATUSES: RecipientStatus[] = [
  RecipientStatus.DELIVERED,
  RecipientStatus.READ,
  RecipientStatus.REPLIED,
];
const READ_STATUSES: RecipientStatus[] = [
  RecipientStatus.READ,
  RecipientStatus.REPLIED,
];
const OPEN_STATUSES: RecipientStatus[] = [
  RecipientStatus.PENDING,
  RecipientStatus.SENDING,
];

// Sayaçları alıcı durumlarından yeniden yazar. Döner: included olup hâlâ
// açık (PENDING ya da SENDING) alıcı sayısı. Kampanya durumuna dokunmaz.
export async function refreshCampaignCounts(
  prisma: PrismaService,
  campaignId: string,
): Promise<number> {
  const groups = await prisma.campaignRecipient.groupBy({
    by: ['status', 'included'],
    where: { campaignId },
    _count: { _all: true },
  });

  const counts = {
    recipientCount: 0,
    sentCount: 0,
    deliveredCount: 0,
    readCount: 0,
    failedCount: 0,
    repliedCount: 0,
    skippedCount: 0,
  };
  let open = 0;
  for (const group of groups) {
    const n = group._count._all;
    if (group.included) counts.recipientCount += n;
    if (group.included && OPEN_STATUSES.includes(group.status)) open += n;
    if (SENT_STATUSES.includes(group.status)) counts.sentCount += n;
    if (DELIVERED_STATUSES.includes(group.status)) counts.deliveredCount += n;
    if (READ_STATUSES.includes(group.status)) counts.readCount += n;
    if (group.status === RecipientStatus.REPLIED) counts.repliedCount += n;
    if (group.status === RecipientStatus.FAILED) counts.failedCount += n;
    if (group.status === RecipientStatus.SKIPPED) counts.skippedCount += n;
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: counts });
  return open;
}
