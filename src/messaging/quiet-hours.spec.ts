import { isQuiet, nextAllowed, shiftBeforeQuiet } from './quiet-hours';

// Europe/Istanbul = UTC+3 (sabit). Testler +03:00 yerel saatle yazılır.
const at = (iso: string) => new Date(iso);

describe('isQuiet (21:00 - 09:00 gece aralığı)', () => {
  const start = 21;
  const end = 9;

  it('sınırları [21, 9) yarı açık aralıkla uygular', () => {
    expect(isQuiet(at('2026-10-26T20:59:00+03:00'), start, end)).toBe(false);
    expect(isQuiet(at('2026-10-26T21:00:00+03:00'), start, end)).toBe(true);
    expect(isQuiet(at('2026-10-26T08:59:00+03:00'), start, end)).toBe(true);
    expect(isQuiet(at('2026-10-26T09:00:00+03:00'), start, end)).toBe(false);
  });

  it('gece yarısını geçen aralıkta 00:00 ve 03:30 sessizdir', () => {
    expect(isQuiet(at('2026-10-27T00:00:00+03:00'), start, end)).toBe(true);
    expect(isQuiet(at('2026-10-27T03:30:00+03:00'), start, end)).toBe(true);
  });

  it('gündüz saatleri sessiz değildir', () => {
    expect(isQuiet(at('2026-10-26T12:00:00+03:00'), start, end)).toBe(false);
  });

  it('saat dilimi İstanbul olarak yorumlanır (UTC değil)', () => {
    // 18:30Z = 21:30 İstanbul: sessiz.
    expect(isQuiet(at('2026-10-26T18:30:00Z'), start, end)).toBe(true);
    // 17:59Z = 20:59 İstanbul: sessiz değil.
    expect(isQuiet(at('2026-10-26T17:59:00Z'), start, end)).toBe(false);
  });

  it('gündüz aralığını da destekler (01:00 - 06:00)', () => {
    expect(isQuiet(at('2026-10-26T00:59:00+03:00'), 1, 6)).toBe(false);
    expect(isQuiet(at('2026-10-26T01:00:00+03:00'), 1, 6)).toBe(true);
    expect(isQuiet(at('2026-10-26T05:59:00+03:00'), 1, 6)).toBe(true);
    expect(isQuiet(at('2026-10-26T06:00:00+03:00'), 1, 6)).toBe(false);
  });

  it('başlangıç ve bitiş eşitse hiçbir zaman sessiz değildir', () => {
    expect(isQuiet(at('2026-10-26T03:00:00+03:00'), 5, 5)).toBe(false);
  });

  it('geçersiz saat değerini reddeder', () => {
    expect(() => isQuiet(at('2026-10-26T03:00:00+03:00'), 24, 9)).toThrow(
      RangeError,
    );
    expect(() => isQuiet(at('2026-10-26T03:00:00+03:00'), 21, -1)).toThrow(
      RangeError,
    );
  });
});

describe('nextAllowed', () => {
  const start = 21;
  const end = 9;

  it('izin verilen bir an değişmeden döner', () => {
    const date = at('2026-10-26T12:00:00+03:00');
    expect(nextAllowed(date, start, end)).toBe(date);
    const boundary = at('2026-10-26T09:00:00+03:00');
    expect(nextAllowed(boundary, start, end)).toBe(boundary);
  });

  it('akşam sessiz saatte ertesi gün bitiş saatine çeker', () => {
    expect(
      nextAllowed(at('2026-10-26T23:00:00+03:00'), start, end).toISOString(),
    ).toBe(at('2026-10-27T09:00:00+03:00').toISOString());
  });

  it('sabah erken sessiz saatte aynı gün bitiş saatine çeker', () => {
    expect(
      nextAllowed(at('2026-10-27T00:30:00+03:00'), start, end).toISOString(),
    ).toBe(at('2026-10-27T09:00:00+03:00').toISOString());
    expect(
      nextAllowed(at('2026-10-27T07:00:00+03:00'), start, end).toISOString(),
    ).toBe(at('2026-10-27T09:00:00+03:00').toISOString());
  });

  it('ay sonunu doğru geçer', () => {
    expect(
      nextAllowed(at('2026-10-31T23:00:00+03:00'), start, end).toISOString(),
    ).toBe(at('2026-11-01T09:00:00+03:00').toISOString());
  });

  it('UTC girdisini İstanbul saatine göre değerlendirir', () => {
    // 20:30Z = 23:30 İstanbul (sessiz) -> 27 Ekim 09:00 İstanbul.
    expect(
      nextAllowed(at('2026-10-26T20:30:00Z'), start, end).toISOString(),
    ).toBe(at('2026-10-27T09:00:00+03:00').toISOString());
  });
});

describe('shiftBeforeQuiet', () => {
  const start = 21;
  const end = 9;

  it('sessiz olmayan bir an değişmez', () => {
    const date = at('2026-10-26T10:00:00+03:00');
    expect(shiftBeforeQuiet(date, start, end)).toBe(date);
  });

  it('sabah sessiz saatteki an önceki akşam 20:00 olur', () => {
    expect(
      shiftBeforeQuiet(
        at('2026-10-27T07:00:00+03:00'),
        start,
        end,
      ).toISOString(),
    ).toBe(at('2026-10-26T20:00:00+03:00').toISOString());
  });

  it('gece geç saatteki an aynı akşam 20:00 olur', () => {
    expect(
      shiftBeforeQuiet(
        at('2026-10-26T23:00:00+03:00'),
        start,
        end,
      ).toISOString(),
    ).toBe(at('2026-10-26T20:00:00+03:00').toISOString());
  });

  it('21:30 gibi sessiz başlangıç anı da aynı akşam 20:00 olur', () => {
    expect(
      shiftBeforeQuiet(
        at('2026-10-26T21:30:00+03:00'),
        start,
        end,
      ).toISOString(),
    ).toBe(at('2026-10-26T20:00:00+03:00').toISOString());
  });

  it('ay başını doğru geçer', () => {
    expect(
      shiftBeforeQuiet(
        at('2026-11-01T07:00:00+03:00'),
        start,
        end,
      ).toISOString(),
    ).toBe(at('2026-10-31T20:00:00+03:00').toISOString());
  });

  it('UTC girdisini İstanbul gününe göre değerlendirir', () => {
    // 04:00Z = 07:00 İstanbul 27 Ekim -> 26 Ekim 20:00 İstanbul.
    expect(
      shiftBeforeQuiet(at('2026-10-27T04:00:00Z'), start, end).toISOString(),
    ).toBe(at('2026-10-26T20:00:00+03:00').toISOString());
  });
});
