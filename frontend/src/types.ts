export type DayPart = 'ochtend' | 'middag' | 'namiddag' | 'avond';
export const DAY_PARTS: DayPart[] = ['ochtend', 'middag', 'namiddag', 'avond'];
export const DAY_PART_LABEL: Record<DayPart, { label: string; icon: string }> = {
  ochtend: { label: 'Ochtend', icon: '🌅' },
  middag: { label: 'Middag', icon: '☀️' },
  namiddag: { label: 'Na school', icon: '🎒' },
  avond: { label: 'Avond', icon: '🌙' },
};

export interface Profile {
  id: number;
  name: string;
  avatar: string;
  color: string;
  role: 'kid' | 'parent';
  density: 'simple' | 'normal';
  sort: number;
  hasPin: boolean;
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
  origin_date: string | null;
  done_at: string | null;
  approved_at: string | null;
}

export interface Recurrence {
  id: number;
  profile_id: number;
  title: string;
  icon: string;
  color: string;
  points: number;
  weekdays: string;
  day_part: DayPart;
  time: string | null;
  active: number;
}

export interface Reward { id: number; title: string; icon: string; cost: number; active: number }

export interface Redemption {
  id: number; profile_id: number; reward_id: number; cost: number; requested_at: string;
  title: string; icon: string; status: 'wacht' | 'gekregen' | 'nee';
}

export interface WeekView { weekStart: string; cards: Card[]; stack: Card[]; balance: number; streak: number }

export interface Approvals {
  cards: (Card & { profile: { name: string; avatar: string } })[];
  redemptions: (Redemption & { profile: { name: string; avatar: string } })[];
}

export interface OverviewKid { profile: Profile; cards: Card[]; balance: number; streak: number }
export interface Overview { date: string; kids: OverviewKid[] }
