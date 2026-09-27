import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { configFromEnv, dayPartFor, defaultIcon, icsToEvents, parseCalendars, resolveTargets, routeByTag, storeEvents, syncRange } from '../src/services/caldav.js';
import { listProfiles } from '../src/services/profiles.js';
import { appWith, as, loginAs, testDb } from './helpers.js';

const RANGE = { from: '2026-09-07', toExclusive: '2026-10-05' };
const vcal = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\n${body}\nEND:VCALENDAR`;

let db: Db;
beforeEach(() => { db = testDb(); });

describe('routeByTag', () => {
  it('zonder tag naar Gezin, met (s) naar Sepp, (l) naar Liz, tag verdwijnt uit titel', () => {
    const ps = listProfiles(db);
    const fam = ps.find((p) => p.role === 'family')!.id;
    expect(routeByTag('Oma jarig', ps)).toEqual({ title: 'Oma jarig', profileIds: [fam] });
    expect(routeByTag('Voetbal (s)', ps)).toEqual({ title: 'Voetbal', profileIds: [1] });
    expect(routeByTag('Zwemles (L)', ps)).toEqual({ title: 'Zwemles', profileIds: [2] });
    expect(routeByTag('Kapper (Sepp)', ps)).toEqual({ title: 'Kapper', profileIds: [1] });
  });
  it('meerdere kinderen: (s,l), (s+l) en (s)(l)', () => {
    const ps = listProfiles(db);
    expect(routeByTag('Tandarts (s,l)', ps).profileIds.sort()).toEqual([1, 2]);
    expect(routeByTag('Tandarts (s+l)', ps).profileIds.sort()).toEqual([1, 2]);
    expect(routeByTag('Tandarts (s)(l)', ps).profileIds.sort()).toEqual([1, 2]);
  });
  it('ouders via eigen tag, ook met &, en (l & e) geeft twee kaarten', () => {
    db.prepare("update profiles set tag='m' where name='Papa'").run();
    db.prepare("update profiles set tag='e' where name='Mama'").run();
    const ps = listProfiles(db);
    expect(routeByTag('Vergadering (m)', ps)).toEqual({ title: 'Vergadering', profileIds: [3] });
    expect(routeByTag('Grote Club Actie (KSV) (l & e)', ps)).toEqual({ title: 'Grote Club Actie (KSV)', profileIds: [2, 4] });
    expect(routeByTag('Sporten (E)', ps).profileIds).toEqual([4]);
  });
  it('zonder tag op een ouder gaat (m) naar Gezin met tag in de titel', () => {
    const ps = listProfiles(db);
    const r = routeByTag('Vergadering (m)', ps);
    expect(r.title).toBe('Vergadering (m)');
    expect(r.profileIds).toEqual([ps.find((p) => p.role === 'family')!.id]);
  });
  it('onbekende haakjes blijven staan en gaan naar Gezin', () => {
    const ps = listProfiles(db);
    const r = routeByTag('Uit eten (met oma)', ps);
    expect(r.title).toBe('Uit eten (met oma)');
    expect(r.profileIds).toEqual([ps.find((p) => p.role === 'family')!.id]);
  });
});

describe('meerdere agenda\'s', () => {
  it('parseCalendars en oude CALDAV_CALENDAR', () => {
    expect(parseCalendars('Family=gezin, Sepp en Liz=Sepp+Liz')).toEqual([
      { name: 'Family', targets: ['gezin'] }, { name: 'Sepp en Liz', targets: ['Sepp', 'Liz'] },
    ]);
    expect(parseCalendars('Family')).toEqual([{ name: 'Family', targets: ['gezin'] }]);
    const cfg = configFromEnv({ CALDAV_USER: 'u', CALDAV_PASSWORD: 'p', CALDAV_CALENDAR: 'Family' } as NodeJS.ProcessEnv);
    expect(cfg?.calendars).toEqual([{ name: 'Family', targets: ['gezin'] }]);
    expect(configFromEnv({ CALDAV_USER: 'u' } as NodeJS.ProcessEnv)).toBeNull();
  });
  it('resolveTargets: namen, tags en gezin; onbekend geeft fout', () => {
    const ps = listProfiles(db);
    const fam = ps.find((p) => p.role === 'family')!.id;
    expect(resolveTargets(['Sepp', 'liz'], ps)).toEqual([1, 2]);
    expect(resolveTargets(['s', 'l'], ps)).toEqual([1, 2]);
    expect(resolveTargets(['gezin'], ps)).toEqual([fam]);
    expect(() => resolveTargets(['Oma'], ps)).toThrow(/Oma/);
  });
  it('kinderagenda zonder tag gaat naar beide kinderen, met tag naar één', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([
      vcal('BEGIN:VEVENT\nUID:k1\nDTSTART;TZID=Europe/Amsterdam:20260916T100000\nDTEND;TZID=Europe/Amsterdam:20260916T110000\nSUMMARY:Schoolreisje\nEND:VEVENT'),
      vcal('BEGIN:VEVENT\nUID:k2\nDTSTART;TZID=Europe/Amsterdam:20260917T183000\nDTEND;TZID=Europe/Amsterdam:20260917T193000\nSUMMARY:Voetbaltraining (s)\nEND:VEVENT'),
    ], RANGE, ps, [1, 2]);
    expect(ev.map((e) => [e.profileId, e.title])).toEqual([[1, 'Schoolreisje'], [2, 'Schoolreisje'], [1, 'Voetbaltraining']]);
  });
});

describe('dayPartFor', () => {
  it('grenzen', () => {
    expect(dayPartFor(null)).toBe('ochtend');
    expect(dayPartFor('11:59')).toBe('ochtend');
    expect(dayPartFor('12:00')).toBe('middag');
    expect(dayPartFor('15:00')).toBe('namiddag');
    expect(dayPartFor('18:00')).toBe('avond');
  });
});

describe('icsToEvents', () => {
  it('losse afspraak met tijd in Amsterdamse tijd', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:a1\nDTSTART;TZID=Europe/Amsterdam:20260915T163000\nDTEND;TZID=Europe/Amsterdam:20260915T173000\nSUMMARY:Voetbal (s)\nLOCATION:Sportpark\nEND:VEVENT')], RANGE, ps);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ profileId: 1, title: 'Voetbal', date: '2026-09-15', dayPart: 'namiddag', time: '16:30', allDay: false, location: 'Sportpark' });
  });
  it('UTC-tijd wordt omgerekend naar lokale tijd', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:a2\nDTSTART:20260915T170000Z\nDTEND:20260915T180000Z\nSUMMARY:Bellen\nEND:VEVENT')], RANGE, ps);
    expect(ev[0]).toMatchObject({ date: '2026-09-15', time: '19:00', dayPart: 'avond' });
  });
  it('hele dag en meerdaags: elke dag een kaart, einde exclusief', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:v1\nDTSTART;VALUE=DATE:20260919\nDTEND;VALUE=DATE:20260922\nSUMMARY:Vakantie\nEND:VEVENT')], RANGE, ps);
    expect(ev.map((e) => e.date)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
    expect(ev.every((e) => e.allDay && e.time === null && e.dayPart === 'ochtend')).toBe(true);
  });
  it('wekelijkse herhaling wordt uitgerold binnen het bereik, met uitzondering', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:r1\nDTSTART;TZID=Europe/Amsterdam:20260908T150000\nDTEND;TZID=Europe/Amsterdam:20260908T160000\nRRULE:FREQ=WEEKLY\nEXDATE;TZID=Europe/Amsterdam:20260922T150000\nSUMMARY:Muziekles (l)\nEND:VEVENT')], RANGE, ps);
    expect(ev.map((e) => e.date)).toEqual(['2026-09-08', '2026-09-15', '2026-09-29']);
    expect(ev[0]).toMatchObject({ profileId: 2, dayPart: 'namiddag', time: '15:00' });
  });
  it('hele-dag-herhaling op di+do valt op precies die dagen, één dag per keer', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:ob\nDTSTART;VALUE=DATE:20260106\nDTEND;VALUE=DATE:20260107\nRRULE:FREQ=WEEKLY;UNTIL=20261231;BYDAY=TU,TH\nSUMMARY:Oma oppassen\nEND:VEVENT')], { from: '2026-09-07', toExclusive: '2026-09-21' }, ps);
    expect(ev.map((e) => e.date)).toEqual(['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17']);
    expect(ev.every((e) => e.allDay && e.time === null)).toBe(true);
  });
  it('herhalende afspraak houdt de kloktijd over de zomertijdgrens', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:dst\nDTSTART;TZID=Europe/Amsterdam:20261019T183000\nDTEND;TZID=Europe/Amsterdam:20261019T193000\nRRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:Training\nEND:VEVENT')], { from: '2026-10-19', toExclusive: '2026-11-09' }, ps);
    expect(ev.map((e) => `${e.date} ${e.time}`)).toEqual(['2026-10-19 18:30', '2026-10-26 18:30', '2026-11-02 18:30']);
  });
  it('afspraak voor twee kinderen geeft twee kaarten; geannuleerd wordt overgeslagen', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([
      vcal('BEGIN:VEVENT\nUID:t1\nDTSTART;TZID=Europe/Amsterdam:20260910T090000\nDTEND;TZID=Europe/Amsterdam:20260910T093000\nSUMMARY:Tandarts (s,l)\nEND:VEVENT'),
      vcal('BEGIN:VEVENT\nUID:c1\nDTSTART;TZID=Europe/Amsterdam:20260911T090000\nDTEND;TZID=Europe/Amsterdam:20260911T093000\nSTATUS:CANCELLED\nSUMMARY:Weg\nEND:VEVENT'),
    ], RANGE, ps);
    expect(ev.map((e) => [e.profileId, e.title])).toEqual([[1, 'Tandarts'], [2, 'Tandarts']]);
  });
  it('buiten bereik valt weg', () => {
    const ps = listProfiles(db);
    const ev = icsToEvents([vcal('BEGIN:VEVENT\nUID:o1\nDTSTART;TZID=Europe/Amsterdam:20261201T090000\nDTEND;TZID=Europe/Amsterdam:20261201T093000\nSUMMARY:Later\nEND:VEVENT')], RANGE, ps);
    expect(ev).toHaveLength(0);
  });
});

describe('opslag en weergave', () => {
  it('storeEvents vervangt het bereik; week en gezinsweek tonen ze alleen-lezen', async () => {
    const ps = listProfiles(db);
    const fam = ps.find((p) => p.role === 'family')!.id;
    storeEvents(db, [
      { uid: 'x', profileId: 1, title: 'Voetbal', date: '2026-09-15', dayPart: 'namiddag', time: '16:30', allDay: false, location: '' },
      { uid: 'y', profileId: fam, title: 'Oma jarig', date: '2026-09-13', dayPart: 'middag', time: '14:00', allDay: false, location: '' },
    ], RANGE);
    storeEvents(db, [
      { uid: 'x', profileId: 1, title: 'Voetbal', date: '2026-09-15', dayPart: 'namiddag', time: '17:00', allDay: false, location: '' },
    ], RANGE);
    const app = appWith(db);
    const sepp = as(app, await loginAs(app, 'Sepp'));
    const w = await sepp.get('/api/kids/1/week?start=2026-09-14');
    expect(w.body.cards).toHaveLength(1);
    expect(w.body.cards[0]).toMatchObject({ title: 'Voetbal', time: '17:00', source: 'apple' });
    expect(w.body.cards[0].id).toBeLessThan(0);
    // vorige week: Oma jarig is weg door de vervanging
    const prev = await sepp.get('/api/kids/1/week?start=2026-09-07');
    expect(prev.body.family).toHaveLength(0);
    // streak en summary tellen afspraken niet als taken
    const fw = await sepp.get('/api/family-week?start=2026-09-14');
    expect(fw.body.members.find((m: any) => m.profile.name === 'Sepp').cards[0].source).toBe('apple');
  });
  it('syncRange loopt van vorige week tot acht weken vooruit', () => {
    expect(syncRange('2026-09-13')).toEqual({ from: '2026-08-31', toExclusive: '2026-11-02' });
  });
  it('sync-status en sync-now zijn voor ouders; zonder configuratie 409', async () => {
    const app = appWith(db);
    const papa = as(app, await loginAs(app, 'Papa'));
    const sepp = as(app, await loginAs(app, 'Sepp'));
    expect((await sepp.get('/api/sync/status')).status).toBe(403);
    const st = await papa.get('/api/sync/status');
    expect(st.body).toMatchObject({ configured: false, count: 0, calendars: [] });
    expect((await papa.post('/api/sync/now')).status).toBe(409);
  });
});

describe('geïmporteerde afspraken: kleur, icoon, afvinken', () => {
  it('kleur van het bord, standaardicoon op trefwoord, icoon-override per titel, afvinken en ongedaan maken', async () => {
    storeEvents(db, [
      { uid: 'v', profileId: 1, title: 'Voetbaltraining', date: '2026-09-14', dayPart: 'avond', time: '18:30', allDay: false, location: '' },
      { uid: 'v', profileId: 1, title: 'Voetbaltraining', date: '2026-09-16', dayPart: 'avond', time: '18:30', allDay: false, location: '' },
      { uid: 'x', profileId: 1, title: 'Iets onbekends', date: '2026-09-15', dayPart: 'ochtend', time: null, allDay: true, location: '' },
    ], RANGE);
    const app = appWith(db);
    const sepp = as(app, await loginAs(app, 'Sepp'));
    const liz = as(app, await loginAs(app, 'Liz'));
    const w = () => sepp.get('/api/kids/1/week?start=2026-09-14').then((r) => r.body.cards as any[]);
    let cards = await w();
    expect(cards.every((c) => c.color === '#7dd3fc')).toBe(true); // Sepp is blauw
    expect(cards.find((c) => c.title === 'Voetbaltraining').icon).toBe('⚽');
    expect(cards.find((c) => c.title === 'Iets onbekends').icon).toBe('📅');
    const first = cards.find((c) => c.title === 'Voetbaltraining');
    // icoon aanpassen geldt voor alle Voetbaltraining-kaarten
    expect((await sepp.patch(`/api/cards/${first.id}`, { icon: '🥅' })).body.icon).toBe('🥅');
    cards = await w();
    expect(cards.filter((c) => c.title === 'Voetbaltraining').map((c) => c.icon)).toEqual(['🥅', '🥅']);
    // andere velden niet toegestaan
    expect((await sepp.patch(`/api/cards/${first.id}`, { title: 'X' })).status).toBe(400);
    // afvinken
    const d = await sepp.post(`/api/cards/${first.id}/done`);
    expect(d.status).toBe(200);
    expect(d.body.done_at).toBeTruthy();
    expect(d.body.needsApproval).toBe(false);
    expect((await w()).find((c) => c.id === first.id).done_at).toBeTruthy();
    expect((await sepp.post(`/api/cards/${first.id}/undone`)).body.done_at).toBeNull();
    // ander kind mag niet
    expect((await liz.post(`/api/cards/${first.id}/done`)).status).toBe(403);
    expect((await sepp.post('/api/cards/-99999/done')).status).toBe(404);
  });
  it('afvinken overleeft een nieuwe sync (zelfde uid en datum)', async () => {
    storeEvents(db, [{ uid: 'v', profileId: 1, title: 'Voetbaltraining', date: '2026-09-14', dayPart: 'avond', time: '18:30', allDay: false, location: '' }], RANGE);
    const app = appWith(db);
    const sepp = as(app, await loginAs(app, 'Sepp'));
    const id = (await sepp.get('/api/kids/1/week?start=2026-09-14')).body.cards[0].id;
    await sepp.post(`/api/cards/${id}/done`);
    storeEvents(db, [{ uid: 'v', profileId: 1, title: 'Voetbaltraining', date: '2026-09-14', dayPart: 'avond', time: '18:30', allDay: false, location: '' }], RANGE);
    expect((await sepp.get('/api/kids/1/week?start=2026-09-14')).body.cards[0].done_at).toBeTruthy();
  });
  it('defaultIcon', () => {
    expect(defaultIcon('Keeperstraining', false)).toBe('⚽');
    expect(defaultIcon('Tandarts controle', false)).toBe('🦷');
    expect(defaultIcon('Oma Bep oppassen', true)).toBe('👵');
    expect(defaultIcon('Boesjer', false)).toBe('🗓️');
    expect(defaultIcon('Sportschool Rick', false)).toBe('🏃');
    expect(defaultIcon('Studiedag school', true)).toBe('🏫');
  });
});

describe('sterren op agenda-afspraken', () => {
  const zwem = (date: string) => ({ uid: 'z', profileId: 1, title: 'Zwemles', date, dayPart: 'middag' as const, time: '13:00', allDay: false, location: '' });
  async function setup() {
    storeEvents(db, [zwem('2026-09-14'), zwem('2026-09-21')], RANGE);
    const app = appWith(db);
    const sepp = as(app, await loginAs(app, 'Sepp'));
    const papa = as(app, await loginAs(app, 'Papa'));
    const week = async (start: string) => (await sepp.get(`/api/kids/1/week?start=${start}`)).body;
    const zwemId = async (start: string) => (await week(start)).cards.find((c: any) => c.title === 'Zwemles').id as number;
    return { sepp, papa, week, zwemId };
  }

  it('per titel voor alle keren, per keer overschrijft; alleen ouders', async () => {
    const { sepp, papa, week, zwemId } = await setup();
    const id14 = await zwemId('2026-09-14');
    expect((await sepp.patch(`/api/cards/${id14}`, { points: 2, scope: 'title' })).status).toBe(403);
    expect((await papa.patch(`/api/cards/${id14}`, { points: 2, scope: 'title' })).body.points).toBe(2);
    expect((await week('2026-09-21')).cards[0].points).toBe(2);
    expect((await papa.patch(`/api/cards/${id14}`, { points: 5, scope: 'once' })).body.points).toBe(5);
    expect((await week('2026-09-21')).cards[0].points).toBe(2);
    // weer per titel zetten haalt de uitzondering voor deze keer weg
    await papa.patch(`/api/cards/${id14}`, { points: 3, scope: 'title' });
    expect((await week('2026-09-14')).cards[0].points).toBe(3);
  });

  it('afvinken wacht op goedkeuring; saldo telt pas daarna; sterren staan vast na sync en wijziging', async () => {
    const { sepp, papa, week, zwemId } = await setup();
    const id = await zwemId('2026-09-14');
    await papa.patch(`/api/cards/${id}`, { points: 2, scope: 'title' });
    const d = await sepp.post(`/api/cards/${id}/done`);
    expect(d.body.needsApproval).toBe(true);
    expect((await week('2026-09-14')).balance).toBe(0);
    const pending = (await papa.get('/api/approvals')).body.external;
    expect(pending).toMatchObject([{ title: 'Zwemles', points: 2, date: '2026-09-14', profile: { name: 'Sepp' } }]);
    expect((await papa.post(`/api/external-done/${pending[0].doneId}/approve`)).status).toBe(204);
    expect((await week('2026-09-14')).balance).toBe(2);
    expect((await papa.get('/api/approvals')).body.external).toEqual([]);
    // kind kan niet meer ontvinken; ouder kan de sterren niet meer wijzigen
    expect((await sepp.post(`/api/cards/${id}/undone`)).status).toBe(409);
    expect((await papa.patch(`/api/cards/${id}`, { points: 9, scope: 'once' })).status).toBe(409);
    // per-titel aanpassen raakt de goedgekeurde niet
    await papa.patch(`/api/cards/${await zwemId('2026-09-21')}`, { points: 7, scope: 'title' });
    storeEvents(db, [zwem('2026-09-21')], RANGE); // afspraak van de 14e is uit de agenda verdwenen
    expect((await week('2026-09-14')).balance).toBe(2);
  });

  it('afwijzen zet terug op open; zonder sterren geen goedkeuring nodig', async () => {
    const { sepp, papa, week, zwemId } = await setup();
    const id = await zwemId('2026-09-14');
    expect((await sepp.post(`/api/cards/${id}/done`)).body.needsApproval).toBe(false);
    expect((await papa.get('/api/approvals')).body.external).toEqual([]);
    await papa.patch(`/api/cards/${id}`, { points: 1, scope: 'once' });
    const [p] = (await papa.get('/api/approvals')).body.external;
    await papa.post(`/api/external-done/${p.doneId}/reject`);
    expect((await week('2026-09-14')).cards[0].done_at).toBeNull();
  });

  it('goedkeuren vanaf de kaart', async () => {
    const { sepp, papa, week, zwemId } = await setup();
    const id = await zwemId('2026-09-14');
    await papa.patch(`/api/cards/${id}`, { points: 4, scope: 'once' });
    expect((await papa.post(`/api/cards/${id}/approve`)).status).toBe(409);
    await sepp.post(`/api/cards/${id}/done`);
    expect((await papa.post(`/api/cards/${id}/approve`)).status).toBe(204);
    const c = (await week('2026-09-14')).cards[0];
    expect(c.approved_at).toBeTruthy();
    expect((await week('2026-09-14')).balance).toBe(4);
  });
});
