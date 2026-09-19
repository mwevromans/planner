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
  role: 'kid' | 'parent' | 'family';
  density: 'simple' | 'normal';
  sort: number;
  hasPin: boolean;
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
  origin_date: string | null;
  done_at: string | null;
  approved_at: string | null;
  /** Alleen-lezen kaart uit een gekoppelde agenda. */
  source?: 'apple';
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

export interface WeekView { weekStart: string; cards: Card[]; stack: Card[]; family: Card[]; balance: number; streak: number }

export interface Approvals {
  cards: (Card & { profile: { name: string; avatar: string } })[];
  redemptions: (Redemption & { profile: { name: string; avatar: string } })[];
}

export interface OverviewMember { profile: Profile; cards: Card[]; balance: number | null; streak: number | null }
export interface Overview { date: string; members: OverviewMember[] }
export interface FamilyWeek { weekStart: string; members: { profile: Profile; cards: Card[] }[] }

export const ROLE_ORDER: Record<Profile['role'], number> = { family: 0, kid: 1, parent: 2 };
export function sortMembers(ps: Profile[]): Profile[] {
  return [...ps].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.sort - b.sort || a.id - b.id);
}

export type TutorEngine = 'claude' | 'codex';
export interface TutorSettings { profile_id: number; enabled: number; daily_cap: number; engine: TutorEngine; extra_prompt: string; usedToday?: number; configured?: boolean }
export interface TutorConversation { id: number; profile_id: number; engine: TutorEngine; session_id: string | null; card_title: string | null; started_at: string; last_at: string; read_by_parent: number; preview?: string; count?: number }
export interface TutorMessage { id: number; conversation_id: number; role: 'kid' | 'tutor'; text: string; created_at: string }
export interface TutorStatus { configured: boolean; reachable: boolean; engines: string[]; unread: number }
