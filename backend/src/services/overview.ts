import type { Db } from '../db.js';
import { addDays, weekStart } from '../dates.js';
import type { Card } from '../types.js';
import { publicProfile } from '../auth.js';
import { balance, streak } from './points.js';
import { getProfile, listProfiles } from './profiles.js';
import { materializeWeek } from './recurrences.js';
import { cardsForRange } from './week.js';

export function overview(db: Db, date: string) {
  const kids = listProfiles(db).filter((p) => p.role === 'kid');
  return {
    date,
    kids: kids.map((kid) => {
      materializeWeek(db, kid.id, weekStart(date));
      return {
        profile: publicProfile(kid),
        cards: cardsForRange(db, kid.id, date, addDays(date, 1)),
        balance: balance(db, kid.id),
        streak: streak(db, kid.id, date),
      };
    }),
  };
}

export function summary(db: Db, kidId: number, today: string) {
  const kid = getProfile(db, kidId);
  materializeWeek(db, kid.id, weekStart(today));
  const cards: Card[] = cardsForRange(db, kid.id, today, addDays(today, 1));
  const pending = (db
    .prepare('select count(*) as n from cards where profile_id=? and done_at is not null and approved_at is null and points>0 and skipped=0')
    .get(kid.id) as { n: number }).n;
  return {
    name: kid.name,
    balance: balance(db, kid.id),
    streak: streak(db, kid.id, today),
    todayTotal: cards.length,
    todayDone: cards.filter((c) => c.done_at).length,
    pendingApprovals: pending,
  };
}
