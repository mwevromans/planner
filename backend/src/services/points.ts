import type { Db } from '../db.js';
import { addDays } from '../dates.js';

export function balance(db: Db, profileId: number): number {
  const earned = (db
    .prepare('select coalesce(sum(points),0) as s from cards where profile_id=? and approved_at is not null and skipped=0')
    .get(profileId) as { s: number }).s;
  const spent = (db
    .prepare('select coalesce(sum(cost),0) as s from redemptions where profile_id=? and approved_at is not null')
    .get(profileId) as { s: number }).s;
  return earned - spent;
}

/** Punten die in openstaande inwisselaanvragen vastzitten. */
export function reserved(db: Db, profileId: number): number {
  return (db
    .prepare('select coalesce(sum(cost),0) as s from redemptions where profile_id=? and approved_at is null and denied_at is null')
    .get(profileId) as { s: number }).s;
}

function dayCounts(db: Db, profileId: number, date: string): { total: number; done: number } {
  return db
    .prepare(
      `select count(*) as total, sum(case when done_at is not null then 1 else 0 end) as done
       from cards where profile_id=? and planned_date=? and skipped=0`,
    )
    .get(profileId, date) as { total: number; done: number };
}

/** Dagen op rij (tot en met vandaag, of gisteren als vandaag nog open staat) waarop alles gepland was afgevinkt. */
export function streak(db: Db, profileId: number, today: string): number {
  const t = dayCounts(db, profileId, today);
  let d = t.total > 0 && t.done === t.total ? today : addDays(today, -1);
  let n = 0;
  for (let i = 0; i < 365; i++) {
    const c = dayCounts(db, profileId, d);
    if (c.total === 0 || c.done < c.total) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}
