import { ConfigService } from '@nestjs/config';
import { ReminderWorker } from './reminder-worker.service';
import { RemindersService } from './reminders.service';

type Row = Record<string, any>;

// Bellek içi sahte veritabanı: koşullu updateMany'nin atomikliğini taklit eder.
function makeState(now: Date) {
  return {
    clock: now,
    reminders: new Map<string, Row>(),
    appointments: new Map<string, Row>(),
    templates: new Map<string, Row>(),
    settings: {
      reminderEnabled: true,
      reminderDayBeforeTemplateId: 'tpl-day',
      reminderShortTemplateId: 'tpl-short',
      reminderShortMinutes: 60,
      reminderQuietStart: 21,
      reminderQuietEnd: 9,
    } as Row,
    conversation: null as Row | null,
    messages: [] as Row[],
  };
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return (cond.in as unknown[]).includes(value);
      if ('lte' in cond) return value.getTime() <= cond.lte.getTime();
      if ('lt' in cond) return value.getTime() < cond.lt.getTime();
    }
    return value === cond;
  });
}

function buildPrisma(state: ReturnType<typeof makeState>) {
  const reminderRows = () => [...state.reminders.values()];
  const withAppointment = (row: Row) => ({
    ...row,
    appointment: state.appointments.get(row.appointmentId),
  });
  return {
    appointmentReminder: {
      findMany: jest.fn(({ where, take }: any) =>
        reminderRows()
          .filter((r) => matches(r, where))
          .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
          .slice(0, take)
          .map((r) => ({ id: r.id })),
      ),
      updateMany: jest.fn(({ where, data }: any) => {
        const hits = reminderRows().filter((r) => matches(r, where));
        for (const row of hits) {
          Object.assign(row, data, { updatedAt: state.clock });
        }
        return { count: hits.length };
      }),
      findUnique: jest.fn(({ where }: any) => {
        const row = state.reminders.get(where.id);
        return row ? withAppointment(row) : null;
      }),
      update: jest.fn(({ where, data }: any) => {
        const row = state.reminders.get(where.id) as Row;
        Object.assign(row, data, { updatedAt: state.clock });
        return row;
      }),
    },
    systemSetting: {
      findFirst: jest.fn(() => state.settings),
    },
    whatsAppTemplate: {
      findUnique: jest.fn(({ where }: any) => {
        return state.templates.get(where.id) ?? null;
      }),
    },
    conversation: {
      findFirst: jest.fn(() => state.conversation),
      update: jest.fn(() => ({})),
    },
    message: {
      create: jest.fn(({ data }: any) => {
        const message = { id: `m${state.messages.length + 1}`, ...data };
        state.messages.push(message);
        return message;
      }),
    },
  };
}

const APPROVED_DAY = {
  id: 'tpl-day',
  name: 'randevu_gun_once',
  language: 'tr',
  bodyText: 'Merhaba {{1}}, {{2}} saat {{3}} randevunuz var ({{4}}).',
  variableCount: 4,
  status: 'APPROVED',
};

const T0 = new Date('2026-10-27T10:30:00+03:00');
const APPT_AT = new Date('2026-10-27T11:00:00+03:00');

function seed(
  state: ReturnType<typeof makeState>,
  overrides: {
    reminder?: Row;
    appointment?: Row;
    template?: Row;
  } = {},
) {
  state.appointments.set('a1', {
    id: 'a1',
    status: 'SCHEDULED',
    scheduledAt: APPT_AT,
    contact: {
      id: 'c1',
      fullName: 'Ayşe Yılmaz',
      phone: '905551112233',
      reminderOptOut: false,
    },
    therapist: { user: { firstName: 'Elif', lastName: 'Kaya' } },
    ...overrides.appointment,
  });
  state.templates.set('tpl-day', { ...APPROVED_DAY, ...overrides.template });
  state.templates.set('tpl-short', {
    ...APPROVED_DAY,
    id: 'tpl-short',
    name: 'randevu_kisa',
    variableCount: 2,
  });
  state.reminders.set('r1', {
    id: 'r1',
    appointmentId: 'a1',
    kind: 'DAY_BEFORE',
    scheduledFor: T0,
    status: 'PENDING',
    attempts: 0,
    messageId: null,
    error: null,
    sentAt: null,
    updatedAt: T0,
    ...overrides.reminder,
  });
}

function build(state: ReturnType<typeof makeState>) {
  const prisma = buildPrisma(state);
  const meta = {
    sendTemplate: jest.fn<any, any>(() => ({
      ok: true,
      messageId: 'wamid.1',
    })),
  };
  const inboxEvents = { emit: jest.fn() };
  const reminders = new RemindersService(prisma as any);
  const worker = new ReminderWorker(
    prisma as any,
    reminders,
    meta as any,
    inboxEvents as any,
    { get: jest.fn() } as unknown as ConfigService,
  );
  return { prisma, meta, inboxEvents, worker };
}

describe('ReminderWorker.tick', () => {
  let state: ReturnType<typeof makeState>;

  beforeEach(() => {
    state = makeState(T0);
    seed(state);
  });

  it('günlük hatırlatmayı gönderir, SENT yapar ve açık konuşmaya bot mesajı yazar', async () => {
    state.conversation = { id: 'conv1' };
    const { meta, inboxEvents, worker } = build(state);

    await worker.tick(T0);

    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    const [phone, template] = meta.sendTemplate.mock.calls[0] as any[];
    expect(phone).toBe('905551112233');
    expect(template.name).toBe('randevu_gun_once');
    expect(template.language).toBe('tr');
    expect(template.params[0]).toBe('Ayşe');
    expect(template.params[1]).toMatch(/27 Ekim/);
    expect(template.params[1]).toMatch(/salı/i);
    expect(template.params[2]).toBe('11:00');
    expect(template.params[3]).toBe('Elif Kaya');

    const row = state.reminders.get('r1') as Row;
    expect(row.status).toBe('SENT');
    expect(row.messageId).toBe('wamid.1');
    expect(row.sentAt).toEqual(T0);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      conversationId: 'conv1',
      senderType: 'BOT',
      templateName: 'randevu_gun_once',
      metaMessageId: 'wamid.1',
      deliveryStatus: 'SENT',
    });
    expect(state.messages[0].content).toBe(
      'Merhaba Ayşe, 27 Ekim Salı saat 11:00 randevunuz var (Elif Kaya).',
    );
    expect(inboxEvents.emit).toHaveBeenCalledWith(
      'message.created',
      expect.objectContaining({ conversationId: 'conv1' }),
    );
  });

  it('konuşma yoksa mesaj yazmaz ama gönderimi SENT bırakır', async () => {
    const { prisma, worker } = build(state);

    await worker.tick(T0);

    expect(state.reminders.get('r1')?.status).toBe('SENT');
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('iki paralel tick aynı hatırlatmayı yalnızca bir kez gönderir', async () => {
    const { meta, worker } = build(state);

    await Promise.all([worker.tick(T0), worker.tick(T0)]);

    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(state.reminders.get('r1')?.status).toBe('SENT');
  });

  it('ayar kapalıysa hiçbir şey göndermez', async () => {
    state.settings.reminderEnabled = false;
    const { meta, worker } = build(state);

    await worker.tick(T0);

    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(state.reminders.get('r1')?.status).toBe('PENDING');
  });

  it('vakti gelmemiş hatırlatmayı beklemede bırakır', async () => {
    const { meta, worker } = build(state);

    await worker.tick(new Date(T0.getTime() - 60 * 1000));

    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(state.reminders.get('r1')?.status).toBe('PENDING');
  });

  describe('koşul atlamaları', () => {
    it('opt-out kişiyi atlar', async () => {
      state.appointments.get('a1')!.contact.reminderOptOut = true;
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'opt_out',
      });
    });

    it('telefonu olmayan kişiyi atlar', async () => {
      state.appointments.get('a1')!.contact.phone = null;
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'no_phone',
      });
    });

    it('iptal edilmiş randevuyu atlar', async () => {
      state.appointments.get('a1')!.status = 'CANCELLED';
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'appointment_not_scheduled',
      });
    });

    it('onaylı olmayan şablonu atlar', async () => {
      state.templates.get('tpl-day')!.status = 'PENDING';
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'template_not_approved',
      });
    });

    it('değişken sayısı desteklenenden fazlaysa atlar', async () => {
      state.templates.get('tpl-day')!.variableCount = 5;
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'template_variables',
      });
    });

    it('gecikme sınırını aşan günlük hatırlatmayı too_late ile atlar', async () => {
      const late = new Date(T0.getTime() - 4 * 60 * 60 * 1000);
      state.reminders.get('r1')!.scheduledFor = late;
      const { meta, worker } = build(state);
      await worker.tick(T0);
      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'too_late',
      });
    });

    it('kısa hatırlatmada 10 dakikayı aşan gecikme too_late sayılır', async () => {
      state.reminders.get('r1')!.kind = 'SHORT_BEFORE';
      state.reminders.get('r1')!.scheduledFor = new Date(
        T0.getTime() - 11 * 60 * 1000,
      );
      const { worker } = build(state);
      await worker.tick(T0);
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'too_late',
      });
    });
  });

  describe('sessiz saat', () => {
    it('sessizde kayıt alınmaz ve scheduledFor değişmez', async () => {
      const night = new Date('2026-10-26T23:00:00+03:00');
      const planned = new Date('2026-10-26T22:30:00+03:00');
      state.clock = night;
      state.reminders.get('r1')!.scheduledFor = planned;
      state.appointments.get('a1')!.scheduledAt = new Date(
        '2026-10-27T10:00:00+03:00',
      );
      const { meta, worker } = build(state);

      await worker.tick(night);

      expect(meta.sendTemplate).not.toHaveBeenCalled();
      const row = state.reminders.get('r1') as Row;
      expect(row.status).toBe('PENDING');
      expect(row.scheduledFor).toEqual(planned);
    });

    it('sabah 09:00 sonrası gecikme sınırını aşan hatırlatma too_late ile atlanır', async () => {
      state.reminders.get('r1')!.scheduledFor = new Date(
        '2026-10-26T20:00:00+03:00',
      );
      const { meta, worker } = build(state);

      await worker.tick(new Date('2026-10-27T09:05:00+03:00'));

      expect(meta.sendTemplate).not.toHaveBeenCalled();
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'SKIPPED',
        error: 'too_late',
      });
    });

    it('sabah sınır içinde kalan hatırlatma gönderilir', async () => {
      state.reminders.get('r1')!.scheduledFor = new Date(
        '2026-10-27T08:30:00+03:00',
      );
      const { meta, worker } = build(state);

      await worker.tick(new Date('2026-10-27T09:05:00+03:00'));

      expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
      expect(state.reminders.get('r1')?.status).toBe('SENT');
    });
  });

  describe('deneme ve başarısızlık', () => {
    it('hata olursa PENDING + 5 dk sonra tekrar dener, 3. hatada FAILED olur', async () => {
      const { meta, worker } = build(state);
      meta.sendTemplate.mockResolvedValue({ ok: false, error: 'Meta hatası' });

      await worker.tick(T0);
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        error: 'Meta hatası',
      });
      const retryAt = state.reminders.get('r1')!.scheduledFor as Date;
      expect(retryAt.getTime()).toBe(T0.getTime() + 5 * 60 * 1000);

      await worker.tick(retryAt);
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'PENDING',
        attempts: 2,
      });
      const secondRetry = state.reminders.get('r1')!.scheduledFor as Date;

      await worker.tick(secondRetry);
      expect(state.reminders.get('r1')).toMatchObject({
        status: 'FAILED',
        attempts: 3,
      });
      expect(meta.sendTemplate).toHaveBeenCalledTimes(3);
    });

    it('sendTemplate beklenmedik hata fırlatırsa deneme sayılır', async () => {
      const { meta, worker } = build(state);
      meta.sendTemplate.mockRejectedValue(new Error('boom'));

      await worker.tick(T0);

      expect(state.reminders.get('r1')).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        error: 'boom',
      });
    });
  });

  it('10 dakikadan uzun SENDING kaydını yeniden alıp gönderir', async () => {
    const row = state.reminders.get('r1')!;
    row.status = 'SENDING';
    row.updatedAt = new Date(T0.getTime() - 11 * 60 * 1000);
    const { meta, worker } = build(state);

    await worker.tick(T0);

    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(state.reminders.get('r1')?.status).toBe('SENT');
  });

  it('kısa hatırlatma için ad ve saat değişkenlerini kullanır', async () => {
    state.reminders.get('r1')!.kind = 'SHORT_BEFORE';
    const { meta, worker } = build(state);

    await worker.tick(T0);

    const [, template] = meta.sendTemplate.mock.calls[0] as any[];
    expect(template.name).toBe('randevu_kisa');
    expect(template.params).toEqual(['Ayşe', '11:00']);
  });

  it('yerel biçimli telefonu E.164 (90...) olarak gönderir', async () => {
    state.appointments.get('a1')!.contact.phone = '0555 111 22 33';
    const { meta, worker } = build(state);

    await worker.tick(T0);

    expect(meta.sendTemplate.mock.calls[0][0]).toBe('905551112233');
    expect(state.reminders.get('r1')?.status).toBe('SENT');
  });

  it('geçersiz telefonu invalid_phone ile atlar', async () => {
    state.appointments.get('a1')!.contact.phone = '12';
    const { meta, worker } = build(state);

    await worker.tick(T0);

    expect(meta.sendTemplate).not.toHaveBeenCalled();
    expect(state.reminders.get('r1')).toMatchObject({
      status: 'SKIPPED',
      error: 'invalid_phone',
    });
  });

  it('Meta kabul ettikten sonra kayıt yazılamazsa tekrar göndermez', async () => {
    const { prisma, meta, worker } = build(state);
    prisma.appointmentReminder.update.mockImplementationOnce(() => {
      throw new Error('db down');
    });

    await worker.tick(T0);
    await worker.tick(new Date(T0.getTime() + 24 * 60 * 60 * 1000));

    expect(meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(state.reminders.get('r1')).toMatchObject({
      status: 'FAILED',
      messageId: 'wamid.1',
    });
    expect(String(state.reminders.get('r1')?.error)).toContain(
      'Meta kabul etti',
    );
  });

  it('yeniden başlatma sonrası yeni işçi bekleyen hatırlatmayı gönderir', async () => {
    // Hatırlatma 08:00'de vadesi dolmuş; sessiz saat 08:00-09:00.
    const due = new Date('2026-10-28T08:00:00+03:00');
    state.reminders.get('r1')!.scheduledFor = due;
    state.appointments.get('a1')!.scheduledAt = new Date(
      '2026-10-28T12:00:00+03:00',
    );
    state.settings.reminderQuietStart = 8;
    state.settings.reminderQuietEnd = 9;

    const first = build(state);
    await first.worker.tick(new Date('2026-10-28T08:30:00+03:00'));
    expect(first.meta.sendTemplate).not.toHaveBeenCalled();
    expect(state.reminders.get('r1')?.status).toBe('PENDING');

    // Sunucu yeniden başlar: yeni işçi örneği aynı veritabanından devam eder.
    const restarted = build(state);
    await restarted.worker.tick(new Date('2026-10-28T09:30:00+03:00'));

    expect(restarted.meta.sendTemplate).toHaveBeenCalledTimes(1);
    expect(state.reminders.get('r1')?.status).toBe('SENT');
  });

  it('ad boşsa Danışanımız, uzman adı boşsa yedek metin kullanılır', async () => {
    state.appointments.get('a1')!.contact.fullName = null;
    state.appointments.get('a1')!.therapist = {
      user: { firstName: '', lastName: '' },
    };
    const { meta, worker } = build(state);

    await worker.tick(T0);

    const [, template] = meta.sendTemplate.mock.calls[0] as any[];
    expect(template.params[0]).toBe('Danışanımız');
    expect(template.params[3]).toBe('Uzmanınız');
  });
});
