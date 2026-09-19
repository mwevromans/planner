import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { createApp } from '../src/app.js';
import { buildSystemPrompt, type BridgeCall } from '../src/services/tutor.js';
import { getProfile } from '../src/services/profiles.js';
import { as, loginAs, testDb } from './helpers.js';

let db: Db;
let calls: Parameters<BridgeCall>[0][];
const bridge: BridgeCall = async (input) => { calls.push(input); return { reply: `Wat denk je zelf? (${input.message})`, sessionId: input.sessionId ?? 'sess-1' }; };
let app: ReturnType<typeof createApp>;
let sepp: ReturnType<typeof as>;
let liz: ReturnType<typeof as>;
let papa: ReturnType<typeof as>;

beforeEach(async () => {
  db = testDb(); calls = [];
  app = createApp(db, { bridge });
  sepp = as(app, await loginAs(app, 'Sepp'));
  liz = as(app, await loginAs(app, 'Liz'));
  papa = as(app, await loginAs(app, 'Papa'));
});

describe('huiswerkhulp', () => {
  it('kind start gesprek, stuurt bericht, antwoord en berichten worden opgeslagen, sessie-id onthouden', async () => {
    const c = await sepp.post('/api/tutor/1/conversations', {});
    expect(c.status).toBe(201);
    const m = await sepp.post(`/api/tutor/conversations/${c.body.id}/messages`, { text: 'wat is 7x8' });
    expect(m.status).toBe(200);
    expect(m.body.tutor.text).toBe('Wat denk je zelf? (wat is 7x8)');
    expect(m.body.usedToday).toBe(1);
    expect(calls[0]).toMatchObject({ engine: 'claude', sessionId: null });
    expect(calls[0].systemPrompt).toContain('Huiswerkhulp');
    await sepp.post(`/api/tutor/conversations/${c.body.id}/messages`, { text: '56?' });
    expect(calls[1].sessionId).toBe('sess-1');
    const full = await sepp.get(`/api/tutor/conversations/${c.body.id}`);
    expect(full.body.messages.map((x: any) => x.role)).toEqual(['kid', 'tutor', 'kid', 'tutor']);
  });
  it('een leeg gesprek wordt hergebruikt bij opnieuw starten', async () => {
    const a = (await sepp.post('/api/tutor/1/conversations', {})).body;
    const b = (await sepp.post('/api/tutor/1/conversations', {})).body;
    expect(b.id).toBe(a.id);
    await sepp.post(`/api/tutor/conversations/${a.id}/messages`, { text: 'hoi' });
    const c = (await sepp.post('/api/tutor/1/conversations', {})).body;
    expect(c.id).not.toBe(a.id);
  });
  it('kaartcontext gaat mee in de systeemprompt', async () => {
    const card = (await papa.post('/api/cards', { title: 'Huiswerk rekenen', icon: '🧮', color: '#fde68a', profileId: 1, notes: 'blz 12' })).body;
    const c = await sepp.post('/api/tutor/1/conversations', { cardId: card.id });
    expect(c.body.card_title).toBe('Huiswerk rekenen');
    await sepp.post(`/api/tutor/conversations/${c.body.id}/messages`, { text: 'help' });
    expect(calls[0].systemPrompt).toContain('Huiswerk rekenen');
  });
  it('ander kind komt er niet bij; ouder leest wel maar chat niet', async () => {
    const c = await sepp.post('/api/tutor/1/conversations', {});
    await sepp.post(`/api/tutor/conversations/${c.body.id}/messages`, { text: 'hoi' });
    expect((await liz.get(`/api/tutor/conversations/${c.body.id}`)).status).toBe(403);
    expect((await liz.get('/api/tutor/1/conversations')).status).toBe(403);
    expect((await papa.get(`/api/tutor/conversations/${c.body.id}`)).status).toBe(200);
    expect((await papa.post(`/api/tutor/conversations/${c.body.id}/messages`, { text: 'x' })).status).toBe(403);
  });
  it('plafond: bij bereiken 429; ouder kan verhogen; uit geeft 409', async () => {
    await papa.patch('/api/tutor/settings/1', { dailyCap: 2 });
    const c = (await sepp.post('/api/tutor/1/conversations', {})).body;
    expect((await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'a' })).status).toBe(200);
    expect((await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'b' })).status).toBe(200);
    expect((await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'c' })).status).toBe(429);
    await papa.patch('/api/tutor/settings/1', { dailyCap: 5 });
    expect((await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'c' })).status).toBe(200);
    await papa.patch('/api/tutor/settings/1', { enabled: false });
    expect((await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'd' })).status).toBe(409);
    expect((await sepp.post('/api/tutor/1/conversations', {})).status).toBe(409);
    expect((await sepp.patch('/api/tutor/settings/1', { enabled: true })).status).toBe(403);
  });
  it('motorkeuze per kind en ongelezen-teller voor ouders', async () => {
    await papa.patch('/api/tutor/settings/2', { engine: 'codex', extraPrompt: 'Liz houdt van paarden.', voice: true });
    expect((await liz.get('/api/tutor/settings/2')).body.voice).toBe(1);
    const c = (await liz.post('/api/tutor/2/conversations', {})).body;
    expect(c.engine).toBe('codex');
    await liz.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'hoi' });
    expect(calls[0].engine).toBe('codex');
    expect(calls[0].systemPrompt).toContain('Liz houdt van paarden');
    expect((await papa.get('/api/tutor/status')).body.unread).toBe(1);
    await papa.get(`/api/tutor/conversations/${c.id}`);
    expect((await papa.get('/api/tutor/status')).body.unread).toBe(0);
    expect((await sepp.get('/api/tutor/status')).status).toBe(403);
  });
  it('motor omschakelen vóór het eerste bericht telt; daarna blijft het gesprek bij zijn motor', async () => {
    const c = (await sepp.post('/api/tutor/1/conversations', {})).body;
    expect(c.engine).toBe('claude');
    await papa.patch('/api/tutor/settings/1', { engine: 'codex' });
    await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'hoi' });
    expect(calls[0].engine).toBe('codex');
    expect((await sepp.get(`/api/tutor/conversations/${c.id}`)).body.engine).toBe('codex');
    await papa.patch('/api/tutor/settings/1', { engine: 'claude' });
    await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'en dan' });
    expect(calls[1].engine).toBe('codex'); // sessie loopt al bij codex
  });
  it('zonder bridge: nette 503, bericht van kind niet dubbel geteld', async () => {
    const app2 = createApp(db, { bridge: null });
    const s = as(app2, await loginAs(app2, 'Sepp'));
    const c = (await s.post('/api/tutor/1/conversations', {})).body;
    const r = await s.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'hoi' });
    expect(r.status).toBe(503);
    expect((await s.get('/api/tutor/settings/1')).body.usedToday).toBe(0);
  });
  it('bridge-fout: 503 met kindvriendelijke tekst, kindbericht wel bewaard', async () => {
    const failing: BridgeCall = async () => { throw new Error('boom'); };
    const app2 = createApp(db, { bridge: failing });
    const s = as(app2, await loginAs(app2, 'Sepp'));
    const c = (await s.post('/api/tutor/1/conversations', {})).body;
    const r = await s.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'hoi' });
    expect(r.status).toBe(503);
    expect(r.body.error).not.toContain('boom');
  });
  it('zonder basisdocument weigert de hulp te chatten (503), bericht niet geteld', async () => {
    const prev = process.env.TUTOR_PROMPT_DIR;
    process.env.TUTOR_PROMPT_DIR = '/nonexistent-dir';
    try {
      expect(() => buildSystemPrompt(getProfile(db, 1), { profile_id: 1, enabled: 1, daily_cap: 40, engine: 'claude', extra_prompt: '', voice: 0 })).toThrow(/basisdocument/);
      const c = (await sepp.post('/api/tutor/1/conversations', {})).body;
      const r = await sepp.post(`/api/tutor/conversations/${c.id}/messages`, { text: 'hoi' });
      expect(r.status).toBe(503);
      expect(calls).toHaveLength(0);
      expect((await sepp.get('/api/tutor/settings/1')).body.usedToday).toBe(0);
    } finally { if (prev === undefined) delete process.env.TUTOR_PROMPT_DIR; else process.env.TUTOR_PROMPT_DIR = prev; }
  });
  it('buildSystemPrompt bevat basis, kind-tekst, extra en kaart', () => {
    const p = buildSystemPrompt(getProfile(db, 1), { profile_id: 1, enabled: 1, daily_cap: 40, engine: 'claude', extra_prompt: 'Extra.', voice: 0 }, { title: 'Lezen', notes: 'hfst 3' });
    expect(p).toContain('## Zo help je');
    expect(p).toContain('Sepp');
    expect(p).toContain('Extra.');
    expect(p).toContain('Lezen');
    expect(p).toContain('hfst 3');
  });
});
