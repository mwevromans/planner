# Huiswerkhulp — ontwerp

Datum: 2026-09-19
Status: goedgekeurd voor bouw (motor Claude Code of Codex, vrij chatten met monitoring)

## 1. Doel

Sepp (10, groep 6) en Liz (7, groep 4) kunnen in de planner chatten met een AI-huiswerkhulp
die **helpt maar niet het werk doet**: vragen terug, hints, uitleg in hun eigen woorden laten
herhalen. Onderwerpen: rekenen en spelling (beiden), lezen (Sepp), en algemene kennis
(nieuwsgierige vragen krijgen een begrijpelijke uitleg, met een denkvraag terug).
Ouders lezen alles mee. Geen API-tokens: de motor is Claude Code of Codex CLI op de host,
onder het abonnement van de gebruiker.

## 2. Wat erin zit

- Chatscherm per kind (`#/hulp/:kidId`), te openen via 💬 Hulp op het bord en via
  "Hulp nodig?" op een kaart (titel en notitie gaan mee als context).
- Grote letters, korte antwoorden, voorleesknop (SpeechSynthesis nl-NL), "Nieuw gesprek".
- Dagplafond per kind (standaard 40 berichten), door ouders instelbaar; aan/uit per kind.
- Ouderpaneel-tabblad "Huiswerkhulp": alle gesprekken per kind, ongelezen-teller, transcript,
  plafond en aan/uit, motorkeuze per kind (claude | codex), per-kind-tekst van de .md bewerken.
- Alle berichten opgeslagen in de planner-database, onafhankelijk van de motor.
- Tussenstuk op de host (`tutor-bridge`): systemd-service, eigen gebruiker `tutor`, lege
  werkmap, luistert op de docker-bridge, gedeeld geheim in header. Roept `claude -p` of
  `codex exec` aan met de .md als systeemprompt, tools uit, geen gebruikersinstellingen.

## 3. Wat er niet in zit

- Foto's van huiswerk meesturen (Codex kan `-i`, later).
- Automatische signalering van "verdachte" gesprekken; ouders lezen zelf.
- Gebruik buiten het thuisnetwerk.

## 4. Onderdelen

### tutor-bridge (host, `tutor-bridge/`)
Node 24, geen dependencies. `POST /chat {engine, systemPrompt, message, sessionId?}` →
`{reply, sessionId, engine, durationMs}`. `GET /health`.
- claude: `claude -p --output-format json --model sonnet --tools "" --setting-sources ""
  --no-session-persistence?` Nee: sessies zijn nodig om door te praten → persistentie aan,
  `--resume <id>` voor vervolg, `--system-prompt-file <tmp>`. Antwoord-JSON bevat
  `result` en `session_id`.
- codex: `codex exec --json --sandbox read-only --skip-git-repo-check --ephemeral? Nee
  (thread nodig) -C <lege map> -m <model> "<prompt>"`; vervolg via
  `codex exec resume <thread-id>`. Systeemprompt: Codex kent geen vlag → eerste bericht bevat
  de .md als instructie, vervolgberichten alleen de vraag. Exacte vlaggen bij bouw verifiëren.
- Timeout 90 s, één proces per gesprek tegelijk (mutex per sessionId), fouten als
  `{error}` met status 502.
- Beveiliging: alleen bereikbaar via docker-bridge-IP, header `x-tutor-secret` (uit `.env`).

### Planner backend
Tabellen:
- `tutor_settings(profile_id pk, enabled int, daily_cap int, engine text, extra_prompt text)`
- `tutor_conversations(id, profile_id, engine, session_id, started_at, card_title, last_at, read_by_parent int)`
- `tutor_messages(id, conversation_id, role kid|tutor, text, created_at)`
Routes (kind: eigen profiel; ouder: alles):
- `GET /api/tutor/:kidId/conversations`, `GET /api/tutor/conversations/:id`
- `POST /api/tutor/:kidId/conversations {cardId?}` → nieuw gesprek (context uit kaart)
- `POST /api/tutor/conversations/:id/messages {text}` → plafondcheck, bridge-call, opslaan,
  antwoord terug. 429 bij plafond, 409 als uit.
- `GET/PATCH /api/tutor/settings/:kidId` (O), `POST /api/tutor/conversations/:id/read` (O)
- `GET /api/tutor/status` (O): bridge bereikbaar, motoren beschikbaar.
Systeemprompt = `tutor/basis.md` + `tutor/<naam>.md` (in repo, in image) + `extra_prompt`
uit de instellingen + kaartcontext.

### Frontend
- `screens/Tutor.tsx`: berichtenlijst, invoer, verzenden, voorlezen, nieuw gesprek,
  plafond-melding. Platte tekst met regelafbrekingen, geen markdown-rendering.
- Knop 💬 in Header voor kinderen; "Hulp nodig?" in CardPanel voor kaarten op eigen bord.
- Ouderpaneel: `parent/TutorTab.tsx`.

## 5. Regels

- Kind ziet en schrijft alleen in eigen gesprekken. Ouder leest alles, schrijft niet.
- Plafond telt berichten van het kind per kalenderdag (Europe/Amsterdam).
- Motor uit of bridge onbereikbaar: kind krijgt vriendelijke melding, geen technische tekst.
- Elk bericht en antwoord wordt opgeslagen vóór het antwoord wordt teruggegeven.

## 6. Testen

- Bridge: unit-test op commando-opbouw en JSON-parsing met gemockte child_process.
- Backend: rechten, plafond, opslag, uit-schakelaar, met gemockte bridge.
- Inhoud: voor livegang met beide motoren een nagespeeld kind dat het antwoord probeert los te
  krijgen (rekenen, spelling, lezen, algemene kennis); transcript aan de gebruiker tonen.
