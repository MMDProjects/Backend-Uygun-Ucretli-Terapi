import { ReminderKind } from '@prisma/client';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const DAY_BEFORE_MS = 24 * HOUR_MS;
export const REMINDER_TICK_MS = MINUTE_MS;
export const REMINDER_BATCH_SIZE = 50;
// SENDING bu süreden uzun kalırsa işçi çöktü demektir; yeniden alınır.
export const REMINDER_STALE_SENDING_MS = 10 * MINUTE_MS;
export const REMINDER_RETRY_DELAY_MS = 5 * MINUTE_MS;
export const REMINDER_MAX_ATTEMPTS = 3;

// Planlanan andan bu yana geçen en uzun süre; aşılırsa hatırlatma atlanır.
export const REMINDER_LATE_LIMIT_MS: Record<ReminderKind, number> = {
  DAY_BEFORE: 3 * HOUR_MS,
  SHORT_BEFORE: 10 * MINUTE_MS,
};

export const REMINDER_SETTINGS_SELECT = {
  reminderEnabled: true,
  reminderDayBeforeTemplateId: true,
  reminderShortTemplateId: true,
  reminderShortMinutes: true,
  reminderQuietStart: true,
  reminderQuietEnd: true,
} as const;

export interface ReminderSettings {
  reminderEnabled: boolean;
  reminderDayBeforeTemplateId: string | null;
  reminderShortTemplateId: string | null;
  reminderShortMinutes: number;
  reminderQuietStart: number;
  reminderQuietEnd: number;
}

// Kayıt yoksa kullanılan varsayılanlar; hatırlatma varsayılan olarak kapalı.
export const REMINDER_DEFAULTS: ReminderSettings = {
  reminderEnabled: false,
  reminderDayBeforeTemplateId: null,
  reminderShortTemplateId: null,
  reminderShortMinutes: 60,
  reminderQuietStart: 21,
  reminderQuietEnd: 9,
};
