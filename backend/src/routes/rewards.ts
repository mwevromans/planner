import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { canAccess, requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import { PlannerError } from '../types.js';
import { pendingCards } from '../services/cards.js';
import { balance, reserved } from '../services/points.js';
import { listProfiles } from '../services/profiles.js';
import {
  approveRedemption, createReward, deleteReward, denyRedemption, listRedemptions, listRewards,
  pendingRedemptions, requestRedemption, rewardInput, rewardPatch, updateReward,
} from '../services/rewards.js';
import { idParam } from './util.js';

export function rewardRoutes(db: Db) {
  const r = Router();
  r.use(requireAuth(db));
  const user = (req: unknown) => (req as AuthedRequest).user;

  r.get('/rewards', (req, res) => res.json(listRewards(db, user(req).role !== 'parent')));
  r.post('/rewards', requireParent, (req, res) => res.status(201).json(createReward(db, rewardInput.parse(req.body))));
  r.patch('/rewards/:id', requireParent, (req, res) => res.json(updateReward(db, idParam(req), rewardPatch.parse(req.body))));
  r.delete('/rewards/:id', requireParent, (req, res) => { deleteReward(db, idParam(req)); res.status(204).end(); });

  r.get('/redemptions', (req, res) => {
    const pid = req.query.profileId ? Number(req.query.profileId) : undefined;
    if (pid !== undefined && !canAccess(user(req), pid)) throw new PlannerError(403, 'Dat is niet jouw winkeltje');
    if (pid === undefined && user(req).role !== 'parent') throw new PlannerError(403, 'Alleen voor ouders');
    const items = listRedemptions(db, pid);
    if (pid === undefined) return res.json({ items });
    const b = balance(db, pid);
    const rsv = reserved(db, pid);
    res.json({ balance: b, reserved: rsv, available: b - rsv, items });
  });
  r.post('/redemptions', (req, res) => {
    const { rewardId } = z.object({ rewardId: z.number().int() }).parse(req.body);
    if (user(req).role === 'parent') throw new PlannerError(400, 'Alleen kinderen kunnen inwisselen');
    res.status(201).json(requestRedemption(db, user(req), rewardId));
  });
  r.post('/redemptions/:id/approve', requireParent, (req, res) => res.json(approveRedemption(db, user(req), idParam(req))));
  r.post('/redemptions/:id/deny', requireParent, (req, res) => res.json(denyRedemption(db, idParam(req))));

  r.get('/approvals', requireParent, (_req, res) => {
    const names = new Map(listProfiles(db).map((p) => [p.id, { name: p.name, avatar: p.avatar }]));
    res.json({
      cards: pendingCards(db).map((c) => ({ ...c, profile: names.get(c.profile_id) })),
      redemptions: pendingRedemptions(db).map((x) => ({ ...x, profile: names.get(x.profile_id) })),
    });
  });

  return r;
}
