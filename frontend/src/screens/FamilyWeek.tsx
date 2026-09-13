import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { CardInner, cardStatus } from '../components/Card';
import { addDays, DOW, dom, today, weekLabel, weekStart } from '../dates';
import { DAY_PART_LABEL, type Card, type FamilyWeek as FamilyWeekData } from '../types';

/** Alleen-lezen weekbord van het hele gezin, voor het wanddashboard. */
export function FamilyWeek() {
  const [start, setStart] = useState(() => weekStart(today()));
  const [data, setData] = useState<FamilyWeekData | null>(null);
  const t = today();

  useEffect(() => {
    const load = () => api.familyWeek(start).then(setData).catch(() => undefined);
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [start]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const order = (c: Card) => ['ochtend', 'middag', 'namiddag', 'avond'].indexOf(c.day_part ?? '');

  return (
    <div className="screen">
      <div className="header">
        <h1 style={{ fontSize: 26 }}>🏠 Gezinsweek</h1>
        <div className="weeknav">
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Vorige week">‹</button>
          <span className="label">{weekLabel(start)}</span>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Volgende week">›</button>
          {start !== weekStart(t) && <button className="btn btn-small" onClick={() => setStart(weekStart(t))}>Deze week</button>}
        </div>
        <span className="spacer" />
        <a className="btn btn-small" href="#/overzicht">📅 Vandaag</a>
        <a className="btn btn-ghost muted" href="#/">Inloggen</a>
      </div>
      {!data && <div className="center muted">Laden…</div>}
      {data && (
        <div className="board-scroll">
          <div className="family-board" style={{ gridTemplateRows: `auto repeat(${data.members.length}, minmax(90px, auto))` }}>
            <div />
            {days.map((d, i) => (
              <div key={d} className={`day-head ${d === t ? 'today' : ''}`}>
                <button style={{ cursor: 'default' }}><span className="dow">{DOW[i]}</span><span className="dom">{dom(d)}</span></button>
              </div>
            ))}
            {data.members.map((m) => (
              <MemberRow key={m.profile.id} m={m} days={days} today={t} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({ m, days, today, order }: { m: FamilyWeekData['members'][number]; days: string[]; today: string; order: (c: Card) => number }) {
  return (
    <>
      <div className="member-head">
        <Avatar profile={m.profile} size={44} />
        <span>{m.profile.name}</span>
      </div>
      {days.map((d) => {
        const items = m.cards.filter((c) => c.planned_date === d).sort((a, b) => order(a) - order(b) || (a.time ?? '').localeCompare(b.time ?? ''));
        return (
          <div key={d} className={`cell ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${m.profile.role === 'family' ? 'family-row' : ''}`}>
            {items.map((c) => (
              <div key={c.id} className={`card compact ${cardStatus(c) !== 'open' ? 'done' : ''}`} style={{ background: c.color }} title={c.day_part ? DAY_PART_LABEL[c.day_part].label : ''}>
                <CardInner card={c} showDeadline={false} />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
