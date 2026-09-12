import { Router } from 'express';
import type { Db } from '../db.js';
import { canAccess, requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import { isIsoDate, today, weekStart } from '../dates.js';
import { PlannerError } from '../types.js';
import { getProfile } from '../services/profiles.js';
import {
  createRecurrence, deleteRecurrence, listRecurrences, recurrenceInput, recurrencePatch, updateRecurrence,
} from '../services/recurrences.js';
import { getWeek } from '../services/week.js';
import { idParam } from './util.js';

export function weekAndRecurrenceRoutes(db: Db) {
  const r = Router();
  r.use(requireAuth(db));
  const user = (req: unknown) => (req as AuthedRequest).user;

  r.get('/kids/:id/week', (req, res) => {
    const kidId = idParam(req);
    if (!canAccess(user(req), kidId)) throw new PlannerError(403, 'Dat is niet jouw bord');
    getProfile(db, kidId);
    const start = typeof req.query.start === 'string' ? req.query.start : weekStart(today());
    if (!isIsoDate(start)) throw new PlannerError(400, 'start moet YYYY-MM-DD zijn');
    if (weekStart(start) !== start) throw new PlannerError(400, 'start moet een maandag zijn');
    res.json(getWeek(db, kidId, start));
  });

  r.get('/recurrences', (req, res) => {
    const pid = req.query.profileId ? Number(req.query.profileId) : undefined;
    if (pid !== undefined && !canAccess(user(req), pid)) throw new PlannerError(403, 'Dat is niet jouw bord');
    if (pid === undefined && user(req).role !== 'parent') throw new PlannerError(403, 'Alleen voor ouders');
    res.json(listRecurrences(db, pid));
  });
  r.post('/recurrences', requireParent, (req, res) => {
    const input = recurrenceInput.parse(req.body);
    getProfile(db, input.profileId);
    res.status(201).json(createRecurrence(db, user(req), input));
  });
  r.patch('/recurrences/:id', requireParent, (req, res) => res.json(updateRecurrence(db, idParam(req), recurrencePatch.parse(req.body))));
  r.delete('/recurrences/:id', requireParent, (req, res) => { deleteRecurrence(db, idParam(req), today()); res.status(204).end(); });

  return r;
}
