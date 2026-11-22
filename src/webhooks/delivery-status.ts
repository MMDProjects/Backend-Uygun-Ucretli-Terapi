// Giden mesaj ve kampanya alıcısı durum geçişleri için saf yardımcılar.

export type ForwardStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface MetaStatusError {
  code?: number;
  title?: string;
  message?: string;
}

export interface CampaignCounterDelta {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replied: number;
}

const MAX_ERROR_LENGTH = 500;
const RANK: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3 };

// Meta'nın durum adını iç duruma çevirir. Bilinmeyen değer null döner.
export function mapMetaStatus(status: string): ForwardStatus | null {
  switch (status) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
}

// Boş ya da bekleyen durum 0; terminal durumlar (FAILED, REPLIED, SKIPPED)
// ilerletilemez ve -1 döner.
function currentRank(status: string | null): number {
  if (status === null || status === 'PENDING' || status === 'SENDING') {
    return 0;
  }
  return RANK[status] ?? -1;
}

// Durum yalnızca ileriye doğru değişir. FAILED, iletilmiş ya da okunmuş
// bir mesaja uygulanmaz.
export function canAdvance(
  current: string | null,
  target: ForwardStatus,
): boolean {
  const from = currentRank(current);
  if (from < 0) return false;
  if (target === 'FAILED') return from <= 1;
  return RANK[target] > from;
}

// Kampanya sayaçlarına eklenecek artışlar. Sayaçlar "ulaşıldı" anlamında
// tutulur: READ bir alıcıda hem iletildi hem gönderildi sayılır.
export function recipientCounterDelta(
  previous: string | null,
  next: ForwardStatus | 'REPLIED',
): CampaignCounterDelta {
  const delta: CampaignCounterDelta = {
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    replied: 0,
  };
  if (next === 'FAILED') {
    delta.failed = 1;
    return delta;
  }
  if (next === 'REPLIED') {
    delta.replied = 1;
    return delta;
  }
  const from = currentRank(previous);
  const to = RANK[next];
  if (from < 1 && to >= 1) delta.sent = 1;
  if (from < 2 && to >= 2) delta.delivered = 1;
  if (from < 3 && to >= 3) delta.read = 1;
  return delta;
}

// Meta hata listesinin ilkini okunabilir metne çevirir.
export function describeMetaError(
  errors: MetaStatusError[] | undefined,
): string | null {
  const first = errors?.[0];
  if (!first) return null;
  const title = first.title ?? first.message ?? 'Bilinmeyen hata';
  const code = first.code !== undefined ? ` (kod ${first.code})` : '';
  return `${title}${code}`.slice(0, MAX_ERROR_LENGTH);
}
