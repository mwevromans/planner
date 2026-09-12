import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import type { Db } from './db.js';
import { PlannerError } from './types.js';
import { profileRoutes } from './routes/profiles.js';
import { cardRoutes } from './routes/cards.js';
import { weekAndRecurrenceRoutes } from './routes/recurrences.js';
import { rewardRoutes } from './routes/rewards.js';
import { overviewRoutes } from './routes/overview.js';

export function createApp(db: Db) {
  const app = express();
  app.use(express.json());

  // Publiek leesbare routes eerst: de routers hieronder eisen een token voor alles wat ze bereikt.
  app.use('/api', overviewRoutes(db));
  app.use('/api', profileRoutes(db));
  app.use('/api', cardRoutes(db));
  app.use('/api', weekAndRecurrenceRoutes(db));
  app.use('/api', rewardRoutes(db));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Niet gevonden' }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof PlannerError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) return res.status(400).json({ error: 'Ongeldige invoer', details: err.issues });
    console.error(err);
    res.status(500).json({ error: 'Er ging iets mis' });
  });

  return app;
}
