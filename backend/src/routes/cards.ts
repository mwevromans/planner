import { Router } from 'express';
import type { Db } from '../db.js';
import { requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import {
  approveCard, cardInput, cardPatch, createCard, deleteCard, markDone, markUndone, rejectCard, updateCard,
} from '../services/cards.js';
import { idParam } from './util.js';
import {
  approveExternal, doneIdForCard, rejectExternal, setExternalDone, setExternalIcon, setExternalPoints,
} from '../services/caldav.js';
import { isParent } from '../auth.js';
import { setFamilyHidden } from '../services/week.js';
import { z } from 'zod';
import { PlannerError } from '../types.js';

export function cardRoutes(db: Db) {
  const r = Router();
  r.use(requireAuth(db));
  const user = (req: unknown) => (req as AuthedRequest).user;

  const rawId = (req: { params: Record<string, string> }) => Number(req.params.id);
  const isExternal = (req: { params: Record<string, string> }) => Number.isInteger(rawId(req)) && rawId(req) < 0;

  r.post('/cards', (req, res) => res.status(201).json(createCard(db, user(req), cardInput.parse(req.body))));
  r.patch('/cards/:id', (req, res) => {
    if (isExternal(req)) {
      const stars = z.object({ points: z.number().int().min(0).max(1000), scope: z.enum(['title', 'once']) }).strict().safeParse(req.body);
      if (stars.success) {
        if (!isParent(user(req))) throw new PlannerError(403, 'Alleen een ouder mag punten geven');
        return res.json(setExternalPoints(db, rawId(req), stars.data.points, stars.data.scope));
      }
      const body = z.object({ icon: z.string().min(1).max(8) }).strict().safeParse(req.body);
      if (!body.success) throw new PlannerError(400, 'Van een agenda-afspraak kun je alleen het icoontje en de sterren aanpassen');
      return res.json(setExternalIcon(db, user(req), rawId(req), body.data.icon));
    }
    res.json(updateCard(db, user(req), idParam(req), cardPatch.parse(req.body)));
  });
  r.delete('/cards/:id', (req, res) => { deleteCard(db, user(req), idParam(req)); res.status(204).end(); });

  r.post('/cards/:id/done', (req, res) => {
    if (isExternal(req)) return res.json(setExternalDone(db, user(req), rawId(req), true));
    res.json(markDone(db, user(req), idParam(req)));
  });
  r.post('/cards/:id/undone', (req, res) => {
    if (isExternal(req)) return res.json(setExternalDone(db, user(req), rawId(req), false));
    res.json(markUndone(db, user(req), idParam(req)));
  });
  r.post('/cards/:id/approve', requireParent, (req, res) => {
    if (isExternal(req)) { approveExternal(db, user(req), doneIdForCard(db, rawId(req))); return res.status(204).end(); }
    res.json(approveCard(db, user(req), idParam(req)));
  });
  r.post('/cards/:id/reject', requireParent, (req, res) => res.json(rejectCard(db, user(req), idParam(req))));
  r.post('/family-hidden', requireParent, (req, res) => {
    const { title, hidden } = z.object({ title: z.string().min(1).max(200), hidden: z.boolean() }).parse(req.body);
    setFamilyHidden(db, title, hidden);
    res.status(204).end();
  });
  r.post('/external-done/:id/approve', requireParent, (req, res) => { approveExternal(db, user(req), idParam(req)); res.status(204).end(); });
  r.post('/external-done/:id/reject', requireParent, (req, res) => { rejectExternal(db, idParam(req)); res.status(204).end(); });

  return r;
}
