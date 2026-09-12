export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekday(date: string): number {
  const js = new Date(date + 'T00:00:00Z').getUTCDay();
  return js === 0 ? 7 : js;
}
export function weekStart(date: string): string {
  return addDays(date, 1 - weekday(date));
}
export const DOW = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
export const DOW_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function dom(date: string): number { return Number(date.slice(8, 10)); }
export function monthName(date: string): string { return MONTHS[Number(date.slice(5, 7)) - 1]; }
export function shortDate(date: string): string { return `${DOW[weekday(date) - 1]} ${dom(date)} ${monthName(date)}`; }
export function longDate(date: string): string { return `${DOW_LONG[weekday(date) - 1]} ${dom(date)} ${monthName(date)}`; }
/** Korte deadline-tekst: "vandaag", "morgen", "vr", "vr 18 sep" */
export function deadlineLabel(deadline: string, ref = today()): { text: string; late: boolean } {
  if (deadline < ref) return { text: 'te laat', late: true };
  if (deadline === ref) return { text: 'vandaag', late: false };
  if (deadline === addDays(ref, 1)) return { text: 'morgen', late: false };
  if (deadline < addDays(ref, 7)) return { text: DOW[weekday(deadline) - 1], late: false };
  return { text: `${dom(deadline)} ${monthName(deadline)}`, late: false };
}
export function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  return `${dom(weekStart)} ${monthName(weekStart)} – ${dom(end)} ${monthName(end)}`;
}
