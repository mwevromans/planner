import { beforeEach, describe, expect, it } from 'vitest';
import { balance } from '../src/services/points.js';
import { appWith, as, loginAs, testDb } from './helpers.js';
import type { Db } from '../src/db.js';

let db: Db;
let app: ReturnType<typeof appWith>;
let sepp: ReturnType<typeof as>;
let papa: ReturnType<typeof as>;

beforeEach(async () => {
  db = testDb();
  app = appWith(db);
  sepp = as(app, await loginAs(app, 'Sepp'));
  papa = as(app, await loginAs(app, 'Papa'));
});

async function card(points: number) {
  return (await papa.post('/api/cards', { title: 'T', icon: '📚', color: '#fde68a', profileId: 1, points })).body.id as number;
}

describe('afvinken en goedkeuren', () => {
  it('kaart zonder punten telt direct, geen goedkeuring nodig', async () => {
    const id = await card(0);
    const r = await sepp.post(`/api/cards/${id}/done`);
    expect(r.status).toBe(200);
    expect(r.body.done_at).toBeTruthy();
    expect(r.body.needsApproval).toBe(false);
    expect(balance(db, 1)).toBe(0);
  });
  it('kaart met punten wacht op ouder; approve geeft punten', async () => {
    const id = await card(10);
    const r = await sepp.post(`/api/cards/${id}/done`);
    expect(r.body.needsApproval).toBe(true);
    expect(balance(db, 1)).toBe(0);
    expect((await sepp.post(`/api/cards/${id}/approve`)).status).toBe(403);
    expect((await papa.post(`/api/cards/${id}/approve`)).status).toBe(200);
    expect(balance(db, 1)).toBe(10);
  });
  it('approve van niet-afgevinkte kaart is 409', async () => {
    const id = await card(10);
    expect((await papa.post(`/api/cards/${id}/approve`)).status).toBe(409);
  });
  it('kind kan niet ongedaan maken na goedkeuring, ouder wel', async () => {
    const id = await card(10);
    await sepp.post(`/api/cards/${id}/done`);
    await papa.post(`/api/cards/${id}/approve`);
    expect((await sepp.post(`/api/cards/${id}/undone`)).status).toBe(409);
    expect((await papa.post(`/api/cards/${id}/undone`)).status).toBe(200);
    expect(balance(db, 1)).toBe(0);
  });
  it('kind kan ongedaan maken vóór goedkeuring', async () => {
    const id = await card(10);
    await sepp.post(`/api/cards/${id}/done`);
    const r = await sepp.post(`/api/cards/${id}/undone`);
    expect(r.status).toBe(200);
    expect(r.body.done_at).toBeNull();
  });
  it('reject maakt done ongedaan', async () => {
    const id = await card(10);
    await sepp.post(`/api/cards/${id}/done`);
    const r = await papa.post(`/api/cards/${id}/reject`);
    expect(r.body.done_at).toBeNull();
    expect(balance(db, 1)).toBe(0);
  });
});
