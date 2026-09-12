import type { Db } from '../db.js';
import { addDays, today } from '../dates.js';
import type { Card } from '../types.js';
import { balance, streak } from './points.js';
import { materializeWeek } from './recurrences.js';

export interface WeekView {
  weekStart: string;
  cards: Card[];
  stack: Card[];
  balance: number;
  streak: number;
}

const ORDER = `order by planned_date, case day_part when 'ochtend' then 1 when 'middag' then 2 when 'namiddag' then 3 else 4 end, time is null, time, id`;

export function cardsForRange(db: Db, profileId: number, from: string, toExclusive: string): Card[] {
  return db
    .prepare(`select * from cards where profile_id=? and skipped=0 and planned_date >= ? and planned_date < ? ${ORDER}`)
    .all(profileId, from, toExclusive) as unknown as Card[];
}

export function stackFor(db: Db, profileId: number): Card[] {
  return db
    .prepare('select * from cards where profile_id=? and skipped=0 and planned_date is null order by deadline is null, deadline, id')
    .all(profileId) as unknown as Card[];
}

export function getWeek(db: Db, profileId: number, weekStart: string): WeekView {
  materializeWeek(db, profileId, weekStart);
  return {
    weekStart,
    cards: cardsForRange(db, profileId, weekStart, addDays(weekStart, 7)),
    stack: stackFor(db, profileId),
    balance: balance(db, profileId),
    streak: streak(db, profileId, today()),
  };
}
