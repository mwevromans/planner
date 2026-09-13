const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  return ISO.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

const TZ = process.env.PLANNER_TZ ?? 'Europe/Amsterdam';
const todayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Datum van vandaag in de tijdzone van het gezin, ongeacht de tijdzone van het proces. */
export function today(): string {
  return todayFmt.format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = maandag … 7 = zondag */
export function weekday(date: string): number {
  const js = new Date(date + 'T00:00:00Z').getUTCDay();
  return js === 0 ? 7 : js;
}

export function weekStart(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export function nowIso(): string {
  return new Date().toISOString();
}
