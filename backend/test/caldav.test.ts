import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../src/db.js';
import { dayPartFor, icsToEvents, routeByTag, storeEvents, syncRange } from '../src/services/caldav.js';
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
  it('onbekende haakjes blijven staan en gaan naar Gezin', () => {
    const ps = listProfiles(db);
    const r = routeByTag('Uit eten (met oma)', ps);
    expect(r.title).toBe('Uit eten (met oma)');
    expect(r.profileIds).toEqual([ps.find((p) => p.role === 'family')!.id]);
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
    expect(st.body).toMatchObject({ configured: false, count: 0 });
    expect((await papa.post('/api/sync/now')).status).toBe(409);
  });
});
