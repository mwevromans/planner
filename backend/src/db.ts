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
  role text not null check(role in ('kid','parent')),
  pin text,
  density text not null default 'normal',
  sort integer not null default 0
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
  skipped integer not null default 0,
  done_at text,
  approved_at text,
  approved_by integer,
  created_at text not null default (datetime('now')),
  unique(recurrence_id, planned_date)
);
create table if not exists rewards(
  id integer primary key,
  title text not null,
  icon text not null,
  cost integer not null,
  active integer not null default 1
);
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
  seed(db);
  return db;
}

function seed(db: Db) {
  const count = (db.prepare('select count(*) as n from profiles').get() as { n: number }).n;
  if (count > 0) return;
  const ins = db.prepare(
    'insert into profiles(name, avatar, color, role, pin, density, sort) values (?,?,?,?,?,?,?)',
  );
  ins.run('Sepp', '🦖', '#7dd3fc', 'kid', null, 'normal', 1);
  ins.run('Liz', '🦄', '#f9a8d4', 'kid', null, 'simple', 2);
  ins.run('Papa', '👨', '#a7f3d0', 'parent', '1234', 'normal', 3);
  ins.run('Mama', '👩', '#fde68a', 'parent', '1234', 'normal', 4);
  const rew = db.prepare('insert into rewards(title, icon, cost) values (?,?,?)');
  rew.run('Half uur extra schermtijd', '📱', 20);
  rew.run('Film kiezen', '🎬', 30);
  rew.run('Kiezen wat we eten', '🍕', 40);
}
