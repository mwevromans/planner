export type DayPart = 'ochtend' | 'middag' | 'namiddag' | 'avond';
export const DAY_PARTS: DayPart[] = ['ochtend', 'middag', 'namiddag', 'avond'];

export type Role = 'kid' | 'parent' | 'family';
export type Density = 'simple' | 'normal';

export interface Profile {
  id: number;
  name: string;
  avatar: string;
  color: string;
  role: Role;
  pin: string | null;
  density: Density;
  sort: number;
  /** Letter(s) tussen haakjes achter een agendatitel die deze persoon aanwijzen, bijv. 's'. */
  tag: string | null;
}

export interface Card {
  id: number;
  profile_id: number;
  title: string;
  icon: string;
  color: string;
  points: number;
  deadline: string | null;
  planned_date: string | null;
  day_part: DayPart | null;
  time: string | null;
  notes: string;
  created_by: number;
  recurrence_id: number | null;
  /** Dag waarvoor deze herhalings-instantie oorspronkelijk is aangemaakt; blijft staan bij verplaatsen. */
  origin_date: string | null;
  skipped: number;
  done_at: string | null;
  approved_at: string | null;
  approved_by: number | null;
  created_at: string;
  /** Gezet voor alleen-lezen kaarten uit een gekoppelde agenda. */
  source?: 'apple';
}

export interface Recurrence {
  id: number;
  profile_id: number;
  title: string;
  icon: string;
  color: string;
  points: number;
  weekdays: string; // JSON array van 1..7
  day_part: DayPart;
  time: string | null;
  active: number;
  created_by: number;
}

export interface Reward {
  id: number;
  title: string;
  icon: string;
  cost: number;
  active: number;
}

export interface Redemption {
  id: number;
  profile_id: number;
  reward_id: number;
  cost: number;
  requested_at: string;
  approved_at: string | null;
  approved_by: number | null;
  denied_at: string | null;
}

export class PlannerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
