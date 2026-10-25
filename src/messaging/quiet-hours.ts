// Sessiz saat yardımcıları. Saat dilimi Europe/Istanbul; Türkiye 2016'dan
// beri sabit UTC+3 kullandığı için ofset sabit tutuldu (DST yok).
// Aralık [start, end) yarı açıktır. start > end ise gece aralığıdır (21 → 9).

const ISTANBUL_OFFSET_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;

function assertHour(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new RangeError(`Geçersiz saat: ${value}`);
  }
}

// İstanbul yerel saatine göre bileşenler (ofset uygulanmış UTC alanları).
function istanbulParts(date: Date) {
  const shifted = new Date(date.getTime() + ISTANBUL_OFFSET_HOURS * HOUR_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

// İstanbul yerel "y-m-d hh:00" anını Date olarak üretir. Saat negatif ya da
// 23'ü aşarsa Date.UTC bir gün kaydırarak doğru anı verir.
function istanbulAt(year: number, month: number, day: number, hour: number) {
  return new Date(Date.UTC(year, month, day, hour - ISTANBUL_OFFSET_HOURS));
}

export function isQuiet(date: Date, start: number, end: number): boolean {
  assertHour(start);
  assertHour(end);
  if (start === end) {
    return false;
  }
  const { hour } = istanbulParts(date);
  if (start < end) {
    return hour >= start && hour < end;
  }
  // Gece aralığı: akşam başlangıcından gece yarısına ve sabaha kadar.
  return hour >= start || hour < end;
}

// Sessizse bitiş saatinin (end:00) ilk anını döndürür; değilse aynı anı.
export function nextAllowed(date: Date, start: number, end: number): Date {
  if (!isQuiet(date, start, end)) {
    return date;
  }
  const { year, month, day, hour } = istanbulParts(date);
  // Sabah kısmındaysa (h < end) aynı gün, akşam kısmındaysa ertesi gün.
  const dayOffset = hour < end ? 0 : 1;
  return istanbulAt(year, month, day + dayOffset, end);
}

// Bir günlük hatırlatma sessize denk gelirse, date'ten önceki en yakın
// (start-1):00 anına çeker. Örn. 07:00 → önceki gün 20:00, 23:00 → aynı gün 20:00.
export function shiftBeforeQuiet(date: Date, start: number, end: number): Date {
  if (!isQuiet(date, start, end)) {
    return date;
  }
  assertHour(start);
  const targetHour = start - 1 < 0 ? 23 : start - 1;
  const { year, month, day } = istanbulParts(date);

  const sameDay = istanbulAt(year, month, day, targetHour);
  const shifted =
    sameDay.getTime() <= date.getTime()
      ? sameDay
      : istanbulAt(year, month, day - 1, targetHour);

  if (isQuiet(shifted, start, end)) {
    throw new RangeError(
      'Sessiz saat başlangıcından önceki saat de sessiz aralıkta',
    );
  }
  return shifted;
}
