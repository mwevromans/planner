import ical, { type VEvent as IcalVEvent } from 'node-ical';
import { createDAVClient } from 'tsdav';
import type { Db } from '../db.js';
import { addDays, nowIso, today, weekStart } from '../dates.js';
import type { Card, DayPart, Profile } from '../types.js';

export const TZ = 'Europe/Amsterdam';

export interface CaldavConfig {
  url: string;
  username: string;
  password: string;
  calendar: string;
}

export function configFromEnv(env = process.env): CaldavConfig | null {
  if (!env.CALDAV_USER || !env.CALDAV_PASSWORD || !env.CALDAV_CALENDAR) return null;
  return {
    url: env.CALDAV_URL ?? 'https://caldav.icloud.com',
    username: env.CALDAV_USER,
    password: env.CALDAV_PASSWORD,
    calendar: env.CALDAV_CALENDAR,
  };
}

/** Eén dag van een (eventueel meerdaagse) afspraak, gekoppeld aan één profiel. */
export interface ExternalEvent {
  uid: string;
  profileId: number;
  title: string;
  date: string;
  dayPart: DayPart;
  time: string | null;
  allDay: boolean;
  location: string;
}

export interface Range { from: string; toExclusive: string }

/** Standaardbereik: vorige week tot acht weken vooruit. */
export function syncRange(ref = today()): Range {
  const start = weekStart(ref);
  return { from: addDays(start, -7), toExclusive: addDays(start, 8 * 7) };
}

const fmtDate = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export function localDate(d: Date): string { return fmtDate.format(d); }
export function localTime(d: Date): string { return fmtTime.format(d).replace('24:', '00:'); }

export function dayPartFor(time: string | null): DayPart {
  if (!time) return 'ochtend';
  const h = Number(time.slice(0, 2));
  if (h < 12) return 'ochtend';
  if (h < 15) return 'middag';
  if (h < 18) return 'namiddag';
  return 'avond';
}

/**
 * "(s)", "(l)", "(s,l)", "(s)(l)" of "(Sepp)" achter de titel koppelt aan kinderen op de
 * eerste letter of volledige naam. Zonder tag: het gezinsprofiel.
 */
export function routeByTag(summary: string, profiles: Profile[]): { title: string; profileIds: number[] } {
  const family = profiles.find((p) => p.role === 'family');
  const kids = profiles.filter((p) => p.role === 'kid');
  const ids = new Set<number>();
  let title = summary.trim();
  const tagRe = /\s*\(([^()]{1,40})\)\s*$/;
  let m: RegExpMatchArray | null;
  while ((m = title.match(tagRe))) {
    const tokens = m[1].split(/[,+/ ]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const matched = tokens.map((t) => kids.find((k) => k.name.toLowerCase() === t || k.name.toLowerCase().startsWith(t)));
    if (tokens.length === 0 || matched.some((k) => !k)) break; // geen kind-tag, laat staan
    matched.forEach((k) => ids.add(k!.id));
    title = title.slice(0, m.index).trim();
  }
  if (ids.size === 0 && family) ids.add(family.id);
  return { title: title || summary.trim(), profileIds: [...ids] };
}

type VEvent = IcalVEvent & { recurrences?: Record<string, IcalVEvent>; exdate?: Record<string, Date> };

function instancesOf(ev: VEvent, range: Range): { start: Date; end: Date }[] {
  const durMs = Math.max(0, (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime());
  if (!ev.rrule) return [{ start: ev.start, end: new Date(ev.start.getTime() + durMs) }];
  const from = new Date(range.from + 'T00:00:00Z');
  const to = new Date(range.toExclusive + 'T00:00:00Z');
  const ex = new Set(Object.values(ev.exdate ?? {}).map((d) => localDate(d as Date)));
  const overridden = new Set(Object.keys(ev.recurrences ?? {}));
  const out: { start: Date; end: Date }[] = [];
  for (const d of ev.rrule.between(new Date(from.getTime() - durMs), to, true)) {
    const key = localDate(d);
    if (ex.has(key) || overridden.has(key)) continue;
    out.push({ start: d, end: new Date(d.getTime() + durMs) });
  }
  for (const ov of Object.values(ev.recurrences ?? {}) as IcalVEvent[]) {
    out.push({ start: ov.start, end: ov.end ?? new Date(ov.start.getTime() + durMs) });
  }
  return out;
}

/** Zet ruwe ICS-teksten om naar kaart-dagen binnen het bereik. Puur, zonder netwerk of database. */
export function icsToEvents(icsList: string[], range: Range, profiles: Profile[]): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const ics of icsList) {
    const parsed = ical.sync.parseICS(ics);
    for (const item of Object.values(parsed)) {
      if (!item || item.type !== 'VEVENT') continue;
      const ev = item as VEvent;
      if (!ev.start || ev.status === 'CANCELLED') continue;
      const allDay = (ev.datetype ?? '') === 'date';
      const { title, profileIds } = routeByTag(String(ev.summary ?? '(zonder titel)'), profiles);
      for (const inst of instancesOf(ev, range)) {
        const firstDay = allDay ? inst.start.toISOString().slice(0, 10) : localDate(inst.start);
        // Einde is exclusief; een afspraak die om 00:00 eindigt hoort niet bij die dag.
        const endMs = inst.end.getTime();
        const lastDayRaw = allDay ? new Date(endMs - 1).toISOString().slice(0, 10) : localDate(new Date(endMs - 1));
        const lastDay = lastDayRaw < firstDay ? firstDay : lastDayRaw;
        const time = allDay ? null : localTime(inst.start);
        for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
          if (d < range.from || d >= range.toExclusive) continue;
          const multiDay = firstDay !== lastDay;
          const dayTime = d === firstDay ? time : null;
          for (const profileId of profileIds) {
            out.push({
              uid: String(ev.uid ?? title), profileId, title, date: d,
              dayPart: multiDay && d !== firstDay ? 'ochtend' : dayPartFor(dayTime),
              time: dayTime, allDay: allDay || multiDay, location: String(ev.location ?? ''),
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function storeEvents(db: Db, events: ExternalEvent[], range: Range): void {
  const del = db.prepare('delete from external_events where date >= ? and date < ?');
  const ins = db.prepare(
    'insert into external_events(uid, profile_id, title, date, day_part, time, all_day, location, synced_at) values (?,?,?,?,?,?,?,?,?)',
  );
  db.exec('begin');
  try {
    del.run(range.from, range.toExclusive);
    const now = nowIso();
    for (const e of events) ins.run(e.uid, e.profileId, e.title, e.date, e.dayPart, e.time, e.allDay ? 1 : 0, e.location, now);
    db.exec('commit');
  } catch (err) { db.exec('rollback'); throw err; }
}

/** Externe afspraken als alleen-lezen kaarten (negatieve id, source 'apple'). */
export function externalCards(db: Db, profileId: number, from: string, toExclusive: string): (Card & { source: 'apple' })[] {
  const rows = db
    .prepare('select * from external_events where profile_id=? and date >= ? and date < ? order by date, time is null, time, id')
    .all(profileId, from, toExclusive) as unknown as { id: number; uid: string; title: string; date: string; day_part: DayPart; time: string | null; all_day: number; location: string }[];
  return rows.map((r) => ({
    id: -r.id, profile_id: profileId, title: r.title, icon: r.all_day ? '📅' : '🗓️', color: '#e0e7ff', points: 0,
    deadline: null, planned_date: r.date, day_part: r.day_part, time: r.time, notes: r.location, created_by: 0,
    recurrence_id: null, origin_date: null, skipped: 0, done_at: null, approved_at: null, approved_by: null,
    created_at: '', source: 'apple' as const,
  }));
}

export interface SyncStatus { configured: boolean; calendar: string | null; lastSync: string | null; lastError: string | null; count: number; running: boolean }
const status: SyncStatus = { configured: false, calendar: null, lastSync: null, lastError: null, count: 0, running: false };

export function syncStatus(db: Db): SyncStatus {
  return { ...status, count: (db.prepare('select count(*) as n from external_events').get() as { n: number }).n };
}

export async function fetchIcs(cfg: CaldavConfig, range: Range): Promise<string[]> {
  const client = await createDAVClient({
    serverUrl: cfg.url,
    credentials: { username: cfg.username, password: cfg.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  const cal = calendars.find((c) => String(c.displayName ?? '').toLowerCase() === cfg.calendar.toLowerCase());
  if (!cal) throw new Error(`Agenda "${cfg.calendar}" niet gevonden. Beschikbaar: ${calendars.map((c) => c.displayName).join(', ')}`);
  const objects = await client.fetchCalendarObjects({
    calendar: cal,
    timeRange: { start: new Date(range.from + 'T00:00:00Z').toISOString(), end: new Date(range.toExclusive + 'T00:00:00Z').toISOString() },
  });
  return objects.map((o) => o.data as string).filter(Boolean);
}

export async function syncOnce(db: Db, cfg: CaldavConfig, profiles: Profile[]): Promise<SyncStatus> {
  status.configured = true; status.calendar = cfg.calendar; status.running = true;
  try {
    const range = syncRange();
    const ics = await fetchIcs(cfg, range);
    storeEvents(db, icsToEvents(ics, range, profiles), range);
    status.lastSync = nowIso(); status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    console.error('CalDAV sync mislukt:', status.lastError);
  } finally { status.running = false; }
  return syncStatus(db);
}

export function startSyncLoop(db: Db, cfg: CaldavConfig | null, listProfiles: () => Profile[], minutes = 10): void {
  if (!cfg) { console.log('CalDAV niet geconfigureerd (CALDAV_USER, CALDAV_PASSWORD, CALDAV_CALENDAR)'); return; }
  status.configured = true; status.calendar = cfg.calendar;
  const run = () => syncOnce(db, cfg, listProfiles());
  run();
  setInterval(run, minutes * 60_000).unref();
}
