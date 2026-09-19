import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Db } from '../db.js';
import { nowIso, today } from '../dates.js';
import { PlannerError, type Card, type Profile } from '../types.js';
import { isParent } from '../auth.js';

export type Engine = 'claude' | 'codex';
export const ENGINES: Engine[] = ['claude', 'codex'];

export interface TutorSettings { profile_id: number; enabled: number; daily_cap: number; engine: Engine; extra_prompt: string; voice: number }
export interface Conversation { id: number; profile_id: number; engine: Engine; session_id: string | null; card_title: string | null; started_at: string; last_at: string; read_by_parent: number }
export interface Message { id: number; conversation_id: number; role: 'kid' | 'tutor'; text: string; created_at: string }

export const settingsPatch = z.object({
  enabled: z.boolean().optional(),
  dailyCap: z.number().int().min(0).max(1000).optional(),
  engine: z.enum(['claude', 'codex']).optional(),
  extraPrompt: z.string().max(4000).optional(),
  voice: z.boolean().optional(),
});

/** Aanroep van het tussenstuk op de host. Injecteerbaar voor tests. */
export type BridgeCall = (input: { engine: Engine; systemPrompt: string; message: string; sessionId: string | null }) => Promise<{ reply: string; sessionId: string | null }>;

export function bridgeFromEnv(env = process.env): BridgeCall | null {
  const url = env.TUTOR_BRIDGE_URL;
  const secret = env.TUTOR_SECRET;
  if (!url || !secret) return null;
  return async (input) => {
    const res = await fetch(`${url.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tutor-secret': secret },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => ({}))) as { reply?: string; sessionId?: string | null; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Bridge antwoordde ${res.status}`);
    return { reply: data.reply ?? '', sessionId: data.sessionId ?? null };
  };
}

export async function bridgeHealth(env = process.env): Promise<{ reachable: boolean; engines: string[] }> {
  const url = env.TUTOR_BRIDGE_URL;
  if (!url) return { reachable: false, engines: [] };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(3000) });
    const d = (await res.json()) as { engines?: string[] };
    return { reachable: res.ok, engines: d.engines ?? [] };
  } catch { return { reachable: false, engines: [] }; }
}

const here = path.dirname(fileURLToPath(import.meta.url));
function tutorDir(): string { return process.env.TUTOR_PROMPT_DIR ?? path.join(here, '..', '..', '..', 'tutor'); }

function readPrompt(name: string): string {
  const f = path.join(tutorDir(), `${name}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

/** Basisregels + kind-specifieke tekst uit de repo + extra tekst van de ouders + kaartcontext. */
export function buildSystemPrompt(kid: Profile, settings: TutorSettings, card?: Pick<Card, 'title' | 'notes'> | null): string {
  const basis = readPrompt('basis');
  // Zonder de basisregels mag er nooit gechat worden: dan geeft de motor gewoon antwoorden.
  if (!basis.includes('## Wat je nooit doet')) throw new PlannerError(503, 'De huiswerkhulp is niet goed ingesteld (basisdocument ontbreekt). Vraag papa of mama.');
  const parts = [basis];
  const own = readPrompt(kid.name.toLowerCase());
  parts.push(own || `## Dit kind\n\nJe praat met ${kid.name}.`);
  if (settings.extra_prompt.trim()) parts.push(`## Extra van papa en mama\n\n${settings.extra_prompt.trim()}`);
  if (card) parts.push(`## Waar het kind nu aan werkt\n\nKaart op de planner: "${card.title}"${card.notes ? `\nNotitie: ${card.notes}` : ''}`);
  return parts.join('\n\n');
}

export function getSettings(db: Db, profileId: number): TutorSettings {
  const row = db.prepare('select * from tutor_settings where profile_id=?').get(profileId) as unknown as TutorSettings | undefined;
  return row ?? { profile_id: profileId, enabled: 1, daily_cap: 40, engine: 'claude', extra_prompt: '', voice: 0 };
}

export function updateSettings(db: Db, profileId: number, patch: z.infer<typeof settingsPatch>): TutorSettings {
  const cur = getSettings(db, profileId);
  const next = {
    enabled: patch.enabled === undefined ? cur.enabled : patch.enabled ? 1 : 0,
    daily_cap: patch.dailyCap ?? cur.daily_cap,
    engine: patch.engine ?? cur.engine,
    extra_prompt: patch.extraPrompt ?? cur.extra_prompt,
    voice: patch.voice === undefined ? cur.voice : patch.voice ? 1 : 0,
  };
  db.prepare('insert or replace into tutor_settings(profile_id, enabled, daily_cap, engine, extra_prompt, voice) values (?,?,?,?,?,?)')
    .run(profileId, next.enabled, next.daily_cap, next.engine, next.extra_prompt, next.voice);
  return getSettings(db, profileId);
}

/** Berichten van het kind vandaag (Amsterdamse dag). */
export function usedToday(db: Db, profileId: number): number {
  const start = new Date(`${today()}T00:00:00+02:00`); // ruwe dagstart; precies genoeg voor een plafond
  return (db.prepare(
    `select count(*) as n from tutor_messages m join tutor_conversations c on c.id = m.conversation_id
     where c.profile_id=? and m.role='kid' and m.created_at >= ?`,
  ).get(profileId, start.toISOString()) as { n: number }).n;
}

function canAccess(user: Profile, profileId: number) {
  if (!isParent(user) && user.id !== profileId) throw new PlannerError(403, 'Dat is niet jouw huiswerkhulp');
}

export function listConversations(db: Db, user: Profile, profileId: number): (Conversation & { preview: string; count: number })[] {
  canAccess(user, profileId);
  return db.prepare(
    `select c.*, (select text from tutor_messages where conversation_id=c.id and role='kid' order by id limit 1) as preview,
            (select count(*) from tutor_messages where conversation_id=c.id) as count
     from tutor_conversations c where c.profile_id=? order by c.last_at desc, c.id desc limit 100`,
  ).all(profileId) as unknown as (Conversation & { preview: string; count: number })[];
}

export function getConversation(db: Db, user: Profile, id: number): Conversation & { messages: Message[] } {
  const c = db.prepare('select * from tutor_conversations where id=?').get(id) as unknown as Conversation | undefined;
  if (!c) throw new PlannerError(404, 'Gesprek niet gevonden');
  canAccess(user, c.profile_id);
  const messages = db.prepare('select * from tutor_messages where conversation_id=? order by id').all(id) as unknown as Message[];
  return { ...c, messages };
}

export function startConversation(db: Db, user: Profile, profileId: number, card?: Pick<Card, 'title' | 'notes'> | null): Conversation {
  canAccess(user, profileId);
  const s = getSettings(db, profileId);
  if (!s.enabled) throw new PlannerError(409, 'De huiswerkhulp staat uit. Vraag het aan papa of mama.');
  // Een leeg gesprek met dezelfde context hergebruiken in plaats van er nog een aan te maken.
  const empty = db.prepare(
    `select c.* from tutor_conversations c where c.profile_id=? and coalesce(c.card_title,'') = coalesce(?, '')
     and not exists (select 1 from tutor_messages m where m.conversation_id=c.id) order by c.id desc limit 1`,
  ).get(profileId, card?.title ?? null) as unknown as Conversation | undefined;
  if (empty) return empty;
  const r = db.prepare('insert into tutor_conversations(profile_id, engine, card_title) values (?,?,?)').run(profileId, s.engine, card?.title ?? null);
  return db.prepare('select * from tutor_conversations where id=?').get(Number(r.lastInsertRowid)) as unknown as Conversation;
}

export async function sendMessage(
  db: Db, user: Profile, conversationId: number, text: string, bridge: BridgeCall | null, card?: Pick<Card, 'title' | 'notes'> | null,
): Promise<{ kid: Message; tutor: Message; usedToday: number; dailyCap: number }> {
  const conv = getConversation(db, user, conversationId);
  if (isParent(user)) throw new PlannerError(403, 'Ouders lezen mee, maar chatten niet in het gesprek van een kind');
  const kid = db.prepare('select * from profiles where id=?').get(conv.profile_id) as unknown as Profile;
  const s = getSettings(db, kid.id);
  if (!s.enabled) throw new PlannerError(409, 'De huiswerkhulp staat uit. Vraag het aan papa of mama.');
  const used = usedToday(db, kid.id);
  if (used >= s.daily_cap) throw new PlannerError(429, 'Je hebt vandaag al veel gevraagd. Morgen kun je weer, of vraag het aan papa of mama.');
  if (!bridge) throw new PlannerError(503, 'De huiswerkhulp is even niet bereikbaar. Probeer het later, of vraag papa of mama.');
  const clean = text.trim().slice(0, 2000);
  if (!clean) throw new PlannerError(400, 'Typ eerst een vraag');

  const systemPrompt = buildSystemPrompt(kid, s, card ?? (conv.card_title ? { title: conv.card_title, notes: '' } : null));
  const kidMsg = insertMessage(db, conv.id, 'kid', clean);
  let reply: { reply: string; sessionId: string | null };
  try {
    reply = await bridge({ engine: conv.engine, systemPrompt, message: clean, sessionId: conv.session_id });
  } catch (err) {
    console.error('tutor bridge:', err);
    throw new PlannerError(503, 'De huiswerkhulp kon even niet antwoorden. Probeer het nog een keer.');
  }
  const tutorMsg = insertMessage(db, conv.id, 'tutor', reply.reply || '…');
  db.prepare('update tutor_conversations set session_id=coalesce(?, session_id), last_at=?, read_by_parent=0 where id=?').run(reply.sessionId, nowIso(), conv.id);
  return { kid: kidMsg, tutor: tutorMsg, usedToday: used + 1, dailyCap: s.daily_cap };
}

function insertMessage(db: Db, conversationId: number, role: 'kid' | 'tutor', text: string): Message {
  const r = db.prepare('insert into tutor_messages(conversation_id, role, text, created_at) values (?,?,?,?)').run(conversationId, role, text, nowIso());
  return db.prepare('select * from tutor_messages where id=?').get(Number(r.lastInsertRowid)) as unknown as Message;
}

export function markRead(db: Db, id: number): void {
  db.prepare('update tutor_conversations set read_by_parent=1 where id=?').run(id);
}

export function unreadCount(db: Db): number {
  return (db.prepare('select count(*) as n from tutor_conversations where read_by_parent=0').get() as { n: number }).n;
}
