import { Router } from 'express';
import type { Db } from '../db.js';
import { requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import {
  approveCard, cardInput, cardPatch, createCard, deleteCard, markDone, markUndone, rejectCard, updateCard,
} from '../services/cards.js';
import { idParam } from './util.js';
import { setExternalDone, setExternalIcon } from '../services/caldav.js';
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
      const body = z.object({ icon: z.string().min(1).max(8) }).strict().safeParse(req.body);
      if (!body.success) throw new PlannerError(400, 'Van een agenda-afspraak kun je alleen het icoontje aanpassen');
      return res.json(setExternalIcon(db, user(req), rawId(req), body.data.icon));
    }
    res.json(updateCard(db, user(req), idParam(req), cardPatch.parse(req.body)));
  });
  r.delete('/cards/:id', (req, res) => { deleteCard(db, user(req), idParam(req)); res.status(204).end(); });

  r.post('/cards/:id/done', (req, res) => {
    if (isExternal(req)) return res.json({ ...setExternalDone(db, user(req), rawId(req), true), needsApproval: false });
    res.json(markDone(db, user(req), idParam(req)));
  });
  r.post('/cards/:id/undone', (req, res) => {
    if (isExternal(req)) return res.json(setExternalDone(db, user(req), rawId(req), false));
    res.json(markUndone(db, user(req), idParam(req)));
  });
  r.post('/cards/:id/approve', requireParent, (req, res) => res.json(approveCard(db, user(req), idParam(req))));
  r.post('/cards/:id/reject', requireParent, (req, res) => res.json(rejectCard(db, user(req), idParam(req))));

  return r;
}
