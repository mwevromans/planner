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
    expect(r.body.kids.map((k: any) => k.profile.name)).toEqual(['Sepp', 'Liz']);
    expect(r.body.kids[0].cards.map((c: any) => c.title)).toEqual(['Lezen']);
    expect(r.body.kids[1].cards.map((c: any) => c.title)).toEqual(['Zwemles']);
    expect(r.body.kids[0].profile.pin).toBeUndefined();
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
