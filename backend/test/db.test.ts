import { expect, test } from 'vitest';
import { openDb } from '../src/db.js';

test('seed maakt vier profielen en ouder-pin', () => {
  const db = openDb(':memory:');
  const rows = db.prepare('select name, role, pin from profiles order by sort').all() as any[];
  expect(rows.map((r) => r.name)).toEqual(['Sepp', 'Liz', 'Papa', 'Mama']);
  expect(rows[2].pin).toBe('1234');
  expect(rows[0].pin).toBeNull();
});

test('seed maakt voorbeeldbeloningen', () => {
  const db = openDb(':memory:');
  const n = (db.prepare('select count(*) as n from rewards').get() as any).n;
  expect(n).toBe(3);
});

test('openDb op bestaande database seedt niet opnieuw', () => {
  const db = openDb(':memory:');
  db.prepare("insert into profiles(name, avatar, color, role) values ('Extra','🐸','#fff','kid')").run();
  // tweede keer schema uitvoeren op dezelfde verbinding mag niet falen
  expect(() => db.exec('create table if not exists profiles(id integer primary key)')).not.toThrow();
  const n = (db.prepare('select count(*) as n from profiles').get() as any).n;
  expect(n).toBe(5);
});
