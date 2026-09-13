import { getSession, setSession } from './session';
import type { Approvals, Card, DayPart, FamilyWeek, Overview, Profile, Recurrence, Redemption, Reward, WeekView } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getSession()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && token) setSession(null);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Er ging iets mis');
  return data as T;
}

export const api = {
  login: (profileId: number, pin?: string) => call<{ token: string; profile: Profile }>('POST', '/login', { profileId, pin }),
  profiles: () => call<Profile[]>('GET', '/profiles'),
  createProfile: (p: Partial<Profile> & { pin?: string | null }) => call<Profile>('POST', '/profiles', p),
  updateProfile: (id: number, p: Partial<Profile> & { pin?: string | null }) => call<Profile>('PATCH', `/profiles/${id}`, p),
  deleteProfile: (id: number) => call<void>('DELETE', `/profiles/${id}`),

  week: (kidId: number, start: string) => call<WeekView>('GET', `/kids/${kidId}/week?start=${start}`),
  createCard: (c: CardInput) => call<Card>('POST', '/cards', c),
  updateCard: (id: number, c: Partial<CardInput>) => call<Card>('PATCH', `/cards/${id}`, c),
  moveCard: (id: number, plannedDate: string | null, dayPart: DayPart | null) => call<Card>('PATCH', `/cards/${id}`, { plannedDate, dayPart }),
  deleteCard: (id: number) => call<void>('DELETE', `/cards/${id}`),
  done: (id: number) => call<Card & { needsApproval: boolean }>('POST', `/cards/${id}/done`),
  undone: (id: number) => call<Card>('POST', `/cards/${id}/undone`),
  approveCard: (id: number) => call<Card>('POST', `/cards/${id}/approve`),
  rejectCard: (id: number) => call<Card>('POST', `/cards/${id}/reject`),

  recurrences: (profileId?: number) => call<Recurrence[]>('GET', `/recurrences${profileId ? `?profileId=${profileId}` : ''}`),
  createRecurrence: (r: RecurrenceInput) => call<Recurrence>('POST', '/recurrences', r),
  updateRecurrence: (id: number, r: Partial<RecurrenceInput>) => call<Recurrence>('PATCH', `/recurrences/${id}`, r),
  deleteRecurrence: (id: number) => call<void>('DELETE', `/recurrences/${id}`),

  rewards: () => call<Reward[]>('GET', '/rewards'),
  createReward: (r: Omit<Reward, 'id' | 'active'> & { active?: boolean }) => call<Reward>('POST', '/rewards', r),
  updateReward: (id: number, r: Partial<Omit<Reward, 'id' | 'active'>> & { active?: boolean }) => call<Reward>('PATCH', `/rewards/${id}`, r),
  deleteReward: (id: number) => call<void>('DELETE', `/rewards/${id}`),
  redemptions: (profileId: number) => call<{ balance: number; reserved: number; available: number; items: Redemption[] }>('GET', `/redemptions?profileId=${profileId}`),
  requestRedemption: (rewardId: number) => call<Redemption>('POST', '/redemptions', { rewardId }),
  approveRedemption: (id: number) => call<Redemption>('POST', `/redemptions/${id}/approve`),
  denyRedemption: (id: number) => call<Redemption>('POST', `/redemptions/${id}/deny`),
  approvals: () => call<Approvals>('GET', '/approvals'),

  overview: (date: string) => call<Overview>('GET', `/overview?date=${date}`),
  syncStatus: () => call<SyncStatus>('GET', '/sync/status'),
  syncNow: () => call<SyncStatus>('POST', '/sync/now'),
  familyWeek: (start: string) => call<FamilyWeek>('GET', `/family-week?start=${start}`),
};

export interface CardInput {
  profileId: number;
  title: string;
  icon: string;
  color: string;
  points?: number;
  deadline?: string | null;
  plannedDate?: string | null;
  dayPart?: DayPart | null;
  time?: string | null;
  notes?: string;
}

export interface RecurrenceInput {
  profileId: number;
  title: string;
  icon: string;
  color: string;
  points?: number;
  weekdays: number[];
  dayPart: DayPart;
  time?: string | null;
  active?: boolean;
}

export interface SyncStatus { configured: boolean; calendar: string | null; lastSync: string | null; lastError: string | null; count: number; running: boolean }
