import { beforeEach, describe, expect, it } from 'vitest';
import { appWith, as, loginAs, testDb } from './helpers.js';

let app: ReturnType<typeof appWith>;
let sepp: ReturnType<typeof as>;
let liz: ReturnType<typeof as>;
let papa: ReturnType<typeof as>;
const base = { title: 'Huiswerk rekenen', icon: '🧮', color: '#fde68a' };

beforeEach(async () => {
  app = appWith(testDb());
  sepp = as(app, await loginAs(app, 'Sepp'));
  liz = as(app, await loginAs(app, 'Liz'));
  papa = as(app, await loginAs(app, 'Papa'));
});

describe('kaart aanmaken', () => {
  it('kind maakt eigen kaart op de stapel', async () => {
    const r = await sepp.post('/api/cards', { ...base, profileId: 1, deadline: '2026-09-18' });
    expect(r.status).toBe(201);
    expect(r.body.planned_date).toBeNull();
    expect(r.body.created_by).toBe(1);
    expect(r.body.points).toBe(0);
  });
  it('kind mag geen punten geven', async () => {
    const r = await sepp.post('/api/cards', { ...base, profileId: 1, points: 5 });
    expect(r.status).toBe(403);
  });
  it('kind mag niet op bord van ander kind', async () => {
    const r = await sepp.post('/api/cards', { ...base, profileId: 2 });
    expect(r.status).toBe(403);
  });
  it('ouder maakt kaart met punten voor Sepp, gepland', async () => {
    const r = await papa.post('/api/cards', { ...base, profileId: 1, points: 10, plannedDate: '2026-09-14', dayPart: 'namiddag', time: '16:00' });
    expect(r.status).toBe(201);
    expect(r.body.points).toBe(10);
    expect(r.body.day_part).toBe('namiddag');
  });
  it('datum zonder dagdeel is 400, ongeldig dagdeel 400, ongeldige tijd 400', async () => {
    expect((await papa.post('/api/cards', { ...base, profileId: 1, plannedDate: '2026-09-14' })).status).toBe(400);
    expect((await papa.post('/api/cards', { ...base, profileId: 1, plannedDate: '2026-09-14', dayPart: 'nacht' })).status).toBe(400);
    expect((await papa.post('/api/cards', { ...base, profileId: 1, time: '25:00' })).status).toBe(400);
  });
});

describe('kaart wijzigen', () => {
  let parentCardId: number;
  let ownCardId: number;
  beforeEach(async () => {
    parentCardId = (await papa.post('/api/cards', { ...base, profileId: 1, points: 10, deadline: '2026-09-18' })).body.id;
    ownCardId = (await sepp.post('/api/cards', { title: 'Gamen', icon: '🎮', color: '#a7f3d0', profileId: 1 })).body.id;
  });
  it('kind verplaatst ouder-kaart naar het bord en terug naar de stapel', async () => {
    const m = await sepp.patch(`/api/cards/${parentCardId}`, { plannedDate: '2026-09-15', dayPart: 'namiddag' });
    expect(m.status).toBe(200);
    expect(m.body.planned_date).toBe('2026-09-15');
    const back = await sepp.patch(`/api/cards/${parentCardId}`, { plannedDate: null });
    expect(back.status).toBe(200);
    expect(back.body.planned_date).toBeNull();
    expect(back.body.day_part).toBeNull();
  });
  it('kind mag titel/deadline/punten van ouder-kaart niet wijzigen en niet verwijderen', async () => {
    expect((await sepp.patch(`/api/cards/${parentCardId}`, { title: 'X' })).status).toBe(403);
    expect((await sepp.patch(`/api/cards/${parentCardId}`, { deadline: null })).status).toBe(403);
    expect((await sepp.del(`/api/cards/${parentCardId}`)).status).toBe(403);
  });
  it('kind bewerkt en verwijdert eigen kaart', async () => {
    expect((await sepp.patch(`/api/cards/${ownCardId}`, { title: 'Lego' })).body.title).toBe('Lego');
    expect((await sepp.patch(`/api/cards/${ownCardId}`, { points: 3 })).status).toBe(403);
    expect((await sepp.del(`/api/cards/${ownCardId}`)).status).toBe(204);
    expect((await sepp.patch(`/api/cards/${ownCardId}`, { title: 'Weg' })).status).toBe(404);
  });
  it('ander kind komt er niet bij', async () => {
    expect((await liz.patch(`/api/cards/${ownCardId}`, { plannedDate: '2026-09-15', dayPart: 'avond' })).status).toBe(403);
    expect((await liz.post(`/api/cards/${ownCardId}/done`)).status).toBe(403);
  });
  it('ouder mag alles', async () => {
    expect((await papa.patch(`/api/cards/${ownCardId}`, { title: 'Aangepast', points: 2 })).status).toBe(200);
    expect((await papa.del(`/api/cards/${ownCardId}`)).status).toBe(204);
  });
});
