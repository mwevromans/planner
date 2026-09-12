import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { login, publicProfile, requireAuth, requireParent } from '../auth.js';
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

  r.patch('/profiles/:id', requireAuth(db), requireParent, (req, res) => {
    res.json(publicProfile(updateProfile(db, idParam(req), profilePatch.parse(req.body))));
  });

  r.delete('/profiles/:id', requireAuth(db), requireParent, (req, res) => {
    deleteProfile(db, idParam(req));
    res.status(204).end();
  });

  return r;
}
