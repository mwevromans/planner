import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { requireAuth, requireParent, type AuthedRequest } from '../auth.js';
import { getProfile } from '../services/profiles.js';
import { getCard } from '../services/cards.js';
import {
  bridgeHealth, getConversation, getSettings, listConversations, markRead, sendMessage, settingsPatch, startConversation,
  unreadCount, updateSettings, usedToday, type BridgeCall,
} from '../services/tutor.js';
import { idParam, wrap } from './util.js';

export function tutorRoutes(db: Db, bridge: BridgeCall | null) {
  const r = Router();
  r.use(requireAuth(db));
  const user = (req: unknown) => (req as AuthedRequest).user;

  r.get('/tutor/status', requireParent, wrap(async (_req, res) => {
    const health = await bridgeHealth();
    res.json({ configured: !!bridge, ...health, unread: unreadCount(db) });
  }));
  r.get('/tutor/settings/:kidId', (req, res) => {
    const kidId = idParam(req, 'kidId');
    const s = getSettings(db, kidId);
    res.json({ ...s, usedToday: usedToday(db, kidId), configured: !!bridge });
  });
  r.patch('/tutor/settings/:kidId', requireParent, (req, res) => {
    const kidId = idParam(req, 'kidId');
    getProfile(db, kidId);
    res.json(updateSettings(db, kidId, settingsPatch.parse(req.body)));
  });

  r.get('/tutor/:kidId/conversations', (req, res) => res.json(listConversations(db, user(req), idParam(req, 'kidId'))));
  r.post('/tutor/:kidId/conversations', (req, res) => {
    const { cardId } = z.object({ cardId: z.number().int().optional() }).parse(req.body ?? {});
    const card = cardId ? getCard(db, cardId) : null;
    res.status(201).json(startConversation(db, user(req), idParam(req, 'kidId'), card));
  });
  r.get('/tutor/conversations/:id', (req, res) => {
    const c = getConversation(db, user(req), idParam(req));
    if (user(req).role === 'parent') markRead(db, c.id);
    res.json(c);
  });
  r.post('/tutor/conversations/:id/messages', wrap(async (req, res) => {
    const { text } = z.object({ text: z.string().max(4000) }).parse(req.body);
    res.json(await sendMessage(db, user(req), idParam(req), text, bridge));
  }));
  r.post('/tutor/conversations/:id/read', requireParent, (req, res) => { markRead(db, idParam(req)); res.status(204).end(); });

  return r;
}
