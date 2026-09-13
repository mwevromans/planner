import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';
import { PlannerError, type Profile } from './types.js';

const tokens = new Map<string, number>();

export type PublicProfile = Omit<Profile, 'pin'> & { hasPin: boolean };

export function login(db: Db, profileId: number, pin?: string): { token: string; profile: PublicProfile } | null {
  const profile = db.prepare('select * from profiles where id = ?').get(profileId) as Profile | undefined;
  if (!profile || profile.role === 'family') return null;
  if (profile.pin && profile.pin !== pin) return null;
  const token = randomUUID();
  tokens.set(token, profile.id);
  return { token, profile: publicProfile(profile) };
}

export function publicProfile(p: Profile): PublicProfile {
  const { pin, ...rest } = p;
  return { ...rest, hasPin: !!pin };
}

export type AuthedRequest = Request & { user: Profile };

export function requireAuth(db: Db) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const id = tokens.get(token);
    const profile = id ? (db.prepare('select * from profiles where id = ?').get(id) as Profile | undefined) : undefined;
    if (!profile) return next(new PlannerError(401, 'Niet ingelogd'));
    (req as AuthedRequest).user = profile;
    next();
  };
}

export function requireParent(req: Request, _res: Response, next: NextFunction) {
  const user = (req as AuthedRequest).user;
  if (user?.role !== 'parent') return next(new PlannerError(403, 'Alleen voor ouders'));
  next();
}

export function isParent(user: Profile): boolean {
  return user.role === 'parent';
}

/** Mag deze gebruiker bij de gegevens van dit profiel? */
export function canAccess(user: Profile, profileId: number): boolean {
  return isParent(user) || user.id === profileId;
}
