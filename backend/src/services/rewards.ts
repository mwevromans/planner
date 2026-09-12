import { z } from 'zod';
import type { Db } from '../db.js';
import { nowIso } from '../dates.js';
import { PlannerError, type Profile, type Redemption, type Reward } from '../types.js';
import { balance, reserved } from './points.js';

export const rewardInput = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.string().min(1).max(8),
  cost: z.number().int().min(1).max(100000),
  active: z.boolean().default(true),
});
export const rewardPatch = rewardInput.partial();

export function listRewards(db: Db, onlyActive: boolean): Reward[] {
  const sql = onlyActive ? 'select * from rewards where active=1 order by cost, id' : 'select * from rewards order by active desc, cost, id';
  return db.prepare(sql).all() as unknown as Reward[];
}

export function getReward(db: Db, id: number): Reward {
  const r = db.prepare('select * from rewards where id=?').get(id) as unknown as Reward | undefined;
  if (!r) throw new PlannerError(404, 'Beloning niet gevonden');
  return r;
}

export function createReward(db: Db, input: z.infer<typeof rewardInput>): Reward {
  const r = db.prepare('insert into rewards(title, icon, cost, active) values (?,?,?,?)')
    .run(input.title, input.icon, input.cost, input.active ? 1 : 0);
  return getReward(db, Number(r.lastInsertRowid));
}

export function updateReward(db: Db, id: number, patch: z.infer<typeof rewardPatch>): Reward {
  const cur = getReward(db, id);
  db.prepare('update rewards set title=?, icon=?, cost=?, active=? where id=?').run(
    patch.title ?? cur.title, patch.icon ?? cur.icon, patch.cost ?? cur.cost,
    patch.active === undefined ? cur.active : patch.active ? 1 : 0, id,
  );
  return getReward(db, id);
}

export function deleteReward(db: Db, id: number): void {
  getReward(db, id);
  const used = (db.prepare('select count(*) as n from redemptions where reward_id=?').get(id) as { n: number }).n;
  if (used > 0) db.prepare('update rewards set active=0 where id=?').run(id);
  else db.prepare('delete from rewards where id=?').run(id);
}

export type RedemptionView = Redemption & { title: string; icon: string; status: 'wacht' | 'gekregen' | 'nee' };

export function listRedemptions(db: Db, profileId?: number): RedemptionView[] {
  const where = profileId ? 'where r.profile_id=?' : '';
  const rows = db
    .prepare(`select r.*, w.title, w.icon from redemptions r join rewards w on w.id=r.reward_id ${where} order by r.requested_at desc, r.id desc`)
    .all(...(profileId ? [profileId] : [])) as unknown as (Redemption & { title: string; icon: string })[];
  return rows.map((r) => ({ ...r, status: r.approved_at ? 'gekregen' : r.denied_at ? 'nee' : 'wacht' }));
}

export function pendingRedemptions(db: Db): RedemptionView[] {
  return listRedemptions(db).filter((r) => r.status === 'wacht');
}

export function requestRedemption(db: Db, user: Profile, rewardId: number): RedemptionView {
  const reward = getReward(db, rewardId);
  if (!reward.active) throw new PlannerError(404, 'Beloning niet gevonden');
  const available = balance(db, user.id) - reserved(db, user.id);
  if (available < reward.cost) throw new PlannerError(409, 'Niet genoeg punten');
  const r = db.prepare('insert into redemptions(profile_id, reward_id, cost) values (?,?,?)').run(user.id, reward.id, reward.cost);
  return listRedemptions(db).find((x) => x.id === Number(r.lastInsertRowid))!;
}

function getRedemption(db: Db, id: number): Redemption {
  const r = db.prepare('select * from redemptions where id=?').get(id) as unknown as Redemption | undefined;
  if (!r) throw new PlannerError(404, 'Aanvraag niet gevonden');
  return r;
}

export function approveRedemption(db: Db, parent: Profile, id: number): RedemptionView {
  const r = getRedemption(db, id);
  if (r.approved_at || r.denied_at) throw new PlannerError(409, 'Al afgehandeld');
  db.prepare('update redemptions set approved_at=?, approved_by=? where id=?').run(nowIso(), parent.id, id);
  return listRedemptions(db).find((x) => x.id === id)!;
}

export function denyRedemption(db: Db, id: number): RedemptionView {
  const r = getRedemption(db, id);
  if (r.approved_at || r.denied_at) throw new PlannerError(409, 'Al afgehandeld');
  db.prepare('update redemptions set denied_at=? where id=?').run(nowIso(), id);
  return listRedemptions(db).find((x) => x.id === id)!;
}
