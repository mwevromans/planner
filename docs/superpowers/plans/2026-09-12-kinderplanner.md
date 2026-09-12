# Kinderplanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een self-hosted weekplanner-PWA waarmee Sepp en Liz taken van de stapel naar dagdelen slepen, afvinken, punten sparen en inwisselen, met een ouderpaneel en een leesbare API.

**Architecture:** Monorepo met `backend/` (Express + `node:sqlite`, serveert ook de gebouwde frontend) en `frontend/` (React + Vite + dnd-kit). Alle regels (rechten, punten, streak, herhalingen) zitten in backend-services met vitest-tests tegen een in-memory database; de frontend is een dunne, speelse laag over de JSON-API.

**Tech Stack:** Node 24, TypeScript, Express 4, zod, vitest, React 18, Vite 6, @dnd-kit/core, canvas-confetti, Docker.

**Spec:** `docs/superpowers/specs/2026-09-12-kinderplanner-design.md`

## Global Constraints

- Node 24, `node:sqlite` (geen native modules).
- Taal in UI: Nederlands. Dagdelen exact: `ochtend | middag | namiddag | avond`.
- Weekdagen 1..7 met 1 = maandag. Datums als `YYYY-MM-DD`, tijden als `HH:MM`.
- Kind wijzigt alleen eigen kaarten; punten zet alleen een ouder.
- Seed: profielen Sepp, Liz, Papa, Mama; ouder-pin `1234`.
- Eén databasebestand in `backend/data/planner.db` (pad via `DB_PATH`, `:memory:` in tests).

---

## Bestandsstructuur

```
backend/
  package.json, tsconfig.json, vitest.config.ts
  src/
    index.ts            start server, serveert frontend/dist
    app.ts              createApp(db) → Express app (testbaar zonder poort)
    db.ts               openDb(path) → schema aanmaken + seed
    types.ts            gedeelde types (Profile, Card, Recurrence, Reward, Redemption, DayPart)
    auth.ts             login, tokens, requireAuth/requireParent middleware
    dates.ts            weekStart, addDays, today, weekday (1..7)
    services/
      profiles.ts       list/create/update/remove/verifyPin
      cards.ts          create/update/remove/move/done/undone/approve/reject + rechten
      recurrences.ts    CRUD + materializeWeek(db, profileId, weekStart)
      points.ts         balance(db, profileId), streak(db, profileId, today)
      rewards.ts        rewards CRUD, redemptions request/approve/deny
      overview.ts       overview(date), summary(profileId)
    routes/
      profiles.ts cards.ts recurrences.ts rewards.ts overview.ts
  test/
    helpers.ts          testDb(), appWith(db), loginAs(app, name)
    *.test.ts           per service/route
frontend/
  package.json, tsconfig.json, vite.config.ts, index.html
  public/manifest.webmanifest, icons
  src/
    main.tsx, App.tsx (router op hash), api.ts, session.ts
    icons.ts            emoji-set gegroepeerd
    styles.css
    screens/ProfilePicker.tsx, WeekBoard.tsx, DayZoom.tsx, Shop.tsx, ParentPanel.tsx, Overview.tsx
    components/Card.tsx, Stack.tsx, CardPanel.tsx, CardForm.tsx, PinPad.tsx, Header.tsx
Dockerfile, docker-compose.yml, README.md
```

---

### Task 1: Backend-scaffold, schema en seed

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`
- Create: `backend/src/types.ts`, `backend/src/db.ts`, `backend/src/dates.ts`
- Test: `backend/test/db.test.ts`, `backend/test/dates.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): DatabaseSync` (schema + seed als leeg), types `DayPart`, `Profile`, `Card`, `Recurrence`, `Reward`, `Redemption`, `dates.ts`: `today(): string`, `addDays(d: string, n: number): string`, `weekStart(d: string): string` (maandag), `weekday(d: string): number` (1..7).

- [ ] **Step 1: package.json en tsconfig**

```json
{
  "name": "planner-backend", "private": true, "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts", "build": "tsc", "start": "node dist/index.js", "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "express": "^4.21.2", "zod": "^3.24.4" },
  "devDependencies": { "@types/express": "^4.17.21", "@types/node": "^24.0.0", "tsx": "^4.19.3", "typescript": "^5.8.3", "vitest": "^2.1.9" }
}
```
tsconfig: `module: NodeNext`, `target: ES2022`, `outDir: dist`, `rootDir: src`, `strict: true`, `types: ["node"]`.

- [ ] **Step 2: Failing tests**

```ts
// test/db.test.ts
import { openDb } from '../src/db.js';
test('seed maakt vier profielen en ouder-pin', () => {
  const db = openDb(':memory:');
  const rows = db.prepare('select name, role, pin from profiles order by sort').all() as any[];
  expect(rows.map(r => r.name)).toEqual(['Sepp', 'Liz', 'Papa', 'Mama']);
  expect(rows[2].pin).toBe('1234');
});
test('openDb is idempotent', () => { const db = openDb(':memory:'); expect(() => openDb(':memory:')).not.toThrow(); });
// test/dates.test.ts
test('weekStart geeft maandag', () => expect(weekStart('2026-09-12')).toBe('2026-09-07'));
test('weekday: zondag is 7', () => expect(weekday('2026-09-13')).toBe(7));
test('addDays over maandgrens', () => expect(addDays('2026-09-30', 1)).toBe('2026-10-01'));
```

- [ ] **Step 3: Schema (db.ts)**

```sql
create table if not exists profiles(id integer primary key, name text not null, avatar text not null, color text not null,
  role text not null check(role in ('kid','parent')), pin text, density text not null default 'normal', sort integer not null default 0);
create table if not exists recurrences(id integer primary key, profile_id integer not null references profiles(id) on delete cascade,
  title text not null, icon text not null, color text not null, points integer not null default 0, weekdays text not null,
  day_part text not null, time text, active integer not null default 1, created_by integer not null);
create table if not exists cards(id integer primary key, profile_id integer not null references profiles(id) on delete cascade,
  title text not null, icon text not null, color text not null, points integer not null default 0, deadline text, planned_date text,
  day_part text, time text, notes text not null default '', created_by integer not null, recurrence_id integer references recurrences(id) on delete set null,
  done_at text, approved_at text, approved_by integer, created_at text not null default (datetime('now')),
  unique(recurrence_id, planned_date));
create table if not exists rewards(id integer primary key, title text not null, icon text not null, cost integer not null, active integer not null default 1);
create table if not exists redemptions(id integer primary key, profile_id integer not null references profiles(id) on delete cascade,
  reward_id integer not null references rewards(id), cost integer not null, requested_at text not null default (datetime('now')),
  approved_at text, approved_by integer, denied_at text);
```
Seed als `profiles` leeg: Sepp (🦖, kid, normal), Liz (🦄, kid, simple), Papa (👨, parent, 1234), Mama (👩, parent, 1234); rewards: "Half uur extra schermtijd" 📱 20, "Kiezen wat we eten" 🍕 40, "Film kiezen" 🎬 30.

- [ ] **Step 4: Tests groen, commit** `feat(backend): schema, seed en datumhelpers`

---

### Task 2: Auth en profielen

**Files:**
- Create: `backend/src/auth.ts`, `backend/src/services/profiles.ts`, `backend/src/routes/profiles.ts`, `backend/src/app.ts`
- Test: `backend/test/helpers.ts`, `backend/test/auth.test.ts`

**Interfaces:**
- Produces: `createApp(db): express.Express`; `login(db, profileId, pin?) → {token, profile} | null`; middleware `requireAuth` zet `req.user: Profile`; `requireParent`; helper `canTouch(user, profileId)`.
- `POST /api/login`, `GET /api/profiles` (P, geen pin, wel `hasPin`), `POST/PATCH/DELETE /api/profiles` (O).

- [ ] **Step 1: Failing tests**

```ts
test('kind zonder pin logt in zonder pin', async () => { const r = await request(app).post('/api/login').send({profileId: 1}); expect(r.status).toBe(200); expect(r.body.token).toBeTruthy(); });
test('ouder met foute pin krijgt 401', ...);
test('GET /api/profiles verbergt pin, toont hasPin', ...);
test('kind mag geen profiel aanmaken (403)', ...);
test('ouder maakt profiel aan en wijzigt density', ...);
```
Gebruik `supertest` (devDependency) en `helpers.ts`: `testDb()`, `appWith(db)`, `loginAs(app, 'Sepp' | 'Papa')` → token.

- [ ] **Step 2: Implementatie**: tokens = `crypto.randomUUID()` in `Map<string, number>` (token → profileId). `requireAuth` leest Bearer, laadt profiel vers uit db (zodat density-wijzigingen doorkomen). Validatie met zod.

- [ ] **Step 3: Groen, commit** `feat(backend): login, tokens en profielbeheer`

---

### Task 3: Kaarten met rechten

**Files:**
- Create: `backend/src/services/cards.ts`, `backend/src/routes/cards.ts`
- Test: `backend/test/cards.test.ts`

**Interfaces:**
- Produces: `createCard(db, user, input)`, `updateCard(db, user, id, patch)`, `deleteCard(db, user, id)`. Input-zod: `{profileId, title, icon, color, points?, deadline?, plannedDate?, dayPart?, time?, notes?}`. Patch: dezelfde velden optioneel plus `plannedDate: null` om naar stapel te leggen.
- Fouten: `403` bij rechten, `404`, `400` bij validatie; als `PlannerError(status, message)`.

- [ ] **Step 1: Failing tests** (elk een `it`)

- kind maakt eigen kaart, `points` wordt 0 ook als 5 meegegeven → 400? Nee: **negeer stilzwijgend niet** — geef 403 met "Alleen een ouder mag punten geven".
- kind maakt kaart voor ander kind → 403.
- ouder maakt kaart met punten 10 voor Sepp → 201.
- kind verplaatst ouder-kaart naar `2026-09-15/namiddag` → 200; titel wijzigen → 403; verwijderen → 403.
- kind bewerkt en verwijdert eigen kaart → 200/204.
- `plannedDate` zonder `dayPart` → 400; `plannedDate: null` legt op stapel en wist `dayPart` en `time`? Nee: `time` blijft (tijd hoort bij de kaart), `dayPart` wordt null.
- ongeldige `dayPart` → 400.

- [ ] **Step 2: Implementatie**: `canEditContent(user, card) = user.role==='parent' || card.created_by===user.id`; `canMove(user, card) = user.role==='parent' || card.profile_id===user.id`.

- [ ] **Step 3: Groen, commit** `feat(backend): kaarten aanmaken, verplaatsen, bewerken met rechten`

---

### Task 4: Afvinken, goedkeuren, saldo

**Files:**
- Modify: `backend/src/services/cards.ts`, `backend/src/routes/cards.ts`
- Create: `backend/src/services/points.ts`
- Test: `backend/test/done.test.ts`

**Interfaces:**
- Produces: `markDone(db, user, id)`, `markUndone(db, user, id)`, `approveCard(db, parent, id)`, `rejectCard(db, parent, id)`, `balance(db, profileId): number`, `pendingCards(db): Card[]`. Routes `/api/cards/:id/done|undone|approve|reject`, `GET /api/approvals`.

- [ ] **Step 1: Failing tests**

- kaart 0 punten: done → `done_at` gezet, saldo blijft 0, `needsApproval: false` in antwoord.
- kaart 10 punten: done → saldo 0; approve door ouder → saldo 10; approve door kind → 403.
- undone na approve → 409.
- reject → `done_at` null, saldo 0.
- `GET /api/approvals` toont alleen done-en-niet-approved kaarten met punten > 0.

- [ ] **Step 2: Implementatie.** `balance = coalesce(sum(points) where approved_at not null) - coalesce(sum(cost) from redemptions where approved_at not null)`.

- [ ] **Step 3: Groen, commit** `feat(backend): afvinken, goedkeuren en saldo`

---

### Task 5: Herhalingen, weekweergave en streak

**Files:**
- Create: `backend/src/services/recurrences.ts`, `backend/src/routes/recurrences.ts`
- Modify: `backend/src/services/points.ts` (streak), `backend/src/routes/cards.ts` (week-endpoint)
- Test: `backend/test/week.test.ts`

**Interfaces:**
- Produces: `materializeWeek(db, profileId, weekStart)` (insert or ignore per actieve recurrence × weekdag), `getWeek(db, user, profileId, weekStart) → {weekStart, cards, stack, balance, streak}`, `streak(db, profileId, today): number`.
- `GET /api/kids/:id/week?start=`; recurrences CRUD (O).

- [ ] **Step 1: Failing tests**

- recurrence di+do 16:30 namiddag → week laden geeft 2 kaarten met `recurrence_id`, tweede keer laden geeft nog steeds 2 (unique index).
- verwijderde instantie komt niet terug: verwijderen zet geen nieuwe → test dat `delete` van instantie een rij in `cards` laat staan met `deleted`? Eenvoudiger: instantie verwijderen = `planned_date` blijft, maar rij krijgt `done_at = null` en wordt echt verwijderd; unique index voorkomt terugkomen niet. **Oplossing:** verwijderen van een recurrence-instantie zet `profile_id` niet, maar markeert `skipped = 1` (kolom toevoegen in Task 1-schema: `skipped integer not null default 0`); week-endpoint filtert `skipped = 0`. Test: na verwijderen komt hij niet terug.
- stack bevat alleen `planned_date is null` kaarten, gesorteerd deadline asc, nulls laatst.
- streak: dag −1 en −2 alles klaar, vandaag nog 1 open → 2; vandaag ook klaar → 3; dag −2 had niets gepland → stopt: 1 (met vandaag open) .
- `start` niet maandag → 400.

- [ ] **Step 2: Implementatie.** Streak: loop `d = today`; als dag `today` open kaarten heeft, begin bij `today-1`. Per dag: `total = count(planned_date = d and skipped=0)`, `done = count(... and done_at not null)`; tel zolang `total > 0 && done === total`, max 365.

- [ ] **Step 3: Groen, commit** `feat(backend): herhalingen, weekweergave en streak`

---

### Task 6: Beloningen en inwisselen

**Files:**
- Create: `backend/src/services/rewards.ts`, `backend/src/routes/rewards.ts`
- Test: `backend/test/rewards.test.ts`

**Interfaces:**
- Produces: rewards CRUD (O), `requestRedemption(db, user, rewardId)` (kind, eigen profiel; `available = balance - reserved`), `approveRedemption`, `denyRedemption`, `listRedemptions(db, profileId?)`. `GET /api/approvals` bevat nu ook `redemptions`.

- [ ] **Step 1: Failing tests**: saldo 30, reward 20 → aanvraag ok; tweede aanvraag 20 → 409 "Niet genoeg punten" (gereserveerd); ouder approve → saldo 10; deny → saldo terug 30; kind kan geen reward aanmaken (403); inactieve reward → 404.

- [ ] **Step 2: Implementatie, groen, commit** `feat(backend): winkeltje en inwisselen`

---

### Task 7: Overzicht, summary, statische frontend, server

**Files:**
- Create: `backend/src/services/overview.ts`, `backend/src/routes/overview.ts`, `backend/src/index.ts`
- Test: `backend/test/overview.test.ts`

**Interfaces:**
- `GET /api/overview?date=` (P) → `{date, kids: [{profile, cards (die dag, skipped=0, gesorteerd dagdeel dan tijd), balance, streak}]}` — materialiseert de week van `date` voor elk kind.
- `GET /api/kids/:id/summary` (P) → `{name, balance, streak, todayTotal, todayDone, pendingApprovals}`.
- `index.ts`: `PORT` (default 3000), `DB_PATH`, serveert `../frontend/dist` met fallback naar `index.html`.

- [ ] Tests: overview bevat beide kinderen en materialiseert; summary telt correct. Commit `feat(backend): overzicht en HA-summary`.

---

### Task 8: Frontend-scaffold, API-client, profielkiezer

**Files:**
- Create: `frontend/package.json`, `vite.config.ts` (proxy `/api` → 3000), `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/session.ts`, `src/styles.css`, `src/icons.ts`, `src/components/PinPad.tsx`, `src/screens/ProfilePicker.tsx`

**Interfaces:**
- `api.ts`: `api.get/post/patch/del(path, body?)` met Bearer uit `session`; typed wrappers `getWeek(kidId, start)`, `moveCard(id, plannedDate, dayPart)`, etc. Types gekopieerd uit backend `types.ts` naar `frontend/src/types.ts`.
- `session.ts`: `{token, profile}` in `localStorage`, `useSession()` hook.
- Router: hash-routes `#/`, `#/week/:kidId`, `#/dag/:kidId/:date`, `#/winkel/:kidId`, `#/ouders`, `#/overzicht`.

- [ ] Steps: scaffold, styles met CSS-variabelen (`--bg`, pastelkleuren `--c-geel, --c-groen, --c-blauw, --c-roze, --c-paars, --c-oranje`, grote radius 20px, font system-ui rounded), ProfilePicker toont avatars uit `GET /api/profiles`; tik → als `hasPin` PinPad anders direct login. Ouder landt op `#/ouders`, kind op `#/week/:id`. Verifieer met `npm run build` en handmatig. Commit `feat(frontend): scaffold en profielkiezer`.

---

### Task 9: Weekbord met slepen, stapel en afvinken

**Files:**
- Create: `src/screens/WeekBoard.tsx`, `src/components/Card.tsx`, `src/components/Stack.tsx`, `src/components/Header.tsx`

**Interfaces:**
- `WeekBoard({kidId})`: laadt `getWeek`, state `week`. Grid: kolommen 7 dagen (kop: "ma 14", vandaag gemarkeerd, klik → `#/dag/...`), rijen 4 dagdelen. Elke cel is een `useDroppable({id: `${date}|${dayPart}`})`. Stapel is droppable `stack`.
- `Card({card, density, onTap})`: `useDraggable({id: card.id})`; toont icoon groot, titel, tijd indien gezet, ster+punten indien >0, deadline-badge ("vr" of rood "te laat"), vinkje indien done, zandloper indien wacht op goedkeuring. Kleur = `card.color`.
- Drop → `moveCard` optimistic, dan herladen. Tik → `CardPanel` (Task 10). Afvinken vanuit panel én via lang indrukken? Nee: alleen via panel plus een grote "Klaar!"-knop in het panel. Confetti bij done (`canvas-confetti`).
- Header: avatar, naam, ⭐ saldo (klik → winkel), 🔥 streak, ‹ week ›, "Vandaag", knop wissel profiel.
- Density `simple`: klasse `density-simple` op root: kaart 96px hoog, icoon 40px, titel 12px, geen notities.

- [ ] Steps: bouw, typecheck, handmatig testen op touch (dnd-kit `PointerSensor` met `activationConstraint: {distance: 6}` zodat tikken niet sleept). Commit `feat(frontend): weekbord met slepen en stapel`.

---

### Task 10: Kaartpaneel, kaart aanmaken, dag-zoom

**Files:**
- Create: `src/components/CardPanel.tsx`, `src/components/CardForm.tsx`, `src/screens/DayZoom.tsx`

**Interfaces:**
- `CardPanel({card, user, onClose, onChanged})`: knoppen "Klaar!" / "Toch niet", "Terug op de stapel", "Bewerken" (als `canEdit`), "Weg" (als `canEdit`, met bevestiging). Toont notitie, deadline, tijd, punten, status.
- `CardForm({initial?, profileId, user, onSaved})`: titel, iconkiezer (raster uit `icons.ts`, gegroepeerd: School 📚✏️🧮📖, Sport ⚽🏊🚴🥋, Thuis 🧹🛏️🍽️🐕, Leuk 🎮🎨🎵🎲…), kleurkiezer (6 bolletjes), deadline (date input), tijd (time input), notitie, punten (alleen zichtbaar voor ouder). Kind maakt kaart altijd op de stapel.
- `DayZoom({kidId, date})`: vier secties, kaarten groot, gesorteerd op tijd; ‹ dag ›; terug naar week.

- [ ] Commit `feat(frontend): kaartpaneel, formulier en dag-zoom`.

---

### Task 11: Winkeltje

**Files:** `src/screens/Shop.tsx`

- Raster van actieve rewards: icoon, titel, prijs. "Kies" uit als `available < cost` (available = balance − gereserveerd; backend geeft `available` mee in `GET /api/redemptions?profileId=` antwoord: `{balance, reserved, items}`). Lijst eigen aanvragen met status (wacht / gekregen / nee). Confetti bij goedgekeurd zichtbaar? Nee, bij aanvraag een korte "Aangevraagd!"-toast.

- [ ] Commit `feat(frontend): winkeltje`.

---

### Task 12: Ouderpaneel

**Files:** `src/screens/ParentPanel.tsx` (tabs als kleine componenten in hetzelfde bestand mag als < 300 regels, anders splitsen in `parent/Approvals.tsx`, `parent/Cards.tsx`, `parent/Rewards.tsx`, `parent/Family.tsx`)

- **Goedkeuren**: lijst kaarten (kind, icoon, titel, punten, wanneer) met ✓ / ✗; lijst inwisselingen met ✓ / ✗.
- **Kaarten**: kindkiezer; knop "Open weekbord" (ouder sleept daar zelf); `CardForm` voor nieuwe kaart met punten en deadline; lijst herhalingen met formulier (weekdag-knoppen ma..zo, dagdeel, tijd, punten) en aan/uit.
- **Beloningen**: lijst + formulier (titel, icoon, prijs, actief).
- **Gezin**: profielen: naam, avatar, kleur, dichtheid, pin wijzigen.

- [ ] Commit `feat(frontend): ouderpaneel`.

---

### Task 13: Gezinsoverzicht en PWA

**Files:** `src/screens/Overview.tsx`, `frontend/public/manifest.webmanifest`, `frontend/public/icon-192.png`, `icon-512.png`, `index.html` meta (`apple-mobile-web-app-capable`, theme-color, viewport-fit)

- `Overview`: `GET /api/overview?date=today` elke 60 s; per kind een kolom met vier dagdelen, kaarten groot, done doorgestreept met ✓, saldo en streak in de kop. Geen login, geen interactie. Icons genereren met een klein script (SVG → PNG via `sharp`? Nee, geen extra dependency: lever een eenvoudige SVG en gebruik `icon.svg` in manifest plus een PNG geëxporteerd één keer met `rsvg-convert` als aanwezig, anders alleen SVG).

- [ ] Commit `feat(frontend): gezinsoverzicht en PWA-manifest`.

---

### Task 14: Docker, compose, README

**Files:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`

- Dockerfile: stage 1 `node:24-alpine` bouwt frontend; stage 2 bouwt backend; stage 3 runtime met `backend/dist`, `backend/node_modules` (prod), `frontend/dist`. `ENV DB_PATH=/data/planner.db`, `VOLUME /data`, `EXPOSE 3000`.
- compose: service `planner`, `ports: 3000:3000`, volume `./data:/data`, `restart: unless-stopped`.
- README: wat het is, starten met compose, eerste login (pin 1234 wijzigen), iPad-installatie (Delen → Zet op beginscherm), HA REST-sensor voorbeeld op `/api/kids/1/summary`, API-overzicht.

- [ ] Verifieer `docker build` lokaal slaagt en container antwoordt op `/api/profiles`. Commit `chore: docker en readme`.

---

## Self-review

- Spec §2 dekking: profielkiezer (8), weekbord/stapel/slepen (9), dag-zoom (10), kaartvelden (3, 10), herhalingen (5, 12), afvinken/confetti/goedkeuring (4, 9, 10, 12), streak (5), winkeltje (6, 11), ouderpaneel (12), overzicht (7, 13), dichtheid (2, 9), API (2–7), HA-summary (7). Skipped-kolom voor verwijderde herhalings-instanties toegevoegd aan schema in Task 1 (correctie op spec §4: instantie verwijderen = `skipped = 1`).
- Namen consistent: `plannedDate/dayPart/time` (camelCase in API), `planned_date/day_part` (db). `available = balance − reserved` in Task 6 en 11.
