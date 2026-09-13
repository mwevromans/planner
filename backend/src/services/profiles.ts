import { z } from 'zod';
import type { Db } from '../db.js';
import { PlannerError, type Profile } from '../types.js';

export const profileInput = z.object({
  name: z.string().trim().min(1).max(40),
  avatar: z.string().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.enum(['kid', 'parent']),
  pin: z.string().regex(/^\d{4,6}$/).nullable().optional(),
  density: z.enum(['simple', 'normal']).default('normal'),
});
export const profilePatch = profileInput.partial();

export function listProfiles(db: Db): Profile[] {
  return db.prepare('select * from profiles order by sort, id').all() as unknown as Profile[];
}

export function getProfile(db: Db, id: number): Profile {
  const p = db.prepare('select * from profiles where id = ?').get(id) as Profile | undefined;
  if (!p) throw new PlannerError(404, 'Profiel niet gevonden');
  return p;
}

export function createProfile(db: Db, input: z.infer<typeof profileInput>): Profile {
  if (input.role === 'parent' && !input.pin) throw new PlannerError(400, 'Een ouder heeft een pincode nodig');
  const sort = ((db.prepare('select coalesce(max(sort),0) as m from profiles').get() as { m: number }).m) + 1;
  const r = db
    .prepare('insert into profiles(name, avatar, color, role, pin, density, sort) values (?,?,?,?,?,?,?)')
    .run(input.name, input.avatar, input.color, input.role, input.pin ?? null, input.density, sort);
  return getProfile(db, Number(r.lastInsertRowid));
}

export function updateProfile(db: Db, id: number, patch: z.infer<typeof profilePatch>): Profile {
  const current = getProfile(db, id);
  if (current.role === 'family' && patch.role) throw new PlannerError(400, 'Het gezinsprofiel houdt zijn rol');
  if (current.role === 'family') { const { role: _r, pin: _p, ...rest } = patch; patch = rest; }
  const next = { ...current, ...patch };
  if (next.role === 'parent' && !next.pin) throw new PlannerError(400, 'Een ouder heeft een pincode nodig');
  db.prepare('update profiles set name=?, avatar=?, color=?, role=?, pin=?, density=? where id=?')
    .run(next.name, next.avatar, next.color, next.role, next.pin ?? null, next.density, id);
  return getProfile(db, id);
}

export function deleteProfile(db: Db, id: number): void {
  getProfile(db, id);
  const parents = (db.prepare("select count(*) as n from profiles where role='parent'").get() as { n: number }).n;
  const target = getProfile(db, id);
  if (target.role === 'family') throw new PlannerError(409, 'Het gezinsprofiel kan niet weg');
  if (target.role === 'parent' && parents <= 1) throw new PlannerError(409, 'De laatste ouder kan niet weg');
  db.prepare('delete from profiles where id = ?').run(id);
}
