import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { login, publicProfile, requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import { PlannerError } from '../types.js';
import { createProfile, deleteProfile, listProfiles, profileInput, profilePatch, updateProfile } from '../services/profiles.js';
import { idParam } from './util.js';

export function profileRoutes(db: Db) {
  const r = Router();

  r.post('/login', (req, res) => {
    const body = z.object({ profileId: z.number().int(), pin: z.string().optional() }).parse(req.body);
    const result = login(db, body.profileId, body.pin);
    if (!result) return res.status(401).json({ error: 'Pincode klopt niet' });
    res.json(result);
  });

  r.get('/profiles', (_req, res) => {
    res.json(listProfiles(db).map(publicProfile));
  });

  r.post('/profiles', requireAuth(db), requireParent, (req, res) => {
    res.status(201).json(publicProfile(createProfile(db, profileInput.parse(req.body))));
  });

  /** Ouders wijzigen alles; een kind alleen de eigen avatar en kleur. */
  const selfPatch = profilePatch.pick({ avatar: true, color: true }).strict();
  r.patch('/profiles/:id', requireAuth(db), (req, res) => {
    const user = (req as AuthedRequest).user;
    const id = idParam(req);
    if (user.role === 'parent') return res.json(publicProfile(updateProfile(db, id, profilePatch.parse(req.body))));
    if (user.id !== id) throw new PlannerError(403, 'Dat is niet jouw profiel');
    const body = selfPatch.safeParse(req.body);
    if (!body.success) throw new PlannerError(403, 'Je mag alleen je avatar en kleur kiezen');
    res.json(publicProfile(updateProfile(db, id, body.data)));
  });

  r.delete('/profiles/:id', requireAuth(db), requireParent, (req, res) => {
    deleteProfile(db, idParam(req));
    res.status(204).end();
  });

  return r;
}
