import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

// Via getBuiltinModule zodat bundelaars (vitest/vite) de module niet proberen te resolven.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
export type Db = DatabaseSyncType;

const SCHEMA = `
create table if not exists profiles(
  id integer primary key,
  name text not null,
  avatar text not null,
  color text not null,
  role text not null check(role in ('kid','parent','family')),
  pin text,
  density text not null default 'normal',
  sort integer not null default 0,
  tag text
);
create table if not exists recurrences(
  id integer primary key,
  profile_id integer not null references profiles(id) on delete cascade,
  title text not null,
  icon text not null,
  color text not null,
  points integer not null default 0,
  weekdays text not null,
  day_part text not null,
  time text,
  active integer not null default 1,
  created_by integer not null
);
create table if not exists cards(
  id integer primary key,
  profile_id integer not null references profiles(id) on delete cascade,
  title text not null,
  icon text not null,
  color text not null,
  points integer not null default 0,
  deadline text,
  planned_date text,
  day_part text,
  time text,
  notes text not null default '',
  created_by integer not null,
  recurrence_id integer references recurrences(id) on delete set null,
  origin_date text,
  skipped integer not null default 0,
  done_at text,
  approved_at text,
  approved_by integer,
  created_at text not null default (datetime('now')),
  unique(recurrence_id, origin_date)
);
create table if not exists rewards(
  id integer primary key,
  title text not null,
  icon text not null,
  cost integer not null,
  active integer not null default 1
);
create table if not exists external_events(
  id integer primary key,
  uid text not null,
  profile_id integer not null,
  title text not null,
  date text not null,
  day_part text not null,
  time text,
  all_day integer not null default 0,
  location text not null default '',
  synced_at text not null
);
create index if not exists external_events_date on external_events(profile_id, date);
create table if not exists redemptions(
  id integer primary key,
  profile_id integer not null references profiles(id) on delete cascade,
  reward_id integer not null references rewards(id),
  cost integer not null,
  requested_at text not null default (datetime('now')),
  approved_at text,
  approved_by integer,
  denied_at text
);
`;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on;');
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  return db;
}

/** Databases van vóór het gezinsprofiel kennen de rol 'family' nog niet in de check-constraint. */
function migrate(db: Db) {
  const cols = (db.prepare('pragma table_info(profiles)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('tag')) db.exec('alter table profiles add column tag text');
  const sql = (db.prepare("select sql from sqlite_master where type='table' and name='profiles'").get() as { sql: string }).sql;
  if (sql.includes("'family'")) return;
  db.exec(`
    pragma foreign_keys = off;
    begin;
    create table profiles_new(
      id integer primary key,
      name text not null,
      avatar text not null,
      color text not null,
      role text not null check(role in ('kid','parent','family')),
      pin text,
      density text not null default 'normal',
      sort integer not null default 0,
      tag text
    );
    insert into profiles_new select id, name, avatar, color, role, pin, density, sort, tag from profiles;
    drop table profiles;
    alter table profiles_new rename to profiles;
    commit;
    pragma foreign_keys = on;
  `);
}

function seed(db: Db) {
  const count = (db.prepare("select count(*) as n from profiles where role <> 'family'").get() as { n: number }).n;
  if (count > 0) { ensureFamilyProfile(db); return; }
  const ins = db.prepare(
    'insert into profiles(name, avatar, color, role, pin, density, sort, tag) values (?,?,?,?,?,?,?,?)',
  );
  ins.run('Sepp', '🦖', '#7dd3fc', 'kid', null, 'normal', 1, 's');
  ins.run('Liz', '🦄', '#f9a8d4', 'kid', null, 'simple', 2, 'l');
  ins.run('Papa', '👨', '#a7f3d0', 'parent', '1234', 'normal', 3, null);
  ins.run('Mama', '👩', '#fde68a', 'parent', '1234', 'normal', 4, null);
  const rew = db.prepare('insert into rewards(title, icon, cost) values (?,?,?)');
  rew.run('Half uur extra schermtijd', '📱', 20);
  rew.run('Film kiezen', '🎬', 30);
  rew.run('Kiezen wat we eten', '🍕', 40);
  ensureFamilyProfile(db);
}

/** Eén systeemprofiel "Gezin" voor familie-evenementen; bestaande databases krijgen het er bij. */
function ensureFamilyProfile(db: Db) {
  const has = (db.prepare("select count(*) as n from profiles where role='family'").get() as { n: number }).n;
  if (has > 0) return;
  db.prepare("insert into profiles(name, avatar, color, role, pin, density, sort) values ('Gezin','🏠','#fecaca','family',null,'normal',0)").run();
}

export function familyProfileId(db: Db): number {
  return (db.prepare("select id from profiles where role='family' limit 1").get() as { id: number }).id;
}
