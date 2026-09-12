import { z } from 'zod';
import type { Db } from '../db.js';
import { addDays, weekday } from '../dates.js';
import { DAY_PARTS, PlannerError, type Profile, type Recurrence } from '../types.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Tijd moet HH:MM zijn');

export const recurrenceInput = z.object({
  profileId: z.number().int(),
  title: z.string().trim().min(1).max(80),
  icon: z.string().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  points: z.number().int().min(0).max(1000).default(0),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  dayPart: z.enum(DAY_PARTS as [string, ...string[]]),
  time: hhmm.nullable().optional(),
  active: z.boolean().default(true),
});
export const recurrencePatch = recurrenceInput.omit({ profileId: true }).partial();

export function listRecurrences(db: Db, profileId?: number): Recurrence[] {
  const rows = profileId
    ? db.prepare('select * from recurrences where profile_id=? order by id').all(profileId)
    : db.prepare('select * from recurrences order by profile_id, id').all();
  return rows as unknown as Recurrence[];
}

export function getRecurrence(db: Db, id: number): Recurrence {
  const r = db.prepare('select * from recurrences where id=?').get(id) as unknown as Recurrence | undefined;
  if (!r) throw new PlannerError(404, 'Herhaling niet gevonden');
  return r;
}

export function createRecurrence(db: Db, parent: Profile, input: z.infer<typeof recurrenceInput>): Recurrence {
  const r = db
    .prepare(
      `insert into recurrences(profile_id, title, icon, color, points, weekdays, day_part, time, active, created_by)
       values (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.profileId, input.title, input.icon, input.color, input.points,
      JSON.stringify([...new Set(input.weekdays)].sort()), input.dayPart, input.time ?? null, input.active ? 1 : 0, parent.id,
    );
  return getRecurrence(db, Number(r.lastInsertRowid));
}

export function updateRecurrence(db: Db, id: number, patch: z.infer<typeof recurrencePatch>): Recurrence {
  const cur = getRecurrence(db, id);
  const next = {
    title: patch.title ?? cur.title,
    icon: patch.icon ?? cur.icon,
    color: patch.color ?? cur.color,
    points: patch.points ?? cur.points,
    weekdays: patch.weekdays ? JSON.stringify([...new Set(patch.weekdays)].sort()) : cur.weekdays,
    day_part: patch.dayPart ?? cur.day_part,
    time: patch.time === undefined ? cur.time : patch.time,
    active: patch.active === undefined ? cur.active : patch.active ? 1 : 0,
  };
  db.prepare('update recurrences set title=?, icon=?, color=?, points=?, weekdays=?, day_part=?, time=?, active=? where id=?')
    .run(next.title, next.icon, next.color, next.points, next.weekdays, next.day_part, next.time, next.active, id);
  return getRecurrence(db, id);
}

/** Verwijdert de herhaling en toekomstige, nog niet afgevinkte instanties. Afgevinkte blijven staan als los kaartje. */
export function deleteRecurrence(db: Db, id: number, today: string): void {
  getRecurrence(db, id);
  db.prepare('delete from cards where recurrence_id=? and done_at is null and planned_date >= ?').run(id, today);
  db.prepare('delete from recurrences where id=?').run(id);
}

/** Maakt voor de week vanaf `weekStart` ontbrekende instanties aan van actieve herhalingen. */
export function materializeWeek(db: Db, profileId: number, weekStart: string): void {
  const recs = (db.prepare('select * from recurrences where profile_id=? and active=1').all(profileId) as unknown as Recurrence[]);
  if (recs.length === 0) return;
  const ins = db.prepare(
    `insert or ignore into cards(profile_id, title, icon, color, points, planned_date, day_part, time, created_by, recurrence_id, origin_date)
     values (?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const rec of recs) {
    const days = JSON.parse(rec.weekdays) as number[];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      if (!days.includes(weekday(date))) continue;
      ins.run(profileId, rec.title, rec.icon, rec.color, rec.points, date, rec.day_part, rec.time, rec.created_by, rec.id, date);
    }
  }
}
