import { Router } from 'express';
import type { Db } from '../db.js';
import { requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import {
  approveCard, cardInput, cardPatch, createCard, deleteCard, markDone, markUndone, rejectCard, updateCard,
} from '../services/cards.js';
import { idParam } from './util.js';

export function cardRoutes(db: Db) {
  const r = Router();
  r.use(requireAuth(db));
  const user = (req: unknown) => (req as AuthedRequest).user;

  r.post('/cards', (req, res) => res.status(201).json(createCard(db, user(req), cardInput.parse(req.body))));
  r.patch('/cards/:id', (req, res) => res.json(updateCard(db, user(req), idParam(req), cardPatch.parse(req.body))));
  r.delete('/cards/:id', (req, res) => { deleteCard(db, user(req), idParam(req)); res.status(204).end(); });

  r.post('/cards/:id/done', (req, res) => res.json(markDone(db, user(req), idParam(req))));
  r.post('/cards/:id/undone', (req, res) => res.json(markUndone(db, user(req), idParam(req))));
  r.post('/cards/:id/approve', requireParent, (req, res) => res.json(approveCard(db, user(req), idParam(req))));
  r.post('/cards/:id/reject', requireParent, (req, res) => res.json(rejectCard(db, user(req), idParam(req))));

  return r;
}
