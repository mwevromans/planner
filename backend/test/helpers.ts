import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb, type Db } from '../src/db.js';

export function testDb(): Db {
  return openDb(':memory:');
}

export function appWith(db: Db) {
  return createApp(db);
}

export type Who = 'Sepp' | 'Liz' | 'Papa' | 'Mama';
const ids: Record<Who, number> = { Sepp: 1, Liz: 2, Papa: 3, Mama: 4 };

export async function loginAs(app: ReturnType<typeof createApp>, who: Who): Promise<string> {
  const pin = who === 'Papa' || who === 'Mama' ? '1234' : undefined;
  const r = await request(app).post('/api/login').send({ profileId: ids[who], pin });
  if (r.status !== 200) throw new Error(`login ${who} faalde: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}

export function as(app: ReturnType<typeof createApp>, token: string) {
  return {
    get: (p: string) => request(app).get(p).set('Authorization', `Bearer ${token}`),
    post: (p: string, body?: unknown) => request(app).post(p).set('Authorization', `Bearer ${token}`).send(body),
    patch: (p: string, body?: unknown) => request(app).patch(p).set('Authorization', `Bearer ${token}`).send(body),
    del: (p: string) => request(app).delete(p).set('Authorization', `Bearer ${token}`),
  };
}
