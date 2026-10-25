import { AppointmentStatus, Contact, ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const TR_LOCALE = 'tr-TR';
const ISTANBUL_TZ = 'Europe/Istanbul';
const NOTES_MAX_CHARS = 500;
const SUMMARY_MAX_CHARS = 1000;
const HEADER =
  'DANIŞAN BİLGİSİ (sistem kaydı; danışana aynen okuma, tekrar sorma)';

const SERVICE_LABELS: Record<ServiceType, string> = {
  BIREYSEL: 'Bireysel terapi',
  CIFT: 'Çift terapisi',
  AILE: 'Aile terapisi',
  COCUK_ERGEN: 'Çocuk ve ergen terapisi',
  EMDR: 'EMDR',
  ON_GORUSME: 'Ücretsiz ön görüşme',
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  YENI: 'yeni',
  ARANDI: 'arandı',
  ULASILAMADI: 'ulaşılamadı',
  RANDEVU_OLUSTURULDU: 'randevu oluşturuldu',
  VAZGECTI: 'vazgeçti',
};

export interface ContactContextOptions {
  includeNotes?: boolean;
  // ASSISTANT_CONVERSATION_SUMMARY açıkken önceki konuşma özetini ekler.
  includeSummary?: boolean;
}

export interface ContactContextConversation {
  id: string;
  contact: Pick<Contact, 'id' | 'fullName' | 'age' | 'notes'> &
    Partial<Pick<Contact, 'lastSummary'>>;
}

// Tarih ve saat İstanbul saatiyle, Türkçe biçimde yazılır.
function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat(TR_LOCALE, {
    timeZone: ISTANBUL_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('day')} ${value('month')} ${value('year')} ${value('weekday')} ${value('hour')}:${value('minute')}`;
}

// Modele giden kişi bloğu. Telefon numarası hiçbir zaman eklenmez (KVKK).
// Personel notları yalnız includeNotes açıkken, en fazla 500 karakter eklenir.
// Hiç bilgi yoksa null döner.
export async function buildContactContext(
  prisma: PrismaService,
  conversation: ContactContextConversation,
  options: ContactContextOptions = {},
): Promise<string | null> {
  const contact = conversation.contact;
  const now = new Date();
  const lines: string[] = [];

  if (contact.fullName) {
    lines.push(`- Ad soyad: ${contact.fullName}`);
  }
  if (contact.age !== null && contact.age !== undefined) {
    lines.push(`- Yaş: ${contact.age}`);
  }

  const lead = await prisma.lead.findFirst({
    where: { contactId: contact.id },
    orderBy: { createdAt: 'desc' },
    select: { serviceType: true, status: true, createdAt: true },
  });
  if (lead) {
    const service = SERVICE_LABELS[lead.serviceType] ?? lead.serviceType;
    const status = LEAD_STATUS_LABELS[lead.status] ?? lead.status;
    lines.push(
      `- Son arama talebi: ${service}, durum: ${status}, tarih: ${formatDate(lead.createdAt)}`,
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      contactId: contact.id,
      status: AppointmentStatus.SCHEDULED,
      scheduledAt: { gte: now },
    },
    orderBy: { scheduledAt: 'asc' },
    select: {
      serviceType: true,
      scheduledAt: true,
      therapist: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (appointment) {
    const service =
      SERVICE_LABELS[appointment.serviceType] ?? appointment.serviceType;
    const expert = appointment.therapist?.user
      ? `${appointment.therapist.user.firstName} ${appointment.therapist.user.lastName}`
      : 'belirtilmemiş';
    lines.push(
      `- Yaklaşan randevu: ${formatDate(appointment.scheduledAt)}, uzman: ${expert}, hizmet: ${service}`,
    );
  }

  const previousCount = await prisma.conversation.count({
    where: { contactId: contact.id, id: { not: conversation.id } },
  });
  if (previousCount > 0) {
    const last = await prisma.conversation.findFirst({
      where: { contactId: contact.id, id: { not: conversation.id } },
      orderBy: { lastMessageAt: 'desc' },
      select: { lastMessageAt: true },
    });
    const lastText = last
      ? `, son konuşma: ${formatDate(last.lastMessageAt)}`
      : '';
    lines.push(
      `- Bu kişiyle daha önce ${previousCount} konuşma yapıldı${lastText}`,
    );
  }

  if (options.includeNotes && contact.notes) {
    lines.push(`- Personel notu: ${contact.notes.slice(0, NOTES_MAX_CHARS)}`);
  }
  if (options.includeSummary && contact.lastSummary) {
    lines.push(
      `- Önceki konuşma özeti: ${contact.lastSummary.slice(0, SUMMARY_MAX_CHARS)}`,
    );
  }

  if (lines.length === 0) {
    return null;
  }
  return `[${HEADER}]\n${lines.join('\n')}`;
}
