import { z } from 'zod';
import type { Db } from '../db.js';
import { isIsoDate, nowIso } from '../dates.js';
import { DAY_PARTS, PlannerError, type Card, type Profile } from '../types.js';
import { isParent } from '../auth.js';

const isoDate = z.string().refine(isIsoDate, 'Datum moet YYYY-MM-DD zijn');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Tijd moet HH:MM zijn');

export const cardInput = z.object({
  profileId: z.number().int(),
  title: z.string().trim().min(1).max(80),
  icon: z.string().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  points: z.number().int().min(0).max(1000).default(0),
  deadline: isoDate.nullable().optional(),
  plannedDate: isoDate.nullable().optional(),
  dayPart: z.enum(DAY_PARTS as [string, ...string[]]).nullable().optional(),
  time: hhmm.nullable().optional(),
  notes: z.string().max(500).default(''),
});
export type CardInput = z.infer<typeof cardInput>;

export const cardPatch = cardInput.omit({ profileId: true }).partial();
export type CardPatch = z.infer<typeof cardPatch>;

export function getCard(db: Db, id: number): Card {
  const c = db.prepare('select * from cards where id = ?').get(id) as unknown as Card | undefined;
  if (!c) throw new PlannerError(404, 'Kaart niet gevonden');
  return c;
}

/** Inhoud (titel, deadline, punten, weg) mag door ouder of door de maker. */
export function canEditContent(user: Profile, card: Card): boolean {
  return isParent(user) || card.created_by === user.id;
}
/** Verplaatsen en afvinken mag door ouder of de eigenaar van het bord. */
export function canMove(user: Profile, card: Card): boolean {
  return isParent(user) || card.profile_id === user.id;
}

function checkPlanning(plannedDate: string | null | undefined, dayPart: string | null | undefined) {
  if ((plannedDate ?? null) === null !== ((dayPart ?? null) === null)) {
    throw new PlannerError(400, 'Datum en dagdeel horen bij elkaar');
  }
}

export function createCard(db: Db, user: Profile, input: CardInput): Card {
  if (!isParent(user) && input.profileId !== user.id) throw new PlannerError(403, 'Dat is niet jouw bord');
  if (!isParent(user) && input.points > 0) throw new PlannerError(403, 'Alleen een ouder mag punten geven');
  checkPlanning(input.plannedDate, input.dayPart);
  const r = db
    .prepare(
      `insert into cards(profile_id, title, icon, color, points, deadline, planned_date, day_part, time, notes, created_by)
       values (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.profileId, input.title, input.icon, input.color, input.points,
      input.deadline ?? null, input.plannedDate ?? null, input.dayPart ?? null, input.time ?? null,
      input.notes, user.id,
    );
  return getCard(db, Number(r.lastInsertRowid));
}

const CONTENT_KEYS: (keyof CardPatch)[] = ['title', 'icon', 'color', 'points', 'deadline', 'notes'];

export function updateCard(db: Db, user: Profile, id: number, patch: CardPatch): Card {
  const card = getCard(db, id);
  if (!canMove(user, card)) throw new PlannerError(403, 'Dat is niet jouw kaart');
  const touchesContent = CONTENT_KEYS.some((k) => k in patch);
  if (touchesContent && !canEditContent(user, card)) throw new PlannerError(403, 'Deze kaart is van papa of mama');
  if (!isParent(user) && patch.points !== undefined && patch.points > 0) throw new PlannerError(403, 'Alleen een ouder mag punten geven');

  const next = {
    title: patch.title ?? card.title,
    icon: patch.icon ?? card.icon,
    color: patch.color ?? card.color,
    points: patch.points ?? card.points,
    deadline: patch.deadline === undefined ? card.deadline : patch.deadline,
    planned_date: patch.plannedDate === undefined ? card.planned_date : patch.plannedDate,
    day_part: patch.dayPart === undefined ? card.day_part : patch.dayPart,
    time: patch.time === undefined ? card.time : patch.time,
    notes: patch.notes ?? card.notes,
  };
  // Naar de stapel: dagdeel gaat mee weg.
  if (patch.plannedDate === null) next.day_part = null;
  checkPlanning(next.planned_date, next.day_part);

  db.prepare(
    `update cards set title=?, icon=?, color=?, points=?, deadline=?, planned_date=?, day_part=?, time=?, notes=? where id=?`,
  ).run(next.title, next.icon, next.color, next.points, next.deadline, next.planned_date, next.day_part, next.time, next.notes, id);
  return getCard(db, id);
}

export function deleteCard(db: Db, user: Profile, id: number): void {
  const card = getCard(db, id);
  if (!canEditContent(user, card)) throw new PlannerError(403, 'Deze kaart is van papa of mama');
  if (card.recurrence_id) {
    // Instantie van een herhaling: markeren zodat hij niet terugkomt.
    db.prepare('update cards set skipped=1 where id=?').run(id);
  } else {
    db.prepare('delete from cards where id=?').run(id);
  }
}

export function markDone(db: Db, user: Profile, id: number): Card & { needsApproval: boolean } {
  const card = getCard(db, id);
  if (!canMove(user, card)) throw new PlannerError(403, 'Dat is niet jouw kaart');
  if (!card.done_at) db.prepare('update cards set done_at=? where id=?').run(nowIso(), id);
  const updated = getCard(db, id);
  return { ...updated, needsApproval: updated.points > 0 && !updated.approved_at };
}

export function markUndone(db: Db, user: Profile, id: number): Card {
  const card = getCard(db, id);
  if (!canMove(user, card)) throw new PlannerError(403, 'Dat is niet jouw kaart');
  if (card.approved_at && !isParent(user)) throw new PlannerError(409, 'Al goedgekeurd door papa of mama');
  db.prepare('update cards set done_at=null, approved_at=null, approved_by=null where id=?').run(id);
  return getCard(db, id);
}

export function approveCard(db: Db, parent: Profile, id: number): Card {
  const card = getCard(db, id);
  if (!card.done_at) throw new PlannerError(409, 'Kaart is nog niet afgevinkt');
  db.prepare('update cards set approved_at=?, approved_by=? where id=?').run(nowIso(), parent.id, id);
  return getCard(db, id);
}

export function rejectCard(db: Db, _parent: Profile, id: number): Card {
  getCard(db, id);
  db.prepare('update cards set done_at=null, approved_at=null, approved_by=null where id=?').run(id);
  return getCard(db, id);
}

export function pendingCards(db: Db): Card[] {
  return db
    .prepare('select * from cards where done_at is not null and approved_at is null and points > 0 and skipped=0 order by done_at')
    .all() as unknown as Card[];
}
