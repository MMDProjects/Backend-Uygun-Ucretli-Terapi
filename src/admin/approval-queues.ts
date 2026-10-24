import { ApprovalStatus, Prisma } from '@prisma/client';

// Admin onay kuyrukları: dashboard sayaçları ve liste filtreleri bu tek yerden okur
export const EXPERT_QUEUES = {
  applications: {
    status: ApprovalStatus.ONAY_BEKLIYOR,
    isPublished: false,
  } satisfies Prisma.ExpertProfileWhereInput,
  profileUpdates: {
    status: {
      in: [ApprovalStatus.REVIZE_GONDERILDI, ApprovalStatus.PROFIL_GUNCELLENDI],
    },
  } satisfies Prisma.ExpertProfileWhereInput,
};

export type ExpertQueue = keyof typeof EXPERT_QUEUES;

export function isExpertQueue(value: string): value is ExpertQueue {
  return Object.prototype.hasOwnProperty.call(EXPERT_QUEUES, value);
}

export const BLOG_APPROVAL_WHERE: Prisma.BlogWhereInput = {
  status: {
    in: [ApprovalStatus.ONAY_BEKLIYOR, ApprovalStatus.REVIZE_GONDERILDI],
  },
};
