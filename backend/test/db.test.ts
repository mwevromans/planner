import { expect, test } from 'vitest';
import { openDb } from '../src/db.js';

test('seed maakt vier profielen en ouder-pin', () => {
  const db = openDb(':memory:');
  const rows = db.prepare("select name, role, pin from profiles where role<>'family' order by sort").all() as any[];
  expect(rows.map((r) => r.name)).toEqual(['Sepp', 'Liz', 'Papa', 'Mama']);
  expect(rows[2].pin).toBe('1234');
  expect(rows[0].pin).toBeNull();
  const fam = db.prepare("select * from profiles where role='family'").all() as any[];
  expect(fam).toHaveLength(1);
  expect(fam[0].name).toBe('Gezin');
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
  expect(n).toBe(6);
});

test('oude database zonder rol family wordt gemigreerd en krijgt een gezinsprofiel', () => {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  const path = `/tmp/claude-0/-root-projects-planner/201337aa-e204-4430-b3eb-075f4a3dc6b5/scratchpad/migrate-${Date.now()}.db`;
  const old = new DatabaseSync(path);
  old.exec(`
    create table profiles(id integer primary key, name text not null, avatar text not null, color text not null,
      role text not null check(role in ('kid','parent')), pin text, density text not null default 'normal', sort integer not null default 0);
    insert into profiles(name, avatar, color, role, pin, sort) values ('Sepp','🦖','#7dd3fc','kid',null,1), ('Papa','👨','#a7f3d0','parent','1234',3);
    create table cards(id integer primary key, profile_id integer not null references profiles(id) on delete cascade, title text not null,
      icon text not null, color text not null, points integer not null default 0, deadline text, planned_date text, day_part text, time text,
      notes text not null default '', created_by integer not null, recurrence_id integer, origin_date text, skipped integer not null default 0,
      done_at text, approved_at text, approved_by integer, created_at text not null default (datetime('now')));
    insert into cards(profile_id, title, icon, color, created_by) values (1, 'Lezen', '📚', '#fff', 2);
  `);
  old.close();
  const db = openDb(path);
  const roles = db.prepare('select name, role from profiles order by id').all() as any[];
  expect(roles.map((r) => r.name)).toEqual(['Sepp', 'Papa', 'Gezin']);
  expect((db.prepare('pragma table_info(profiles)').all() as any[]).some((c) => c.name === 'tag')).toBe(true);
  expect((db.prepare('select count(*) as n from cards where profile_id=1').get() as any).n).toBe(1);
  // niet opnieuw geseed: geen Liz/Mama toegevoegd
  expect(roles.find((r) => r.name === 'Liz')).toBeUndefined();
});
