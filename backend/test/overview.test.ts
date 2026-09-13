import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { today } from '../src/dates.js';
import { appWith, as, loginAs, testDb } from './helpers.js';

let app: ReturnType<typeof appWith>;
let papa: ReturnType<typeof as>;
let sepp: ReturnType<typeof as>;

beforeEach(async () => {
  app = appWith(testDb());
  papa = as(app, await loginAs(app, 'Papa'));
  sepp = as(app, await loginAs(app, 'Sepp'));
});

describe('overzicht en summary (publiek)', () => {
  it('overview toont beide kinderen met kaarten van die dag en materialiseert herhalingen', async () => {
    await papa.post('/api/recurrences', { profileId: 2, title: 'Zwemles', icon: '🏊', color: '#7dd3fc', weekdays: [1, 2, 3, 4, 5, 6, 7], dayPart: 'ochtend' });
    await papa.post('/api/cards', { title: 'Lezen', icon: '📖', color: '#fde68a', profileId: 1, plannedDate: '2026-09-14', dayPart: 'avond' });
    const r = await request(app).get('/api/overview?date=2026-09-14');
    expect(r.status).toBe(200);
    expect(r.body.members.map((k: any) => k.profile.name)).toEqual(['Gezin', 'Sepp', 'Liz', 'Papa', 'Mama']);
    const byName = Object.fromEntries(r.body.members.map((m: any) => [m.profile.name, m]));
    expect(byName.Sepp.cards.map((c: any) => c.title)).toEqual(['Lezen']);
    expect(byName.Liz.cards.map((c: any) => c.title)).toEqual(['Zwemles']);
    expect(byName.Sepp.profile.pin).toBeUndefined();
    expect(byName.Papa.balance).toBeNull();
    expect(typeof byName.Sepp.balance).toBe('number');
  });
  it('summary telt vandaag en wachtende goedkeuringen', async () => {
    const t = today();
    const a = (await papa.post('/api/cards', { title: 'A', icon: '📖', color: '#fde68a', profileId: 1, plannedDate: t, dayPart: 'avond', points: 5 })).body.id;
    await papa.post('/api/cards', { title: 'B', icon: '📖', color: '#fde68a', profileId: 1, plannedDate: t, dayPart: 'avond' });
    await sepp.post(`/api/cards/${a}/done`);
    const r = await request(app).get('/api/kids/1/summary');
    expect(r.body).toEqual({ name: 'Sepp', balance: 0, streak: 0, todayTotal: 2, todayDone: 1, pendingApprovals: 1 });
  });
  it('ongeldige datum 400, onbekend kind 404', async () => {
    expect((await request(app).get('/api/overview?date=gisteren')).status).toBe(400);
    expect((await request(app).get('/api/kids/99/summary')).status).toBe(404);
  });
});

describe('gezin', () => {
  it('gezinskaart staat op het weekbord van elk kind als family, niet als eigen kaart', async () => {
    const fam = (await request(app).get('/api/profiles')).body.find((p: any) => p.role === 'family');
    await papa.post('/api/cards', { title: 'Oma jarig', icon: '🎂', color: '#fecaca', profileId: fam.id, plannedDate: '2026-09-12', dayPart: 'middag', time: '14:00' });
    const w = await sepp.get('/api/kids/1/week?start=2026-09-07');
    expect(w.body.cards).toHaveLength(0);
    expect(w.body.family.map((c: any) => c.title)).toEqual(['Oma jarig']);
    // kind mag er niets mee
    expect((await sepp.post(`/api/cards/${w.body.family[0].id}/done`)).status).toBe(403);
    expect((await sepp.patch(`/api/cards/${w.body.family[0].id}`, { plannedDate: '2026-09-13', dayPart: 'avond' })).status).toBe(403);
  });
  it('ouder heeft een eigen bord', async () => {
    const c = await papa.post('/api/cards', { title: 'Laat werken', icon: '💼', color: '#bae6fd', profileId: 3, plannedDate: '2026-09-08', dayPart: 'avond' });
    expect(c.status).toBe(201);
    const w = await papa.get('/api/kids/3/week?start=2026-09-07');
    expect(w.body.cards.map((x: any) => x.title)).toEqual(['Laat werken']);
    expect((await sepp.get('/api/kids/3/week?start=2026-09-07')).status).toBe(403);
  });
  it('family-week is publiek en toont iedereen met kaarten van de week', async () => {
    await papa.post('/api/recurrences', { profileId: 2, title: 'Zwemles', icon: '🏊', color: '#7dd3fc', weekdays: [3], dayPart: 'namiddag' });
    const r = await request(app).get('/api/family-week?start=2026-09-07');
    expect(r.status).toBe(200);
    expect(r.body.members.map((m: any) => m.profile.name)).toEqual(['Gezin', 'Sepp', 'Liz', 'Papa', 'Mama']);
    expect(r.body.members[2].cards.map((c: any) => c.planned_date)).toEqual(['2026-09-09']);
    expect((await request(app).get('/api/family-week?start=2026-09-09')).status).toBe(400);
  });
});
