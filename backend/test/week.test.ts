import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { addDays } from '../src/dates.js';
import { streak } from '../src/services/points.js';
import { appWith, as, loginAs, testDb } from './helpers.js';

let db: Db;
let app: ReturnType<typeof appWith>;
let sepp: ReturnType<typeof as>;
let papa: ReturnType<typeof as>;
const WEEK = '2026-09-07'; // maandag

beforeEach(async () => {
  db = testDb();
  app = appWith(db);
  sepp = as(app, await loginAs(app, 'Sepp'));
  papa = as(app, await loginAs(app, 'Papa'));
});

describe('herhalingen en week', () => {
  it('herhaling di+do wordt gematerialiseerd, zonder dubbelen', async () => {
    const c = await papa.post('/api/recurrences', {
      profileId: 1, title: 'Voetbaltraining', icon: '⚽', color: '#a7f3d0', weekdays: [2, 4], dayPart: 'namiddag', time: '16:30',
    });
    expect(c.status).toBe(201);
    const w1 = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    expect(w1.status).toBe(200);
    expect(w1.body.cards).toHaveLength(2);
    expect(w1.body.cards.map((x: any) => x.planned_date)).toEqual(['2026-09-08', '2026-09-10']);
    expect(w1.body.cards[0].recurrence_id).toBe(c.body.id);
    const w2 = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    expect(w2.body.cards).toHaveLength(2);
  });
  it('verwijderde instantie komt niet terug, andere dag blijft', async () => {
    await papa.post('/api/recurrences', { profileId: 1, title: 'Training', icon: '⚽', color: '#a7f3d0', weekdays: [2, 4], dayPart: 'namiddag' });
    const w = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    const inst = w.body.cards[0];
    expect((await sepp.del(`/api/cards/${inst.id}`)).status).toBe(403); // ouder-kaart
    expect((await papa.del(`/api/cards/${inst.id}`)).status).toBe(204);
    const again = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    expect(again.body.cards).toHaveLength(1);
    expect(again.body.cards[0].planned_date).toBe('2026-09-10');
  });
  it('kind mag instantie verplaatsen binnen de week', async () => {
    await papa.post('/api/recurrences', { profileId: 1, title: 'Training', icon: '⚽', color: '#a7f3d0', weekdays: [2], dayPart: 'namiddag' });
    const inst = (await sepp.get(`/api/kids/1/week?start=${WEEK}`)).body.cards[0];
    const m = await sepp.patch(`/api/cards/${inst.id}`, { plannedDate: '2026-09-09', dayPart: 'avond' });
    expect(m.status).toBe(200);
    const w = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    expect(w.body.cards).toHaveLength(1);
    expect(w.body.cards[0].planned_date).toBe('2026-09-09');
  });
  it('inactieve herhaling maakt niets; verwijderen ruimt open instanties op', async () => {
    const c = await papa.post('/api/recurrences', { profileId: 1, title: 'Zwemles', icon: '🏊', color: '#7dd3fc', weekdays: [6], dayPart: 'ochtend', active: false });
    expect((await sepp.get(`/api/kids/1/week?start=${WEEK}`)).body.cards).toHaveLength(0);
    await papa.patch(`/api/recurrences/${c.body.id}`, { active: true });
    const far = '2099-01-05'; // maandag in de toekomst
    expect((await sepp.get(`/api/kids/1/week?start=${far}`)).body.cards).toHaveLength(1);
    expect((await papa.del(`/api/recurrences/${c.body.id}`)).status).toBe(204);
    expect((await sepp.get(`/api/kids/1/week?start=${far}`)).body.cards).toHaveLength(0);
  });
  it('stapel: ongeplande kaarten op deadline, zonder deadline achteraan', async () => {
    await papa.post('/api/cards', { title: 'B', icon: '📚', color: '#fde68a', profileId: 1, deadline: '2026-09-20' });
    await papa.post('/api/cards', { title: 'C', icon: '📚', color: '#fde68a', profileId: 1 });
    await papa.post('/api/cards', { title: 'A', icon: '📚', color: '#fde68a', profileId: 1, deadline: '2026-09-10' });
    const w = await sepp.get(`/api/kids/1/week?start=${WEEK}`);
    expect(w.body.stack.map((c: any) => c.title)).toEqual(['A', 'B', 'C']);
    expect(w.body.cards).toHaveLength(0);
  });
  it('start moet maandag zijn; ander kind 403; kind zonder herhalingen ok', async () => {
    expect((await sepp.get('/api/kids/1/week?start=2026-09-09')).status).toBe(400);
    expect((await sepp.get(`/api/kids/2/week?start=${WEEK}`)).status).toBe(403);
    expect((await papa.get(`/api/kids/2/week?start=${WEEK}`)).status).toBe(200);
  });
  it('kind mag geen herhaling aanmaken', async () => {
    const r = await sepp.post('/api/recurrences', { profileId: 1, title: 'X', icon: '⚽', color: '#a7f3d0', weekdays: [1], dayPart: 'avond' });
    expect(r.status).toBe(403);
  });
});

describe('streak', () => {
  const T = '2026-09-12';
  function plan(date: string, done: boolean) {
    db.prepare(
      `insert into cards(profile_id, title, icon, color, planned_date, day_part, created_by, done_at) values (1,'x','📚','#fff',?,'avond',3,?)`,
    ).run(date, done ? '2026-01-01T00:00:00Z' : null);
  }
  it('telt terug vanaf gisteren als vandaag nog open staat', () => {
    plan(addDays(T, -2), true); plan(addDays(T, -1), true); plan(T, false);
    expect(streak(db, 1, T)).toBe(2);
  });
  it('telt vandaag mee als alles klaar is', () => {
    plan(addDays(T, -2), true); plan(addDays(T, -1), true); plan(T, true);
    expect(streak(db, 1, T)).toBe(3);
  });
  it('dag zonder planning breekt de reeks', () => {
    plan(addDays(T, -3), true); plan(addDays(T, -1), true); plan(T, false);
    expect(streak(db, 1, T)).toBe(1);
  });
  it('dag met één open kaart breekt de reeks', () => {
    plan(addDays(T, -2), true); plan(addDays(T, -1), true); plan(addDays(T, -1), false);
    expect(streak(db, 1, T)).toBe(0);
  });
  it('lege agenda is 0', () => expect(streak(db, 1, T)).toBe(0));
});
