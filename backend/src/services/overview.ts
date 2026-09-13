import type { Db } from '../db.js';
import { addDays, weekStart } from '../dates.js';
import type { Card } from '../types.js';
import { publicProfile } from '../auth.js';
import { balance, streak } from './points.js';
import { getProfile, listProfiles } from './profiles.js';
import { materializeWeek } from './recurrences.js';
import { cardsForRange } from './week.js';

const ROLE_ORDER = { family: 0, kid: 1, parent: 2 } as const;

function members(db: Db) {
  return listProfiles(db).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.sort - b.sort || a.id - b.id);
}

/** Vandaag voor het hele gezin: Gezin, kinderen, ouders. */
export function overview(db: Db, date: string) {
  return {
    date,
    members: members(db).map((p) => {
      materializeWeek(db, p.id, weekStart(date));
      return {
        profile: publicProfile(p),
        cards: cardsForRange(db, p.id, date, addDays(date, 1)),
        balance: p.role === 'kid' ? balance(db, p.id) : null,
        streak: p.role === 'kid' ? streak(db, p.id, date) : null,
      };
    }),
  };
}

/** Hele week voor het hele gezin, voor het wandbord. */
export function familyWeek(db: Db, start: string) {
  return {
    weekStart: start,
    members: members(db).map((p) => {
      materializeWeek(db, p.id, start);
      return { profile: publicProfile(p), cards: cardsForRange(db, p.id, start, addDays(start, 7)) };
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
