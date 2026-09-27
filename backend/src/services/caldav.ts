import ical, { type VEvent as IcalVEvent } from 'node-ical';
import { createDAVClient } from 'tsdav';
import type { Db } from '../db.js';
import { addDays, nowIso, today, weekStart } from '../dates.js';
import { PlannerError, type Card, type DayPart, type Profile } from '../types.js';
import { isParent } from '../auth.js';

export const TZ = process.env.PLANNER_TZ ?? 'Europe/Amsterdam';

export interface CalendarMapping {
  /** Naam van de agenda in Apple. */
  name: string;
  /** Standaardbestemming zonder tag: profielnamen, of 'gezin'. */
  targets: string[];
}

export interface CaldavConfig {
  url: string;
  username: string;
  password: string;
  calendars: CalendarMapping[];
}

/**
 * CALDAV_CALENDARS="Family=gezin,Sepp en Liz=Sepp+Liz". Zonder '=' geldt 'gezin'.
 * Oudere configuratie met alleen CALDAV_CALENDAR blijft werken.
 */
export function parseCalendars(spec: string): CalendarMapping[] {
  return spec.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, target] = part.split('=').map((x) => x.trim());
    const targets = (target ?? 'gezin').split('+').map((x) => x.trim()).filter(Boolean);
    return { name, targets: targets.length ? targets : ['gezin'] };
  });
}

export function configFromEnv(env = process.env): CaldavConfig | null {
  const spec = env.CALDAV_CALENDARS ?? env.CALDAV_CALENDAR;
  if (!env.CALDAV_USER || !env.CALDAV_PASSWORD || !spec) return null;
  return {
    url: env.CALDAV_URL ?? 'https://caldav.icloud.com',
    username: env.CALDAV_USER,
    password: env.CALDAV_PASSWORD,
    calendars: parseCalendars(spec),
  };
}

/** Zet bestemmingsnamen om naar profiel-ids; 'gezin' of 'family' is het gezinsprofiel. */
export function resolveTargets(targets: string[], profiles: Profile[]): number[] {
  const ids = targets.map((t) => {
    const key = t.toLowerCase();
    const p = key === 'gezin' || key === 'family'
      ? profiles.find((x) => x.role === 'family')
      : profiles.find((x) => x.name.toLowerCase() === key || (x.tag && x.tag === key));
    if (!p) throw new Error(`Bestemming "${t}" is geen gezinslid`);
    return p.id;
  });
  return [...new Set(ids)];
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
/** Kalenderdatum van een hele-dag-waarde. node-ical maakt die als lokale middernacht, dus lokale getters zijn juist in elke proces-tijdzone. */
export function allDayDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
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
 * Tags tussen haakjes achter de titel wijzen gezinsleden aan: "(s)", "(l)", "(s,l)", "(l & e)",
 * "(s)(l)" of een volledige naam "(Sepp)". Elk profiel heeft een eigen tag (ouderpaneel → Gezin).
 * Haakjes die geen tags zijn blijven in de titel staan. Zonder tag: het gezinsprofiel.
 */
export function routeByTag(summary: string, profiles: Profile[], defaultIds?: number[]): { title: string; profileIds: number[] } {
  const family = profiles.find((p) => p.role === 'family');
  const people = profiles.filter((p) => p.role !== 'family');
  const ids = new Set<number>();
  let title = summary.trim();
  const tagRe = /\s*\(([^()]{1,40})\)\s*$/;
  let m: RegExpMatchArray | null;
  while ((m = title.match(tagRe))) {
    const tokens = m[1].split(/[,+/&]|\s+en\s+|\s+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const matched = tokens.map((t) => people.find((p) => (p.tag && p.tag === t) || p.name.toLowerCase() === t));
    if (tokens.length === 0 || matched.some((p) => !p)) break;
    matched.forEach((p) => ids.add(p!.id));
    title = title.slice(0, m.index).trim();
  }
  if (ids.size === 0) (defaultIds?.length ? defaultIds : family ? [family.id] : []).forEach((id) => ids.add(id));
  return { title: title || summary.trim(), profileIds: [...ids] };
}

type VEvent = IcalVEvent & { recurrences?: Record<string, IcalVEvent>; exdate?: Record<string, Date> };

function instancesOf(ev: VEvent, range: Range, allDay: boolean): { start: Date; end: Date; recurring: boolean }[] {
  const durMs = Math.max(0, (ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime());
  if (!ev.rrule) return [{ start: ev.start, end: new Date(ev.start.getTime() + durMs), recurring: false }];
  const from = new Date(range.from + 'T00:00:00Z');
  const to = new Date(range.toExclusive + 'T00:00:00Z');
  const key = (d: Date) => (allDay ? allDayDate(d) : localDate(d));
  const ex = new Set(Object.values(ev.exdate ?? {}).map((d) => key(d as Date)));
  const overridden = new Set(Object.keys(ev.recurrences ?? {}));
  const out: { start: Date; end: Date; recurring: boolean }[] = [];
  // Ruim zoeken en daarna op datum filteren: rrule rekent in UTC, wij in lokale dagen.
  for (const d of ev.rrule.between(new Date(from.getTime() - durMs - 86_400_000), new Date(to.getTime() + 86_400_000), true)) {
    const k = key(d);
    if (ex.has(k) || overridden.has(k)) continue;
    out.push({ start: d, end: new Date(d.getTime() + durMs), recurring: true });
  }
  for (const ov of Object.values(ev.recurrences ?? {}) as IcalVEvent[]) {
    out.push({ start: ov.start, end: ov.end ?? new Date(ov.start.getTime() + durMs), recurring: false });
  }
  return out;
}

/** Zet ruwe ICS-teksten om naar kaart-dagen binnen het bereik. Puur, zonder netwerk of database. */
export function icsToEvents(icsList: string[], range: Range, profiles: Profile[], defaultIds?: number[]): ExternalEvent[] {
  const out: ExternalEvent[] = [];
  for (const ics of icsList) {
    const parsed = ical.sync.parseICS(ics);
    for (const item of Object.values(parsed)) {
      if (!item || item.type !== 'VEVENT') continue;
      const ev = item as VEvent;
      if (!ev.start || ev.status === 'CANCELLED') continue;
      const allDay = (ev.datetype ?? '') === 'date';
      const { title, profileIds } = routeByTag(String(ev.summary ?? '(zonder titel)'), profiles, defaultIds);
      // Herhalende afspraken houden de kloktijd van de eerste afspraak; dat is wat de agenda bedoelt, ook over de zomertijdgrens.
      const wallClock = allDay ? null : localTime(ev.start);
      const allDayDays = allDay ? Math.max(1, Math.round(((ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime()) / 86_400_000)) : 1;
      for (const inst of instancesOf(ev, range, allDay)) {
        let firstDay: string;
        let lastDay: string;
        if (allDay) {
          firstDay = allDayDate(inst.start);
          lastDay = addDays(firstDay, allDayDays - 1);
        } else {
          firstDay = localDate(inst.start);
          // Einde is exclusief; een afspraak die om 00:00 eindigt hoort niet bij die dag.
          const lastRaw = localDate(new Date(inst.end.getTime() - 1));
          lastDay = lastRaw < firstDay ? firstDay : lastRaw;
        }
        const time = allDay ? null : inst.recurring ? wallClock : localTime(inst.start);
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

const ICON_RULES: [RegExp, string][] = [
  [/voetbal|keeper/i, '⚽'], [/zwem/i, '🏊'], [/dans/i, '💃'], [/turn|gym/i, '🤸'], [/volleybal/i, '🏐'], [/hockey/i, '🏑'],
  [/tennis/i, '🎾'], [/judo|karate/i, '🥋'], [/fiets|wieler/i, '🚴'], [/tandarts|orthodont/i, '🦷'], [/dokter|arts|huisarts|controle|ziekenhuis/i, '🩺'],
  [/logopedie/i, '🗣️'], [/kapper/i, '💇'], [/verjaardag|jarig|feest/i, '🎂'], [/\bschool|studiedag|oudergesprek/i, '🏫'], [/bso|opvang/i, '🎒'],
  [/vakantie/i, '🏖️'], [/oppas/i, '👵'], [/zwemles/i, '🏊'], [/muziek|piano|gitaar|drum/i, '🎵'], [/eten|restaurant|diner/i, '🍽️'],
  [/vergadering|overleg|werk/i, '💼'], [/sport|fit|training/i, '🏃'], [/spelen|speel/i, '🧸'], [/bieb|bibliotheek|lezen/i, '📚'],
];

/** Standaardicoon op basis van trefwoorden in de titel; anders een agenda-icoon. */
export function defaultIcon(title: string, allDay: boolean): string {
  for (const [re, icon] of ICON_RULES) if (re.test(title)) return icon;
  return allDay ? '📅' : '🗓️';
}

/**
 * Externe afspraken als kaarten (negatieve id, source 'apple'): kleur van het bord, eigen icoon, afvinkbaar.
 * Sterren: vastgelegd bij goedkeuring, anders deze keer, anders per titel.
 */
export function externalCards(db: Db, profileId: number, from: string, toExclusive: string): (Card & { source: 'apple' })[] {
  const color = (db.prepare('select color from profiles where id=?').get(profileId) as { color: string } | undefined)?.color ?? '#e0e7ff';
  const rows = db
    .prepare(
      `select e.*, i.icon as icon_override, d.done_at as done_at, d.approved_at as approved_at, d.approved_by as approved_by,
         coalesce(d.points, o.points, p.points, 0) as points
       from external_events e
       left join external_icons i on i.profile_id = e.profile_id and i.title = e.title
       left join external_done d on d.profile_id = e.profile_id and d.uid = e.uid and d.date = e.date
       left join external_points_once o on o.profile_id = e.profile_id and o.uid = e.uid and o.date = e.date
       left join external_points p on p.profile_id = e.profile_id and p.title = e.title
       where e.profile_id=? and e.date >= ? and e.date < ? order by e.date, e.time is null, e.time, e.id`,
    )
    .all(profileId, from, toExclusive) as unknown as {
      id: number; uid: string; title: string; date: string; day_part: DayPart; time: string | null; all_day: number; location: string;
      icon_override: string | null; done_at: string | null; approved_at: string | null; approved_by: number | null; points: number;
    }[];
  return rows.map((r) => ({
    id: -r.id, profile_id: profileId, title: r.title, icon: r.icon_override ?? defaultIcon(r.title, !!r.all_day), color, points: r.points,
    deadline: null, planned_date: r.date, day_part: r.day_part, time: r.time, notes: r.location, created_by: 0,
    recurrence_id: null, origin_date: null, skipped: 0, done_at: r.done_at, approved_at: r.approved_at, approved_by: r.approved_by,
    created_at: '', source: 'apple' as const,
  }));
}

type ExternalRow = { id: number; uid: string; profile_id: number; title: string; date: string };

export function getExternal(db: Db, negativeId: number): ExternalRow {
  const row = db.prepare('select id, uid, profile_id, title, date from external_events where id=?').get(-negativeId) as ExternalRow | undefined;
  if (!row) throw new PlannerError(404, 'Afspraak niet gevonden');
  return row;
}

function externalCard(db: Db, row: ExternalRow): Card {
  return externalCards(db, row.profile_id, row.date, addDays(row.date, 1)).find((c) => c.id === -row.id)!;
}

type DoneRow = { rowid: number; profile_id: number; uid: string; date: string; title: string; done_at: string; points: number | null; approved_at: string | null };

function doneRow(db: Db, row: ExternalRow): DoneRow | undefined {
  return db.prepare('select rowid, * from external_done where profile_id=? and uid=? and date=?').get(row.profile_id, row.uid, row.date) as DoneRow | undefined;
}

export function setExternalDone(db: Db, user: Profile, negativeId: number, done: boolean): Card & { needsApproval: boolean } {
  const row = getExternal(db, negativeId);
  if (!isParent(user) && row.profile_id !== user.id) throw new PlannerError(403, 'Dat is niet jouw bord');
  const existing = doneRow(db, row);
  if (done) {
    if (!existing) {
      db.prepare('insert into external_done(profile_id, uid, date, done_at, title) values (?,?,?,?,?)').run(row.profile_id, row.uid, row.date, nowIso(), row.title);
    }
  } else if (existing) {
    if (existing.approved_at && !isParent(user)) throw new PlannerError(409, 'Al goedgekeurd door papa of mama');
    db.prepare('delete from external_done where rowid=?').run(existing.rowid);
  }
  const card = externalCard(db, row);
  return { ...card, needsApproval: card.points > 0 && !card.approved_at };
}

/** Sterren voor alle afspraken met deze titel op dit bord, of alleen voor deze ene keer. Alleen ouders. */
export function setExternalPoints(db: Db, negativeId: number, points: number, scope: 'title' | 'once'): Card {
  const row = getExternal(db, negativeId);
  if (doneRow(db, row)?.approved_at) throw new PlannerError(409, 'Al goedgekeurd; de sterren staan vast');
  if (scope === 'title') {
    db.prepare('delete from external_points_once where profile_id=? and uid=? and date=?').run(row.profile_id, row.uid, row.date);
    db.prepare('insert or replace into external_points(profile_id, title, points) values (?,?,?)').run(row.profile_id, row.title, points);
  } else {
    db.prepare('insert or replace into external_points_once(profile_id, uid, date, points) values (?,?,?,?)').run(row.profile_id, row.uid, row.date, points);
  }
  return externalCard(db, row);
}

/** Sterren die nu voor een afgevinkte afspraak gelden (nog niet vastgelegd). */
function livePoints(db: Db, d: DoneRow): number {
  const once = db.prepare('select points from external_points_once where profile_id=? and uid=? and date=?').get(d.profile_id, d.uid, d.date) as { points: number } | undefined;
  if (once) return once.points;
  const byTitle = db.prepare('select points from external_points where profile_id=? and title=?').get(d.profile_id, d.title) as { points: number } | undefined;
  return byTitle?.points ?? 0;
}

export interface PendingExternal { doneId: number; profile_id: number; title: string; icon: string; date: string; points: number; done_at: string }

/** Afgevinkte agenda-afspraken met sterren die op goedkeuring wachten. */
export function pendingExternal(db: Db): PendingExternal[] {
  const rows = db.prepare(
    `select d.rowid, d.*, i.icon as icon_override from external_done d
     left join external_icons i on i.profile_id = d.profile_id and i.title = d.title
     where d.approved_at is null order by d.done_at`,
  ).all() as unknown as (DoneRow & { icon_override: string | null })[];
  return rows
    .map((d) => ({ doneId: d.rowid, profile_id: d.profile_id, title: d.title, icon: d.icon_override ?? defaultIcon(d.title, false), date: d.date, points: livePoints(db, d), done_at: d.done_at }))
    .filter((d) => d.points > 0);
}

function getDone(db: Db, doneId: number): DoneRow {
  const d = db.prepare('select rowid, * from external_done where rowid=?').get(doneId) as DoneRow | undefined;
  if (!d) throw new PlannerError(404, 'Afgevinkte afspraak niet gevonden');
  return d;
}

/** Goedkeuren legt de sterren vast, zodat latere wijzigingen of een sync ze niet meer raken. */
export function approveExternal(db: Db, parent: Profile, doneId: number): void {
  const d = getDone(db, doneId);
  db.prepare('update external_done set points=?, approved_at=?, approved_by=? where rowid=?').run(livePoints(db, d), nowIso(), parent.id, doneId);
}

export function rejectExternal(db: Db, doneId: number): void {
  getDone(db, doneId);
  db.prepare('delete from external_done where rowid=?').run(doneId);
}

/** Zelfde als approveExternal/rejectExternal, maar vanaf de kaart (negatieve id). */
export function doneIdForCard(db: Db, negativeId: number): number {
  const d = doneRow(db, getExternal(db, negativeId));
  if (!d) throw new PlannerError(409, 'Afspraak is nog niet afgevinkt');
  return d.rowid;
}

/** Icoon voor alle afspraken met deze titel op dit bord. */
export function setExternalIcon(db: Db, user: Profile, negativeId: number, icon: string): Card {
  const row = getExternal(db, negativeId);
  if (!isParent(user) && row.profile_id !== user.id) throw new PlannerError(403, 'Dat is niet jouw bord');
  db.prepare('insert or replace into external_icons(profile_id, title, icon) values (?,?,?)').run(row.profile_id, row.title, icon);
  return externalCard(db, row);
}

export interface SyncStatus { configured: boolean; calendars: string[]; lastSync: string | null; lastError: string | null; count: number; running: boolean }
const status: SyncStatus = { configured: false, calendars: [], lastSync: null, lastError: null, count: 0, running: false };

export function syncStatus(db: Db): SyncStatus {
  return { ...status, count: (db.prepare('select count(*) as n from external_events').get() as { n: number }).n };
}

export async function fetchIcs(cfg: CaldavConfig, range: Range): Promise<{ mapping: CalendarMapping; ics: string[] }[]> {
  const client = await createDAVClient({
    serverUrl: cfg.url,
    credentials: { username: cfg.username, password: cfg.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
  const calendars = await client.fetchCalendars();
  const eventCals = calendars.filter((c) => !c.components || c.components.includes('VEVENT'));
  const timeRange = { start: new Date(range.from + 'T00:00:00Z').toISOString(), end: new Date(range.toExclusive + 'T00:00:00Z').toISOString() };
  const out: { mapping: CalendarMapping; ics: string[] }[] = [];
  for (const mapping of cfg.calendars) {
    const cal = eventCals.find((c) => String(c.displayName ?? '').toLowerCase() === mapping.name.toLowerCase());
    if (!cal) throw new Error(`Agenda "${mapping.name}" niet gevonden. Beschikbaar: ${eventCals.map((c) => c.displayName).join(', ')}`);
    const objects = await client.fetchCalendarObjects({ calendar: cal, timeRange });
    out.push({ mapping, ics: objects.map((o) => o.data as string).filter(Boolean) });
  }
  return out;
}

export async function syncOnce(db: Db, cfg: CaldavConfig, profiles: Profile[]): Promise<SyncStatus> {
  status.configured = true; status.calendars = cfg.calendars.map((c) => c.name); status.running = true;
  try {
    const range = syncRange();
    const fetched = await fetchIcs(cfg, range);
    const events = fetched.flatMap(({ mapping, ics }) => icsToEvents(ics, range, profiles, resolveTargets(mapping.targets, profiles)));
    storeEvents(db, events, range);
    status.lastSync = nowIso(); status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    console.error('CalDAV sync mislukt:', status.lastError);
  } finally { status.running = false; }
  return syncStatus(db);
}

export function startSyncLoop(db: Db, cfg: CaldavConfig | null, listProfiles: () => Profile[], minutes = 10): void {
  if (!cfg) { console.log('CalDAV niet geconfigureerd (CALDAV_USER, CALDAV_PASSWORD, CALDAV_CALENDARS)'); return; }
  status.configured = true; status.calendars = cfg.calendars.map((c) => c.name);
  const run = () => syncOnce(db, cfg, listProfiles());
  run();
  setInterval(run, minutes * 60_000).unref();
}
