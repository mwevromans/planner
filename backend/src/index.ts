import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(here, '..', 'data', 'planner.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const app = createApp(openDb(dbPath));

const dist = process.env.FRONTEND_DIR ?? path.join(here, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Planner luistert op http://0.0.0.0:${port} (db: ${dbPath})`));
