import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { createEngines } from './engines.mjs';

const PORT = Number(process.env.TUTOR_PORT ?? 3100);
const SECRET = process.env.TUTOR_SECRET ?? '';
const WORKDIR = process.env.TUTOR_WORKDIR ?? '/var/lib/tutor-bridge/work';
mkdirSync(WORKDIR, { recursive: true });
if (!SECRET) { console.error('TUTOR_SECRET ontbreekt'); process.exit(1); }

const engines = createEngines({
  workdir: WORKDIR,
  timeoutMs: Number(process.env.TUTOR_TIMEOUT_MS ?? 90_000),
  claudeModel: process.env.TUTOR_CLAUDE_MODEL ?? 'sonnet',
  codexModel: process.env.TUTOR_CODEX_MODEL ?? '',
});

/** Eén gesprek tegelijk per sessie: vervolgvragen wachten op elkaar. */
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((r) => { release = r; });
  locks.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, engines: Object.keys(engines) });
  if (req.headers['x-tutor-secret'] !== SECRET) return json(res, 401, { error: 'Geen toegang' });
  if (req.method !== 'POST' || req.url !== '/chat') return json(res, 404, { error: 'Niet gevonden' });
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200_000) return json(res, 413, { error: 'Te groot' }); }
  let data;
  try { data = JSON.parse(body); } catch { return json(res, 400, { error: 'Ongeldige JSON' }); }
  const { engine, systemPrompt, message, sessionId } = data;
  if (!engines[engine]) return json(res, 400, { error: `Onbekende motor: ${engine}` });
  if (typeof message !== 'string' || !message.trim()) return json(res, 400, { error: 'Leeg bericht' });
  if (typeof systemPrompt !== 'string') return json(res, 400, { error: 'systemPrompt ontbreekt' });
  const t0 = Date.now();
  try {
    const out = await withLock(sessionId ?? `new-${t0}-${Math.random()}`, () => engines[engine]({ systemPrompt, message, sessionId: sessionId ?? null }));
    const ms = Date.now() - t0;
    console.log(`[${engine}] ok ${(ms / 1000).toFixed(1)}s sessie=${(out.sessionId ?? '').slice(0, 8)} vraag=${message.length} tekens antwoord=${out.reply.length} tekens`);
    json(res, 200, { ...out, engine, durationMs: ms });
  } catch (err) {
    console.error(`[${engine}] fout:`, err.message);
    json(res, 502, { error: err.message, engine, durationMs: Date.now() - t0 });
  }
});

server.listen(PORT, () => console.log(`tutor-bridge luistert op :${PORT}, werkmap ${WORKDIR}`));
