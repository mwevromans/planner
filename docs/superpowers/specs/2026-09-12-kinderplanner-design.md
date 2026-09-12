# Kinderplanner — ontwerp

Datum: 2026-09-12
Status: goedgekeurd voor fase 1

## 1. Doel

Een speelse weekplanner waarmee Sepp (10, groep 6) en Liz (7, groep 4) zelf leren
plannen. Ouders leggen het raamwerk (vaste items, taken met deadline); de kinderen
slepen die zelf naar een moment in de week en voegen eigen kaarten toe. Doel:
leren plannen, eigen verantwoordelijkheid, overzicht, structuur en rust.

Draait op de interne Proxmox als web-app (PWA). Gebruikt op iPad, computer en
later een wanddashboard. Alleen bereikbaar op het thuisnetwerk.

## 2. Wat in fase 1 zit

- Profielkiezer met avatar; pincode voor ouders, optioneel voor kinderen.
- Weekbord per kind: 7 dagen × 4 dagdelen (ochtend, middag, namiddag, avond).
- De stapel: nog niet geplande kaarten met deadline, gesorteerd op deadline.
- Slepen: stapel → dagvak, dagvak → dagvak, dagvak → stapel.
- Dag-zoom: één dag groot, gegroepeerd per dagdeel, kaarten met tijd op tijd gesorteerd.
- Kaart: titel, icoon (emoji), kleur, optionele deadline, optionele tijd,
  optionele notitie, punten (alleen door ouder te zetten).
- Herhalende kaarten (bijv. voetbaltraining di 16:30): weekdagen + dagdeel + tijd.
- Afvinken: altijd met confetti. Kaarten met punten wachten op ouderbevestiging.
- Streak: aantal dagen op rij waarop alle geplande kaarten van die dag zijn afgevinkt.
- Winkeltje: beloningen met prijs in punten; kind vraagt aan, ouder keurt goed.
- Ouderpaneel: goedkeuren, kaarten en herhalingen beheren, beloningen, gezin.
- Gezinsoverzicht: alleen-lezen scherm met vandaag voor alle kinderen (wanddashboard).
- Weergavedichtheid per kind: `simpel` (Liz: groot icoon, weinig tekst) of `normaal`.
- Leesbare JSON-API, bruikbaar door Home Assistant.

## 3. Wat er bewust niet in zit

- Koppeling met school, Google/iCloud-agenda.
- Badges, boetes, bonussen.
- Accounts, wachtwoorden, HTTPS, toegang van buiten het netwerk.
- Pixel-precieze tijdlijn; de dag-zoom groepeert per dagdeel.
- AI-huiswerkhulp (later los project; sluit aan op dezelfde API).

## 4. Domeinmodel

**Profile** — `id, name, avatar (emoji), color, role (kid|parent), pin (nullable),
density (simple|normal), sort`.

**Card** — het magneetje. `id, profile_id, title, icon, color, points (int, 0 = geen),
deadline (date|null), planned_date (date|null), day_part (ochtend|middag|namiddag|avond|null),
time ('HH:MM'|null), notes, created_by (profile_id), recurrence_id (null|id),
done_at, approved_at, approved_by, created_at`.
Een kaart zonder `planned_date` ligt op de stapel. `planned_date` en `day_part`
zijn altijd samen gezet of samen leeg.

**Recurrence** — sjabloon. `id, profile_id, title, icon, color, points,
weekdays (json array 1..7, 1 = ma), day_part, time, active, created_by`.
Bij het laden van een week worden ontbrekende instanties als gewone kaarten
aangemaakt (`recurrence_id` en `origin_date` gezet; uniek per herhaling en
oorsprongsdag, zodat een verschoven instantie niet opnieuw ontstaat). Daarna
gedragen ze zich als losse kaarten: verschuiven, afvinken, en verwijderen voor
die ene dag (`skipped = 1`, zodat hij niet terugkomt).

**Reward** — `id, title, icon, cost, active`.

**Redemption** — `id, profile_id, reward_id, cost, requested_at, approved_at,
approved_by, denied_at`.

**Saldo** = som van punten van goedgekeurde kaarten − som van `cost` van
goedgekeurde inwisselingen. Geen apart grootboek.

## 5. Regels

- Een kind ziet en wijzigt alleen eigen kaarten. Een ouder alles.
- Een kind mag eigen kaarten aanmaken met `points = 0`. Punten zet alleen een ouder.
- Een kind mag door de ouder gemaakte kaarten verplaatsen en afvinken, niet
  verwijderen of de titel/deadline/punten wijzigen. Eigen kaarten wel.
- Afvinken zet `done_at`. Kaart met `points = 0` telt direct. Kaart met punten
  is "wacht op goedkeuring" tot een ouder `approved_at` zet.
- Ongedaan maken kan zolang niet goedgekeurd.
- Ouder kan bij goedkeuren afwijzen: `done_at` wordt weer leeg.
- Inwisselen: saldo moet ≥ cost zijn op moment van aanvraag; aangevraagde maar
  niet goedgekeurde inwisselingen tellen als gereserveerd (saldo − gereserveerd ≥ cost).
- Streak: tel terug vanaf vandaag (of gisteren als vandaag nog kaarten open heeft):
  een dag telt als alle op die dag geplande kaarten `done_at` hebben en er minstens
  één kaart gepland was. Stop bij de eerste dag die niet voldoet.
- Deadline in het verleden en niet afgevinkt = "te laat" (rood), zowel op de stapel
  als op het bord.

## 6. API (`/api`, JSON)

Auth: `POST /api/login {profileId, pin?}` → `{token, profile}`. Token in
`Authorization: Bearer`. Server houdt tokens in geheugen. Kind zonder pin logt in
zonder pin. Endpoints gemarkeerd (O) vereisen een ouder-token; (P) zijn publiek
leesbaar voor dashboard en Home Assistant.

- `GET /api/profiles` (P) — lijst zonder pins, wel `hasPin`.
- `GET /api/kids/:id/week?start=YYYY-MM-DD` — materialiseert herhalingen, geeft
  `{cards (gepland in week), stack (ongepland), balance, streak}`.
- `POST /api/cards`, `PATCH /api/cards/:id`, `DELETE /api/cards/:id` — volgens regels §5.
- `POST /api/cards/:id/done`, `POST /api/cards/:id/undone`.
- `POST /api/cards/:id/approve`, `POST /api/cards/:id/reject` (O).
- `GET /api/recurrences?profileId=`, `POST`, `PATCH /:id`, `DELETE /:id` (O).
- `GET /api/rewards`; `POST`, `PATCH /:id`, `DELETE /:id` (O).
- `POST /api/redemptions {rewardId}` (kind, eigen profiel); `GET /api/redemptions?profileId=`.
- `POST /api/redemptions/:id/approve`, `/deny` (O).
- `GET /api/approvals` (O) — `{cards: [...wacht], redemptions: [...wacht]}`.
- `GET /api/profiles` `POST`, `PATCH /:id`, `DELETE /:id` (O) — gezin beheren.
- `GET /api/overview?date=` (P) — per kind: kaarten van die dag, saldo, streak.
- `GET /api/kids/:id/summary` (P) — `{balance, streak, todayTotal, todayDone, pendingApprovals}`
  voor Home Assistant REST-sensoren.

## 7. Schermen

1. **Profielkiezer** — grote avatars. Ouder-avatar vraagt pin (numeriek toetsenbord).
2. **Weekbord** — kolommen ma–zo, rijen dagdelen. Vandaag gemarkeerd. Boven:
   naam, saldo (ster), streak (vlam), week-navigatie, knop dag-zoom. Onder of
   rechts: de stapel als lade. Plus-knop voor eigen kaart. Kaart tikken → paneel:
   afvinken, verplaatsen naar stapel, bewerken/verwijderen indien toegestaan.
3. **Dag-zoom** — één dag, vier grote secties, kaarten groot, tijd getoond.
4. **Winkeltje** — raster met beloningen, prijs, knop "Kies" (uit als saldo te laag).
   Eigen aanvragen met status.
5. **Ouderpaneel** — tabs: Goedkeuren, Kaarten (per kind, inclusief herhalingen),
   Beloningen, Gezin. Ouder kan ook het weekbord van elk kind openen en slepen.
6. **Gezinsoverzicht** (`/overzicht`) — alleen-lezen, vandaag per kind, groot,
   ververst zichzelf elke minuut. Geen login.

Dichtheid `simpel`: kaart toont groot icoon, titel klein eronder, geen notitie,
geen tijd tenzij gezet; kolommen breder door horizontaal scrollen op iPad-portret.

## 8. Techniek

- Monorepo met `backend/` en `frontend/`, TypeScript.
- Backend: Node 24, Express, `node:sqlite` (ingebouwd, geen native build), zod voor
  invoer, vitest voor tests. Eén databasebestand in `data/`.
- Frontend: React 18, Vite, `@dnd-kit/core` voor slepen (touch en muis),
  `canvas-confetti`. Eigen CSS met variabelen, geen framework. Emoji als iconen
  uit een vaste, gegroepeerde set (school, sport, thuis, leuk).
- PWA-manifest zodat het als icoon op het iPad-beginscherm kan.
- Docker: multi-stage build, frontend statisch geserveerd door de backend,
  volume voor `data/`. `docker-compose.yml` meegeleverd.
- Seed bij lege database: profielen Sepp, Liz, Papa, Mama (ouder-pin 1234, te
  wijzigen), een paar voorbeeldbeloningen.

## 9. Testen

- Backend: vitest tegen een in-memory SQLite. Dekt de regels van §5: rechten
  kind/ouder, punten en goedkeuring, saldo en reservering, herhalingen
  materialiseren zonder dubbelen, streak-berekening, overzicht-endpoint.
- Frontend: typecheck en build; handmatige controle in de browser van slepen,
  afvinken, winkeltje en ouderpaneel.
