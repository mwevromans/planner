import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { appWith, as, loginAs, testDb } from './helpers.js';

let app: ReturnType<typeof appWith>;
beforeEach(() => { app = appWith(testDb()); });

describe('login', () => {
  it('kind zonder pin logt in zonder pin', async () => {
    const r = await request(app).post('/api/login').send({ profileId: 1 });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.profile.name).toBe('Sepp');
    expect(r.body.profile.pin).toBeUndefined();
  });
  it('ouder met foute pin krijgt 401', async () => {
    const r = await request(app).post('/api/login').send({ profileId: 3, pin: '0000' });
    expect(r.status).toBe(401);
  });
  it('ouder met goede pin logt in', async () => {
    const r = await request(app).post('/api/login').send({ profileId: 3, pin: '1234' });
    expect(r.status).toBe(200);
    expect(r.body.profile.role).toBe('parent');
  });
  it('onbekend profiel 401', async () => {
    const r = await request(app).post('/api/login').send({ profileId: 99 });
    expect(r.status).toBe(401);
  });
});

describe('profielen', () => {
  it('GET /api/profiles is publiek, verbergt pin en toont hasPin', async () => {
    const r = await request(app).get('/api/profiles');
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(4);
    expect(r.body[2].hasPin).toBe(true);
    expect(r.body[0].hasPin).toBe(false);
    expect(r.body[2].pin).toBeUndefined();
  });
  it('zonder token 401, kind 403 bij aanmaken', async () => {
    expect((await request(app).post('/api/profiles').send({})).status).toBe(401);
    const kid = as(app, await loginAs(app, 'Sepp'));
    const r = await kid.post('/api/profiles', { name: 'X', avatar: '🐸', color: '#ffffff', role: 'kid' });
    expect(r.status).toBe(403);
  });
  it('ouder maakt profiel aan en wijzigt density', async () => {
    const p = as(app, await loginAs(app, 'Papa'));
    const c = await p.post('/api/profiles', { name: 'Noor', avatar: '🐸', color: '#a1b2c3', role: 'kid' });
    expect(c.status).toBe(201);
    expect(c.body.density).toBe('normal');
    const u = await p.patch(`/api/profiles/${c.body.id}`, { density: 'simple' });
    expect(u.status).toBe(200);
    expect(u.body.density).toBe('simple');
  });
  it('ouder zonder pin is niet toegestaan', async () => {
    const p = as(app, await loginAs(app, 'Papa'));
    const c = await p.post('/api/profiles', { name: 'Oma', avatar: '👵', color: '#a1b2c3', role: 'parent' });
    expect(c.status).toBe(400);
  });
  it('laatste ouder kan niet weg, andere wel', async () => {
    const p = as(app, await loginAs(app, 'Papa'));
    expect((await p.del('/api/profiles/4')).status).toBe(204);
    expect((await p.del('/api/profiles/3')).status).toBe(409);
  });
  it('ongeldige invoer geeft 400', async () => {
    const p = as(app, await loginAs(app, 'Papa'));
    const c = await p.post('/api/profiles', { name: '', avatar: '🐸', color: 'rood', role: 'kid' });
    expect(c.status).toBe(400);
  });
});
