import { familyProfileId, type Db } from '../db.js';
import { addDays, today } from '../dates.js';
import type { Card } from '../types.js';
import { balance, streak } from './points.js';
import { materializeWeek } from './recurrences.js';
import { externalCards } from './caldav.js';

export interface WeekView {
  weekStart: string;
  cards: Card[];
  stack: Card[];
  /** Familie-evenementen in deze week (alleen-lezen op een persoonlijk bord). */
  family: Card[];
  balance: number;
  streak: number;
}

const ORDER = `order by planned_date, case day_part when 'ochtend' then 1 when 'middag' then 2 when 'namiddag' then 3 else 4 end, time is null, time, id`;

const PART_RANK: Record<string, number> = { ochtend: 1, middag: 2, namiddag: 3, avond: 4 };

/** Eigen kaarten plus alleen-lezen afspraken uit de gekoppelde agenda, op dag, dagdeel en tijd. */
export function cardsForRange(db: Db, profileId: number, from: string, toExclusive: string): Card[] {
  const own = db
    .prepare(`select * from cards where profile_id=? and skipped=0 and planned_date >= ? and planned_date < ? ${ORDER}`)
    .all(profileId, from, toExclusive) as unknown as Card[];
  const ext = externalCards(db, profileId, from, toExclusive);
  if (ext.length === 0) return own;
  return [...own, ...ext].sort((a, b) =>
    (a.planned_date ?? '').localeCompare(b.planned_date ?? '')
    || PART_RANK[a.day_part ?? ''] - PART_RANK[b.day_part ?? '']
    || Number(a.time === null) - Number(b.time === null)
    || (a.time ?? '').localeCompare(b.time ?? ''));
}

export function stackFor(db: Db, profileId: number): Card[] {
  return db
    .prepare('select * from cards where profile_id=? and skipped=0 and planned_date is null order by deadline is null, deadline, id')
    .all(profileId) as unknown as Card[];
}

export function getWeek(db: Db, profileId: number, weekStart: string): WeekView {
  materializeWeek(db, profileId, weekStart);
  const fam = familyProfileId(db);
  if (fam !== profileId) materializeWeek(db, fam, weekStart);
  return {
    weekStart,
    cards: cardsForRange(db, profileId, weekStart, addDays(weekStart, 7)),
    stack: stackFor(db, profileId),
    family: fam === profileId ? [] : cardsForRange(db, fam, weekStart, addDays(weekStart, 7)),
    balance: balance(db, profileId),
    streak: streak(db, profileId, today()),
  };
}
