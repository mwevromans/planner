const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  return ISO.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
