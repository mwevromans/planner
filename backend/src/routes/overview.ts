import { Router } from 'express';
import type { Db } from '../db.js';
import { isIsoDate, today } from '../dates.js';
import { PlannerError } from '../types.js';
import { overview, summary } from '../services/overview.js';
import { idParam } from './util.js';

/** Publiek leesbaar: wanddashboard en Home Assistant. */
export function overviewRoutes(db: Db) {
  const r = Router();
  r.get('/overview', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : today();
    if (!isIsoDate(date)) throw new PlannerError(400, 'date moet YYYY-MM-DD zijn');
    res.json(overview(db, date));
  });
  r.get('/kids/:id/summary', (req, res) => res.json(summary(db, idParam(req), today())));
  return r;
}
