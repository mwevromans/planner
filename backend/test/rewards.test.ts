import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { balance } from '../src/services/points.js';
import { appWith, as, loginAs, testDb } from './helpers.js';

let db: Db;
let app: ReturnType<typeof appWith>;
let sepp: ReturnType<typeof as>;
let papa: ReturnType<typeof as>;

beforeEach(async () => {
  db = testDb();
  app = appWith(db);
  sepp = as(app, await loginAs(app, 'Sepp'));
  papa = as(app, await loginAs(app, 'Papa'));
  // saldo 30 voor Sepp
  const id = (await papa.post('/api/cards', { title: 'T', icon: '📚', color: '#fde68a', profileId: 1, points: 30 })).body.id;
  await sepp.post(`/api/cards/${id}/done`);
  await papa.post(`/api/cards/${id}/approve`);
});

describe('winkeltje', () => {
  it('kind ziet alleen actieve beloningen, ouder alles', async () => {
    const r = await papa.post('/api/rewards', { title: 'Uit', icon: '🎡', cost: 5, active: false });
    expect(r.status).toBe(201);
    expect((await sepp.get('/api/rewards')).body).toHaveLength(3);
    expect((await papa.get('/api/rewards')).body).toHaveLength(4);
  });
  it('kind mag geen beloning aanmaken', async () => {
    expect((await sepp.post('/api/rewards', { title: 'X', icon: '🎡', cost: 5 })).status).toBe(403);
  });
  it('aanvragen reserveert punten; tweede aanvraag faalt; approve trekt af', async () => {
    const a = await sepp.post('/api/redemptions', { rewardId: 1 }); // 20
    expect(a.status).toBe(201);
    expect(a.body.status).toBe('wacht');
    const mine = await sepp.get('/api/redemptions?profileId=1');
    expect(mine.body).toMatchObject({ balance: 30, reserved: 20, available: 10 });
    expect((await sepp.post('/api/redemptions', { rewardId: 1 })).status).toBe(409);
    expect((await papa.post(`/api/redemptions/${a.body.id}/approve`)).body.status).toBe('gekregen');
    expect(balance(db, 1)).toBe(10);
    expect((await papa.post(`/api/redemptions/${a.body.id}/approve`)).status).toBe(409);
  });
  it('deny geeft reservering vrij', async () => {
    const a = await sepp.post('/api/redemptions', { rewardId: 2 }); // 30
    expect((await sepp.get('/api/redemptions?profileId=1')).body.available).toBe(0);
    expect((await papa.post(`/api/redemptions/${a.body.id}/deny`)).body.status).toBe('nee');
    expect((await sepp.get('/api/redemptions?profileId=1')).body.available).toBe(30);
  });
  it('te duur is 409, inactief is 404', async () => {
    expect((await sepp.post('/api/redemptions', { rewardId: 3 })).status).toBe(409); // 40
    await papa.patch('/api/rewards/1', { active: false });
    expect((await sepp.post('/api/redemptions', { rewardId: 1 })).status).toBe(404);
  });
  it('approvals toont wachtende kaarten en inwisselingen met profiel', async () => {
    const id = (await papa.post('/api/cards', { title: 'Lezen', icon: '📖', color: '#fde68a', profileId: 1, points: 5 })).body.id;
    await sepp.post(`/api/cards/${id}/done`);
    await sepp.post('/api/redemptions', { rewardId: 1 });
    const a = await papa.get('/api/approvals');
    expect(a.body.cards).toHaveLength(1);
    expect(a.body.cards[0].profile.name).toBe('Sepp');
    expect(a.body.redemptions).toHaveLength(1);
    expect(a.body.redemptions[0].title).toBe('Half uur extra schermtijd');
    expect((await sepp.get('/api/approvals')).status).toBe(403);
  });
  it('gebruikte beloning wordt bij verwijderen inactief, ongebruikte verdwijnt', async () => {
    await sepp.post('/api/redemptions', { rewardId: 1 });
    expect((await papa.del('/api/rewards/1')).status).toBe(204);
    expect((await papa.get('/api/rewards')).body.find((r: any) => r.id === 1).active).toBe(0);
    expect((await papa.del('/api/rewards/2')).status).toBe(204);
    expect((await papa.get('/api/rewards')).body.find((r: any) => r.id === 2)).toBeUndefined();
  });
});
